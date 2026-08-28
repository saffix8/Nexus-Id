#!/usr/bin/env bash
# scripts/demo.sh
#
# NexusID — One-command demo environment setup
# Run from the repo root: bash scripts/demo.sh
#
# What it does:
#  1. Verifies prerequisites (Docker, Node, npm)
#  2. Starts all services via docker-compose
#  3. Waits for PostgreSQL to be healthy
#  4. Runs Prisma migrations
#  5. Seeds the database (issuers, verifiers, demo user)
#  6. Generates RSA-2048 key pairs for all issuer microservices
#  7. Prints launch instructions

set -euo pipefail

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()    { echo -e "${BLUE}ℹ${RESET}  $*"; }
success() { echo -e "${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✗${RESET}  $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}$*${RESET}\n"; }

die() {
  error "$*"
  exit 1
}

# ---------------------------------------------------------------------------
# Repo root — script must be run from the root, or we resolve it
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}" || die "Cannot cd to repo root: ${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Step 0 — Banner
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗██╗██████╗ "
echo "  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝██║██╔══██╗"
echo "  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗██║██║  ██║"
echo "  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║██║██║  ██║"
echo "  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║██║██████╔╝"
echo "  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝╚═════╝ "
echo -e "${RESET}"
echo -e "  ${BOLD}Privacy-preserving digital identity verification${RESET}"
echo -e "  Demo Environment Setup\n"

# ---------------------------------------------------------------------------
# Step 1 — Prerequisite checks
# ---------------------------------------------------------------------------
header "Step 1 — Checking prerequisites"

# Docker
if ! command -v docker &>/dev/null; then
  die "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
fi

if ! docker info &>/dev/null; then
  die "Docker daemon is not running. Start Docker Desktop (or 'sudo systemctl start docker') and retry."
fi
success "Docker is running"

# docker compose (v2 plugin) or docker-compose (v1 standalone)
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
else
  die "Neither 'docker compose' (v2) nor 'docker-compose' (v1) found. Install Docker Compose."
fi
success "Docker Compose available ($($COMPOSE_CMD version --short 2>/dev/null || echo 'v1'))"

# Node.js
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install Node 20 LTS from https://nodejs.org"
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "${NODE_VERSION}" | cut -d. -f1)
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  die "Node.js ${NODE_VERSION} detected. NexusID requires Node 18+. Please upgrade."
fi
success "Node.js v${NODE_VERSION}"

# npm
if ! command -v npm &>/dev/null; then
  die "npm is not installed."
fi
success "npm $(npm --version)"

# ts-node (needed for key generation and seed script outside docker)
if ! command -v npx &>/dev/null; then
  die "npx is not available. Reinstall npm."
fi
success "npx available"

# ---------------------------------------------------------------------------
# Step 2 — Install dependencies (if node_modules is missing)
# ---------------------------------------------------------------------------
header "Step 2 — Installing dependencies"

if [[ ! -d "node_modules" ]]; then
  info "node_modules not found. Running npm install..."
  npm install || die "npm install failed"
  success "Dependencies installed"
else
  success "node_modules already present (skipping install)"
fi

# ---------------------------------------------------------------------------
# Step 3 — Start Docker services
# ---------------------------------------------------------------------------
header "Step 3 — Starting services via Docker Compose"

COMPOSE_FILE="infra/docker-compose.yml"
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  die "Compose file not found at ${COMPOSE_FILE}. Are you in the repo root?"
fi

info "Running: ${COMPOSE_CMD} -f ${COMPOSE_FILE} up -d"
${COMPOSE_CMD} -f "${COMPOSE_FILE}" up -d || die "docker-compose up failed"
success "All containers started"

# ---------------------------------------------------------------------------
# Step 4 — Wait for PostgreSQL to be healthy
# ---------------------------------------------------------------------------
header "Step 4 — Waiting for PostgreSQL"

