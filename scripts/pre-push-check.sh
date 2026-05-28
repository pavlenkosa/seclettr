#!/usr/bin/env bash
# pre-push-check.sh — fast feedback before git push.
# Override: SECLETTR_PREPUSH_SKIP=1 git push
set -euo pipefail

if [ "${SECLETTR_PREPUSH_SKIP:-}" = "1" ]; then
  echo "SECLETTR_PREPUSH_SKIP=1 — skipping pre-push checks"
  exit 0
fi

# Git hooks may not inherit PATH; add common locations
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"

echo "=== Pre-push: typecheck web ==="
pnpm --filter @seclettr/web typecheck 2>/dev/null || corepack pnpm --filter @seclettr/web typecheck

echo ""
echo "✓ OK — full typecheck, lint, and tests run in CI."
echo "  To skip: SECLETTR_PREPUSH_SKIP=1 git push"
