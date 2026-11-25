#!/usr/bin/env bash
# NexusID — stop the whole dev stack started by dev-start.sh (or by hand).
#
#   bash dev-stop.sh         # backend, web, Shop A, issuers, ML, Metro, emulator
#   bash dev-stop.sh --db    # … and also stop the nexusid-postgres container
#
# Safe: only stops processes whose working directory is inside this repo, plus whatever
# listens on the NexusID ports. It never touches other projects' node/vite/next processes.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG="$ROOT/.dev-logs"
PORTS=(3000 3001 4000 4001 4002 4003 4004 5001 8081)
ADB="${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb"

DB=0
for a in "$@"; do
  case "$a" in
    --db) DB=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Unknown option: $a (try --help)"; exit 1 ;;
  esac
done

echo "=== 1. Process groups started by dev-start.sh ==="
shopt -s nullglob
for f in "$LOG"/*.pid; do
  name="$(basename "$f" .pid)"
  pgid="$(cat "$f")"
  [ "$name" = emulator ] && { rm -f "$f"; continue; } # emulator is shut down cleanly below
  if kill -0 -- "-$pgid" 2>/dev/null; then
    kill -TERM -- "-$pgid" 2>/dev/null && echo "  • stopped $name"
  fi
  rm -f "$f"
done

echo "=== 2. Dev servers inside this repo (started by hand) ==="
# Only real server processes: the executable must be node / python / next-server / esbuild, its working
# directory must be inside this repo, and its command must be one of the dev servers. Shells, editors and
# this script are never matched (their own command lines may mention these words).
found=0
for pid in $(pgrep -f 'tsx watch|next dev|next-server|vite|react-native start|concurrently|app\.py' 2>/dev/null); do
  [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ] && continue
  comm="$(cat "/proc/$pid/comm" 2>/dev/null || true)"
  case "$comm" in node|python*|next-server*|esbuild) ;; *) continue ;; esac
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  case "$cwd" in
    "$ROOT"|"$ROOT"/*)
      echo "  • stopped $(tr '\0' ' ' </proc/$pid/cmdline 2>/dev/null | sed "s#$ROOT/##g" | cut -c1-70)"
      kill -TERM "$pid" 2>/dev/null; found=1 ;;
  esac
done
[ "$found" = 0 ] && echo "  • none"

echo "=== 3. Android emulator ==="
if [ -x "$ADB" ] && "$ADB" devices 2>/dev/null | grep -q '^emulator-'; then
  "$ADB" emu kill >/dev/null 2>&1 && echo "  • emulator shutting down"
else
  echo "  • not running"
fi

sleep 2
echo "=== 4. Anything still on the NexusID ports ==="
left=0
for p in "${PORTS[@]}"; do
  for pid in $(ss -ltnpH "sport = :$p" 2>/dev/null | grep -o "pid=[0-9]*" | cut -d= -f2 | sort -u); do
    kill -KILL "$pid" 2>/dev/null && { echo "  • force-stopped pid $pid on :$p"; left=1; }
  done
done
[ "$left" = 0 ] && echo "  • all free: ${PORTS[*]}"

if [ "$DB" = 1 ]; then
  echo "=== 5. Postgres ==="
  docker stop nexusid-postgres >/dev/null 2>&1 && echo "  • nexusid-postgres stopped" || echo "  • nexusid-postgres not running"
else
  echo "(Postgres left running — use --db to stop it too.)"
fi