POSTGRES_CONTAINER=""
# Try to detect the postgres container name from compose
POSTGRES_CONTAINER=$(${COMPOSE_CMD} -f "${COMPOSE_FILE}" ps -q postgres 2>/dev/null | head -1 || true)

MAX_WAIT=60   # seconds
WAIT_INTERVAL=3
ELAPSED=0

wait_for_postgres() {
  info "Waiting for PostgreSQL to accept connections (max ${MAX_WAIT}s)..."
  while true; do
    # Prefer docker inspect healthcheck; fall back to pg_isready in container
    if [[ -n "${POSTGRES_CONTAINER}" ]]; then
      STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${POSTGRES_CONTAINER}" 2>/dev/null || echo "unknown")
      if [[ "${STATUS}" == "healthy" ]]; then
        success "PostgreSQL is healthy"
        return 0
      fi
    fi

    # Fallback: try pg_isready via exec into the container
    if ${COMPOSE_CMD} -f "${COMPOSE_FILE}" exec -T postgres \
        pg_isready -U nexusid -d nexusid_db &>/dev/null; then
      success "PostgreSQL is accepting connections"
      return 0
    fi

    if [[ ${ELAPSED} -ge ${MAX_WAIT} ]]; then
      die "PostgreSQL did not become ready within ${MAX_WAIT}s. Check logs: ${COMPOSE_CMD} -f ${COMPOSE_FILE} logs postgres"
    fi

    printf "  ... waiting (%ds elapsed)\r" "${ELAPSED}"
    sleep "${WAIT_INTERVAL}"
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
  done
}

wait_for_postgres

# ---------------------------------------------------------------------------
# Step 5 — Prisma: generate client + run migrations
# ---------------------------------------------------------------------------
header "Step 5 — Running database migrations"

BACKEND_DIR="services/backend"

if [[ ! -d "${BACKEND_DIR}" ]]; then
  die "Backend directory not found at ${BACKEND_DIR}"
fi

if [[ ! -f "${BACKEND_DIR}/prisma/schema.prisma" ]]; then
  die "prisma/schema.prisma not found in ${BACKEND_DIR}"
fi

info "Generating Prisma client..."
(cd "${BACKEND_DIR}" && npx prisma generate) \
  || die "prisma generate failed"
success "Prisma client generated"

info "Deploying migrations..."
(cd "${BACKEND_DIR}" && npx prisma migrate deploy) \
  || die "prisma migrate deploy failed. Check DATABASE_URL in .env"
success "Migrations applied"

# ---------------------------------------------------------------------------
# Step 6 — Seed the database
# ---------------------------------------------------------------------------
header "Step 6 — Seeding the database"

info "Running seed script (services/backend/src/db/seed.ts)..."
(cd "${BACKEND_DIR}" && npx prisma db seed) \
  || die "Database seeding failed. Check the seed script output above."
success "Database seeded"

# ---------------------------------------------------------------------------
# Step 7 — Generate issuer RSA key pairs
# ---------------------------------------------------------------------------
header "Step 7 — Generating issuer RSA-2048 key pairs"

info "Running scripts/generate-issuer-keys.ts..."
npx ts-node --project tsconfig.base.json scripts/generate-issuer-keys.ts \
  || die "Key generation failed. Check the output above."
success "Issuer keys generated and registered in DB"

# ---------------------------------------------------------------------------
# Step 8 — Verify services are reachable
# ---------------------------------------------------------------------------
header "Step 8 — Verifying services"

check_service() {
  local name="$1"
  local url="$2"
  local max_attempts=10
  local attempt=0

  while [[ ${attempt} -lt ${max_attempts} ]]; do
    if curl -sf "${url}" &>/dev/null; then
      success "${name} is reachable at ${url}"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  warn "${name} not yet reachable at ${url} (service may still be starting)"
}

