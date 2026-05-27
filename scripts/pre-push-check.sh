#!/usr/bin/env bash
# pre-push-check.sh — fast feedback before git push.
# Override: SECLETTR_PREPUSH_SKIP=1 git push
set -euo pipefail

if [ "${SECLETTR_PREPUSH_SKIP:-}" = "1" ]; then
  echo "SECLETTR_PREPUSH_SKIP=1 — skipping pre-push checks"
  exit 0
fi

echo "=== Pre-push: typecheck web ==="
pnpm --filter @seclettr/web typecheck

echo ""
echo "✓ OK — full typecheck, lint, and tests run in CI."
echo "  To skip: SECLETTR_PREPUSH_SKIP=1 git push"
