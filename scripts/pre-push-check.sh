#!/usr/bin/env bash
set -euo pipefail

if [ "${SECLETTR_PREPUSH_SKIP:-}" = "1" ]; then
  echo "SECLETTR_PREPUSH_SKIP=1 — skipping pre-push checks"
  exit 0
fi

echo "=== Pre-push check: pnpm typecheck ==="
pnpm typecheck

echo ""
echo "=== Pre-push check: pnpm lint (web only — api/sfu/crypto/protocol warnings are pre-existing) ==="
pnpm --filter @seclettr/web lint

echo ""
echo "=== Pre-push check: pnpm build ==="
pnpm build

echo ""
echo "=== Pre-push check: pnpm verify:release ==="
pnpm verify:release

echo ""
echo "=== Pre-push check: pnpm test ==="
pnpm test

echo ""
echo "✓ All checks passed. Push safe."
echo "  To skip: SECLETTR_PREPUSH_SKIP=1 git push"
