#!/bin/bash
# NexusID context files installer
# Run from: ~/Documents/nexusid
# Usage: bash /tmp/install.sh

set -e
REPO="$HOME/Documents/nexusid"

echo "Installing NexusID Claude Code context files..."
echo "Repo: $REPO"
echo ""

# Confirm we're in the right repo
if [ ! -f "$REPO/package.json" ]; then
  echo "ERROR: $REPO/package.json not found. Are you sure this is the nexusid repo?"
  exit 1
fi

# 1. CLAUDE.md (root)
cp /tmp/CLAUDE.md "$REPO/CLAUDE.md"
echo "✓ CLAUDE.md → $REPO/CLAUDE.md"

# 2. docs/REQUIREMENTS.md
mkdir -p "$REPO/docs"
cp /tmp/REQUIREMENTS.md "$REPO/docs/REQUIREMENTS.md"
echo "✓ REQUIREMENTS.md → $REPO/docs/REQUIREMENTS.md"

# Note: SRS.md should already be there from the previous session
# If it's missing, it needs to be re-extracted from the DOCX
if [ -f "$REPO/docs/SRS.md" ]; then
  echo "✓ docs/SRS.md already exists ($(wc -l < "$REPO/docs/SRS.md") lines)"
else
  echo "⚠  docs/SRS.md missing — extract from Final_Srs.docx:"
  echo "   extract-text /path/to/Final_Srs.docx > $REPO/docs/SRS.md"
fi

# 3. Path-scoped rules
mkdir -p "$REPO/.claude/rules"
cp /tmp/rules/sd-jwt.md    "$REPO/.claude/rules/sd-jwt.md"
cp /tmp/rules/backend.md   "$REPO/.claude/rules/backend.md"
cp /tmp/rules/web.md       "$REPO/.claude/rules/web.md"
cp /tmp/rules/mobile.md    "$REPO/.claude/rules/mobile.md"
cp /tmp/rules/extension.md "$REPO/.claude/rules/extension.md"
echo "✓ Rules → $REPO/.claude/rules/ (5 files)"

echo ""
echo "Done! Files installed:"
echo "  $REPO/CLAUDE.md"
echo "  $REPO/docs/REQUIREMENTS.md"
echo "  $REPO/.claude/rules/sd-jwt.md"
echo "  $REPO/.claude/rules/backend.md"
echo "  $REPO/.claude/rules/web.md"
echo "  $REPO/.claude/rules/mobile.md"
echo "  $REPO/.claude/rules/extension.md"
echo ""
echo "Claude Code will now have full SRS context for all 45 FRs + 51 API routes."
