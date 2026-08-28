#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NexusID — ZK-Proof Age Verification Circuit Compiler
#
# Runs the full Groth16 setup pipeline:
#   1. Install circom (if missing)
#   2. Install circomlib (npm)
#   3. Compile .circom → .wasm + .r1cs
#   4. Download Powers of Tau ceremony file
#   5. snarkjs groth16 setup → .zkey
#   6. Export verification_key.json
#
# Run from the nexusid/ repo root:
#   bash circuits/compile.sh
#
# Output files (all in circuits/):
#   age_verification_js/age_verification.wasm
#   age_verification.r1cs
#   age_verification_0000.zkey       (phase 1 — before contribution)
#   age_verification_final.zkey      (phase 2 — after dummy contribution)
#   verification_key.json
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

CIRCUITS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUIT_NAME="age_verification"
PTAU_FILE="powersOfTau28_hez_final_12.ptau"
PTAU_URL="https://hermez.s3-eu-west-1.amazonaws.com/${PTAU_FILE}"

# Colours for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[NexusID ZK]${NC} $*"; }
ok()     { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn()   { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
fail()   { echo -e "${RED}[ FAIL ]${NC} $*"; exit 1; }

log "Starting ZK-proof circuit compilation pipeline"
log "Working directory: ${CIRCUITS_DIR}"
echo ""

# ─── Step 0: Check node / npm ────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Please install Node.js 18+ first."
fi
NODE_VER=$(node --version)
log "Node.js: ${NODE_VER}"

# ─── Step 1: Install circom ──────────────────────────────────────────────────
log "Step 1 — Checking circom installation..."

if command -v circom &>/dev/null; then
  CIRCOM_VER=$(circom --version 2>&1 || echo "unknown")
  ok "circom already installed: ${CIRCOM_VER}"
else
  warn "circom not found. Installing via cargo..."
  if ! command -v cargo &>/dev/null; then
    log "Installing Rust + cargo (needed for circom)..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # shellcheck disable=SC1090
    source "$HOME/.cargo/env"
  fi
  log "Building circom from source (this may take 2–5 minutes)..."
  TMP_DIR=$(mktemp -d)
  git clone https://github.com/iden3/circom.git "$TMP_DIR/circom"
  cd "$TMP_DIR/circom"
  cargo build --release
  cargo install --path circom
  cd "$CIRCUITS_DIR"
  rm -rf "$TMP_DIR"
  ok "circom installed successfully"
fi

# ─── Step 2: Install circomlib + snarkjs ─────────────────────────────────────
log "Step 2 — Installing circomlib and snarkjs..."

cd "$CIRCUITS_DIR"

# Ensure we have a package.json so npm install works
if [ ! -f package.json ]; then
  cat > package.json << 'EOF'
{
  "name": "nexusid-circuits",
  "version": "1.0.0",
  "description": "NexusID ZK-proof circuits",
  "private": true,
  "dependencies": {
    "circomlib": "^2.0.5",
    "snarkjs": "^0.7.4"
  }
}
EOF
  ok "Created circuits/package.json"
fi

npm install --silent
ok "circomlib and snarkjs installed"

# ─── Step 3: Compile the circuit ─────────────────────────────────────────────
log "Step 3 — Compiling ${CIRCUIT_NAME}.circom..."

circom "${CIRCUIT_NAME}.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output . \
  --include node_modules

ok "Compiled:"
ok "  → ${CIRCUIT_NAME}.r1cs"
ok "  → ${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
ok "  → ${CIRCUIT_NAME}.sym"

# Print constraint count
CONSTRAINTS=$(node -e "
const snarkjs = require('snarkjs');
snarkjs.r1cs.info('${CIRCUIT_NAME}.r1cs').then(info => {
  console.log(info.nConstraints);
}).catch(() => console.log('?'));
" 2>/dev/null || echo "?")
log "Circuit has ~${CONSTRAINTS} constraints (target: <1000 for fast mobile proof)"

# Copy wasm to top-level circuits/ dir for convenience
cp "${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" . 2>/dev/null || true

# ─── Step 4: Download Powers of Tau ──────────────────────────────────────────
log "Step 4 — Getting Powers of Tau file (${PTAU_FILE})..."

if [ -f "${PTAU_FILE}" ]; then
  ok "ptau file already exists — skipping download"
else
  log "Downloading ${PTAU_URL} ..."
  log "(This is ~215 MB. It is a publicly trusted ceremony file. Download once, reuse forever.)"
  if command -v curl &>/dev/null; then
    curl -# -o "${PTAU_FILE}" "${PTAU_URL}"
  elif command -v wget &>/dev/null; then
    wget -q --show-progress -O "${PTAU_FILE}" "${PTAU_URL}"
  else
    fail "Neither curl nor wget found. Install one and re-run."
  fi
  ok "Powers of Tau downloaded: ${PTAU_FILE}"
fi

# ─── Step 5: Groth16 phase 1 setup ───────────────────────────────────────────
log "Step 5 — Groth16 setup (phase 1)..."

node node_modules/.bin/snarkjs groth16 setup \
  "${CIRCUIT_NAME}.r1cs" \
  "${PTAU_FILE}" \
  "${CIRCUIT_NAME}_0000.zkey"

ok "Phase 1 zkey: ${CIRCUIT_NAME}_0000.zkey"

# ─── Step 6: Phase 2 contribution (non-interactive for dev) ──────────────────
log "Step 6 — Phase 2 contribution (development / non-interactive)..."

warn "IMPORTANT: In production, replace this with a real multi-party ceremony."
warn "For FYP demo purposes, a dummy contribution is sufficient."

echo "nexusid_dev_entropy_$(date +%s)_${CIRCUIT_NAME}" | \
  node node_modules/.bin/snarkjs zkey contribute \
    "${CIRCUIT_NAME}_0000.zkey" \
    "${CIRCUIT_NAME}_final.zkey" \
    --name="NexusID Dev Contribution" \
    -v \
    2>/dev/null || \
  node node_modules/.bin/snarkjs zkey beacon \
    "${CIRCUIT_NAME}_0000.zkey" \
    "${CIRCUIT_NAME}_final.zkey" \
    "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" \
    10 \
    -n="Final Beacon"

ok "Final zkey: ${CIRCUIT_NAME}_final.zkey"

# ─── Step 7: Export verification key ─────────────────────────────────────────
log "Step 7 — Exporting verification key..."

node node_modules/.bin/snarkjs zkey export verificationkey \
  "${CIRCUIT_NAME}_final.zkey" \
  "verification_key.json"

ok "Verification key: verification_key.json"

# ─── Step 8: Sanity test proof ───────────────────────────────────────────────
log "Step 8 — Running sanity-check proof (born 1990, threshold 18, year 2024)..."

cat > /tmp/nexusid_test_input.json << 'EOF'
{
  "birth_year": "1990",
  "current_year": "2024",
  "age_threshold": "18"
}
EOF

node node_modules/.bin/snarkjs groth16 fullprove \
  /tmp/nexusid_test_input.json \
  "${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" \
  "${CIRCUIT_NAME}_final.zkey" \
  /tmp/nexusid_test_proof.json \
  /tmp/nexusid_test_public.json

VERIFY_RESULT=$(node node_modules/.bin/snarkjs groth16 verify \
  "verification_key.json" \
  /tmp/nexusid_test_public.json \
  /tmp/nexusid_test_proof.json 2>&1)

if echo "$VERIFY_RESULT" | grep -q "OK"; then
  ok "Sanity check passed: proof verified successfully"
  ok "Public signals: $(cat /tmp/nexusid_test_public.json)"
else
  fail "Sanity check FAILED: ${VERIFY_RESULT}"
fi

rm -f /tmp/nexusid_test_input.json /tmp/nexusid_test_proof.json /tmp/nexusid_test_public.json

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} NexusID ZK-Proof Circuit — Build Complete${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Circuit:          ${BLUE}circuits/${CIRCUIT_NAME}.circom${NC}"
echo -e "  WASM:             ${BLUE}circuits/${CIRCUIT_NAME}.wasm${NC}"
echo -e "  Proving key:      ${BLUE}circuits/${CIRCUIT_NAME}_final.zkey${NC}"
echo -e "  Verification key: ${BLUE}circuits/verification_key.json${NC}"
echo ""
echo -e "  Backend service reads from:"
echo -e "    circuits/${CIRCUIT_NAME}.wasm"
echo -e "    circuits/${CIRCUIT_NAME}_final.zkey"
echo -e "    circuits/verification_key.json"
echo ""
warn "SECURITY: Do NOT commit the .zkey files or .ptau to git."
warn "Add to .gitignore: circuits/*.zkey circuits/*.ptau"
echo ""
