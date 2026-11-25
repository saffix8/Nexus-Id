#!/usr/bin/env bash
# NexusID — start the whole dev stack.
#
#   bash dev-start.sh            # Postgres, backend, web, Shop A, 4 issuers, ML service
#   bash dev-start.sh --mobile   # + Android emulator (NexusID_Lite) + Metro bundler
#   bash dev-stop.sh             # stop everything again (see that file)
#
# Every service runs in the background in its own process group and logs to .dev-logs/<name>.log:
#   tail -f .dev-logs/nadra.log      # NADRA sandbox OTP is printed here
#   tail -f .dev-logs/backend.log
# A service whose port is already in use is skipped (no EADDRINUSE crashes on a second run).

set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
LOG="$ROOT/.dev-logs"
mkdir -p "$LOG"

MOBILE=0
for a in "$@"; do
  case "$a" in
    --mobile) MOBILE=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Unknown option: $a (try --help)"; exit 1 ;;
  esac
done

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

# ss sees every listener (lsof misses some, e.g. next-server on :3000).
port_busy() { [ -n "$(ss -ltnH "sport = :$1" 2>/dev/null)" ]; }

# start <name> <port|-> <command...>
# Runs the command with setsid so it gets its own process group (dev-stop.sh kills the whole group,
# which also stops watchers like `tsx watch` and `concurrently`). PGID is saved to .dev-logs/<name>.pid.
start() {
  local name="$1" port="$2"; shift 2
  if [ "$port" != "-" ] && port_busy "$port"; then
    yellow "  • $name — port $port already in use, skipping"
    return
  fi
  setsid bash -c "$*" >"$LOG/$name.log" 2>&1 </dev/null &
  echo $! >"$LOG/$name.pid"
  local where=""; [ "$port" != "-" ] && where=" on :$port"
  echo "  • $name — starting$where (log: .dev-logs/$name.log)"
}

# wait_port <name> <port> <seconds>
wait_port() {
  local name="$1" port="$2" secs="$3" i
  for ((i = 0; i < secs; i++)); do
    if port_busy "$port"; then green "  ✓ $name up on :$port"; return 0; fi
    sleep 1
  done
  red "  ✗ $name not listening on :$port after ${secs}s — see .dev-logs/$name.log"
  return 1
}

echo "=== 1. Postgres (Docker) ==="
if docker ps --filter name=nexusid-postgres --format '{{.Status}}' | grep -q 'Up'; then
  green "  ✓ nexusid-postgres running on :5432"
else
  docker start nexusid-postgres >/dev/null && green "  ✓ started nexusid-postgres" || red "  ✗ could not start nexusid-postgres"
  sleep 3
fi

echo "=== 2. Prisma migrations ==="
npx prisma migrate status --schema=services/backend/prisma/schema.prisma 2>&1 | tail -1

# Emulator first: a cold boot takes about a minute, so it boots while the rest starts.
if [ "$MOBILE" = 1 ]; then
  echo "=== 3. Android emulator ==="
  if "${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb" devices 2>/dev/null | grep -q '^emulator-'; then
    yellow "  • emulator already running, skipping"
  else
    start emulator - "bash apps/mobile/scripts/emulator.sh"
  fi
fi

echo "=== 4. Services ==="
start backend  4000 "npm run dev -w services/backend"
start web      3000 "npm run dev -w apps/web"
start shop-a   3001 "npm run dev -w apps/demo-shop"
# Issuers read their own port env var; set it explicitly so a shared .env can't move them onto :4000.
start nadra    4001 "NADRA_PORT=4001 npm run dev -w services/issuers/nadra"
start hec      4002 "PORT=4002 npm run dev -w services/issuers/hec"
start au       4003 "PORT=4003 npm run dev -w services/issuers/air-university"
start linkedin 4004 "PORT=4004 npm run dev -w services/issuers/linkedin"
if [ -x services/ml/.venv/bin/python ]; then
  start ml     5001 "cd services/ml && ML_PORT=5001 .venv/bin/python app.py"
else
  yellow "  • ml — services/ml/.venv missing, skipping (python3 -m venv services/ml/.venv && services/ml/.venv/bin/pip install -r services/ml/requirements.txt)"
fi
if [ "$MOBILE" = 1 ]; then
  # React Native 0.88 needs Node 22 (apps/mobile/.nvmrc).
  start metro  8081 "source \$HOME/.nvm/nvm.sh && cd apps/mobile && nvm use --silent && npx react-native start"
fi

echo "=== 5. Waiting for ports ==="
wait_port backend 4000 40
wait_port nadra 4001 30
wait_port hec 4002 30
wait_port au 4003 30
wait_port linkedin 4004 30
[ -x services/ml/.venv/bin/python ] && wait_port ml 5001 30
wait_port shop-a 3001 30
wait_port web 3000 60
[ "$MOBILE" = 1 ] && wait_port metro 8081 60
curl -fs http://localhost:4000/health >/dev/null && green "  ✓ backend /health OK" || yellow "  • backend /health not answering yet"

echo ""
echo "================================================"
echo "  Web portal   http://localhost:3000"
echo "  Shop A       http://localhost:3001"
echo "  Backend      http://localhost:4000/health"
echo "  Issuers      :4001 NADRA  :4002 HEC  :4003 AU  :4004 LinkedIn"
echo "  ML service   http://localhost:5001"
[ "$MOBILE" = 1 ] && echo "  Metro        :8081 — open NexusID on the emulator (fingerprint: adb emu finger touch 1)"
echo ""
echo "  NADRA OTP    tail -f .dev-logs/nadra.log"
echo "  Stop all     bash dev-stop.sh"
echo "================================================"
