#!/usr/bin/env bash
set -euo pipefail

echo "=== Pre-push check: pnpm typecheck ==="
pnpm typecheck

echo ""
echo "=== Pre-push check: pnpm lint ==="
pnpm lint

echo ""
echo "=== Pre-push check: pnpm build ==="
pnpm build

echo ""
echo "=== Pre-push check: pnpm verify:release ==="
pnpm verify:release

echo ""
echo "✓ All checks passed. Push safe."
