#!/usr/bin/env bash
# sync-env-to-vercel.sh — Resolve op:// secrets and push to Vercel env vars
#
# Prerequisites:
#   - 1Password CLI (`op`) installed and signed in
#   - Vercel CLI (`vercel`) installed and linked to project
#
# Usage:
#   ./scripts/sync-env-to-vercel.sh              # dry-run (show what would be set)
#   ./scripts/sync-env-to-vercel.sh --apply      # actually push to Vercel
#   ./scripts/sync-env-to-vercel.sh --verify     # check which Vercel vars start with op://

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"
VERCEL_ENV="${VERCEL_ENV:-production preview development}"
DRY_RUN=true
VERIFY_ONLY=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --apply) DRY_RUN=false ;;
    --verify) VERIFY_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--apply|--verify]"
      echo "  (no flags) = dry-run, show what would be set"
      echo "  --apply    = resolve op:// refs and push to Vercel"
      echo "  --verify   = check Vercel for unresolved op:// values"
      exit 0 ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$VERIFY_ONLY" = true ]; then
  echo -e "${YELLOW}Checking Vercel env vars for unresolved op:// references...${NC}"
  # Pull current Vercel env
  vercel env pull .env.vercel-check --yes 2>/dev/null || true
  if [ -f .env.vercel-check ]; then
    BROKEN=$(grep -c 'op://' .env.vercel-check 2>/dev/null || echo "0")
    if [ "$BROKEN" -gt 0 ]; then
      echo -e "${RED}Found $BROKEN unresolved op:// references:${NC}"
      grep 'op://' .env.vercel-check | sed 's/=.*//' | while read -r key; do
        echo "  - $key"
      done
    else
      echo -e "${GREEN}All Vercel env vars are resolved (no op:// found).${NC}"
    fi
    rm -f .env.vercel-check
  else
    echo -e "${RED}Could not pull Vercel env. Is the project linked?${NC}"
    exit 1
  fi
  exit 0
fi

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}Error: $ENV_FILE not found${NC}"
  exit 1
fi

# Check prerequisites
if ! command -v op &>/dev/null; then
  echo -e "${RED}Error: 1Password CLI (op) not installed${NC}"
  exit 1
fi
if ! command -v vercel &>/dev/null; then
  echo -e "${RED}Error: Vercel CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Reading $ENV_FILE...${NC}"

TOTAL=0
OP_COUNT=0
RESOLVED=0
FAILED=0
SKIPPED=0

while IFS= read -r line; do
  # Skip comments and empty lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$line" ]] && continue

  # Parse KEY=VALUE
  KEY="${line%%=*}"
  VALUE="${line#*=}"

  # Remove surrounding quotes
  VALUE="${VALUE%\"}"
  VALUE="${VALUE#\"}"
  VALUE="${VALUE%\'}"
  VALUE="${VALUE#\'}"

  TOTAL=$((TOTAL + 1))

  # Skip empty values
  if [ -z "$VALUE" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Check if it's an op:// reference
  if [[ "$VALUE" == op://* ]]; then
    OP_COUNT=$((OP_COUNT + 1))

    # Resolve via 1Password
    RESOLVED_VALUE=$(op read "$VALUE" 2>/dev/null) || {
      echo -e "  ${RED}FAIL${NC}: $KEY (could not resolve $VALUE)"
      FAILED=$((FAILED + 1))
      continue
    }

    if [ "$DRY_RUN" = true ]; then
      echo -e "  ${GREEN}RESOLVE${NC}: $KEY ← $VALUE → ${RESOLVED_VALUE:0:8}..."
    else
      # Push to Vercel for each environment
      for env in $VERCEL_ENV; do
        echo "$RESOLVED_VALUE" | vercel env add "$KEY" "$env" --force 2>/dev/null && true
      done
      echo -e "  ${GREEN}SET${NC}: $KEY (resolved from op://)"
    fi
    RESOLVED=$((RESOLVED + 1))
  else
    # Non-op:// value — push as-is
    if [ "$DRY_RUN" = true ]; then
      echo -e "  ${YELLOW}STATIC${NC}: $KEY = ${VALUE:0:30}..."
    else
      for env in $VERCEL_ENV; do
        echo "$VALUE" | vercel env add "$KEY" "$env" --force 2>/dev/null && true
      done
      echo -e "  ${GREEN}SET${NC}: $KEY (static)"
    fi
  fi
done < "$ENV_FILE"

echo ""
echo -e "${YELLOW}Summary:${NC}"
echo "  Total vars:    $TOTAL"
echo "  op:// refs:    $OP_COUNT"
echo "  Resolved:      $RESOLVED"
echo "  Failed:        $FAILED"
echo "  Skipped:       $SKIPPED"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}DRY RUN — no changes made. Use --apply to push to Vercel.${NC}"
fi

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}Some secrets failed to resolve. Check 1Password vault access.${NC}"
  exit 1
fi