check_service "Backend API"     "http://localhost:4000/health"
check_service "NADRA Issuer"    "http://localhost:4001/health"
check_service "HEC Issuer"      "http://localhost:4002/health"
check_service "AU Issuer"       "http://localhost:4003/health"
check_service "LinkedIn Issuer" "http://localhost:4004/health"
check_service "Web App"         "http://localhost:3000"

# ---------------------------------------------------------------------------
# Done — Print instructions
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  ✅  NexusID demo environment is ready!${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Services${RESET}"
echo -e "  ${CYAN}Backend API${RESET}        http://localhost:4000"
echo -e "  ${CYAN}Web App${RESET}            http://localhost:3000"
echo -e "  ${CYAN}NADRA Issuer${RESET}       http://localhost:4001"
echo -e "  ${CYAN}HEC Issuer${RESET}         http://localhost:4002"
echo -e "  ${CYAN}AU Issuer${RESET}          http://localhost:4003"
echo -e "  ${CYAN}LinkedIn Issuer${RESET}    http://localhost:4004"
echo -e "  ${CYAN}ML Fraud Service${RESET}   http://localhost:5001"
echo ""
echo -e "  ${BOLD}JWKS endpoints (issuer public keys)${RESET}"
echo -e "  http://localhost:4001/.well-known/jwks.json   (NADRA)"
echo -e "  http://localhost:4002/.well-known/jwks.json   (HEC)"
echo -e "  http://localhost:4003/.well-known/jwks.json   (Air University)"
echo -e "  http://localhost:4004/.well-known/jwks.json   (LinkedIn)"
echo ""
echo -e "  ${BOLD}Chrome Extension${RESET}"
echo -e "  1. Open Chrome → chrome://extensions"
echo -e "  2. Enable ${BOLD}Developer mode${RESET} (top-right toggle)"
echo -e "  3. Click ${BOLD}Load unpacked${RESET}"
echo -e "  4. Select: ${CYAN}$(pwd)/apps/extension/${RESET}"
echo ""
echo -e "  ${BOLD}Mobile App (Android)${RESET}"
echo -e "  ${CYAN}cd apps/mobile && npx react-native run-android${RESET}"
echo -e "  (Ensure an emulator is running: Android Studio → Device Manager)"
echo ""
echo -e "  ${BOLD}Test the full flow${RESET}"
echo -e "  1. Open ${CYAN}http://localhost:3000${RESET} → register an account"
echo -e "  2. Add a credential (NADRA sandbox, HEC, or Air University)"
echo -e "  3. Open the test verifier page: ${CYAN}$(pwd)/demo/test-verifier.html${RESET}"
echo -e "     in Chrome with the extension loaded"
echo -e "  4. Approve the verification request on the mobile app"
echo ""
echo -e "  ${BOLD}Useful commands${RESET}"
echo -e "  View logs:    ${CYAN}${COMPOSE_CMD} -f infra/docker-compose.yml logs -f${RESET}"
echo -e "  Stop all:     ${CYAN}${COMPOSE_CMD} -f infra/docker-compose.yml down${RESET}"
echo -e "  Reset DB:     ${CYAN}${COMPOSE_CMD} -f infra/docker-compose.yml down -v${RESET}"
echo -e "  Prisma UI:    ${CYAN}cd services/backend && npx prisma studio${RESET}"
echo ""
echo -e "  ${BOLD}Demo credentials${RESET}"
echo -e "  Verifier API key:   ${CYAN}demo_api_key_12345${RESET}"
echo -e "  Verifier domain:    ${CYAN}demo-jobportal.nexusid.com${RESET}"
echo -e "  Demo user ID:       ${CYAN}00000000-0000-0000-0000-000000000001${RESET}"
echo ""
echo -e "${YELLOW}  ⚠  NADRA_USE_SANDBOX=true by default.${RESET}"
echo -e "${YELLOW}     All NADRA verifications use the sandbox API.${RESET}"
echo ""
