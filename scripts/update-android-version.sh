#!/usr/bin/env bash
# ─── Seclettr Android Version Sync ────────────────────────────────────
#
# Reads the version from the root package.json and patches
#   apps/web/android/app/build.gradle so versionCode and versionName
#   stay in sync with the npm/npm package version.
#
# Usage:
#   ./scripts/update-android-version.sh          # dry-run (print only)
#   ./scripts/update-android-version.sh --apply  # patch build.gradle
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_GRADLE="$ROOT_DIR/apps/web/android/app/build.gradle"
APPLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)    APPLY=true; shift ;;
    -h|--help)  echo "Usage: $0 [--apply]"; exit 0 ;;
    *)          echo "Unknown: $1"; exit 1 ;;
  esac
done

# ── Parse semver ───────────────────────────────────────────────────────
parse_semver() {
  local raw="$1"
  # Strip pre-release suffix (-beta, -alpha.1, etc.)
  local semver
  semver="${raw%%-*}"
  local major minor patch
  major="${semver%%.*}"
  rest="${semver#*.}"
  minor="${rest%%.*}"
  patch="${rest#*.}"
  echo "$major $minor $patch"
}

ROOT_VERSION="$(node -e "console.log(require('$ROOT_DIR/package.json').version)")"
read -r MAJOR MINOR PATCH <<< "$(parse_semver "$ROOT_VERSION")"

# versionCode = MAJOR * 1_000_000 + MINOR * 10_000 + PATCH * 100
VERSION_CODE=$(( MAJOR * 1000000 + MINOR * 10000 + PATCH * 100 ))

if [[ ! -f "$BUILD_GRADLE" ]]; then
  echo "ERROR: $BUILD_GRADLE not found"
  exit 1
fi

echo "Root version:  $ROOT_VERSION"
echo "Parsed:        major=$MAJOR minor=$MINOR patch=$PATCH"
echo "versionCode:   $VERSION_CODE"
echo "versionName:   $ROOT_VERSION"
echo "Target file:   $BUILD_GRADLE"
echo ""

if [[ "$APPLY" != "true" ]]; then
  echo "Dry-run. Use --apply to patch."
  exit 0
fi

# Patch versionCode
sed -i 's/versionCode [0-9]\+/versionCode '"$VERSION_CODE"'/' "$BUILD_GRADLE"
# Patch versionName (preserve quotes)
sed -i 's/versionName "[^"]*"/versionName "'"$ROOT_VERSION"'"/' "$BUILD_GRADLE"

echo "Patched versionCode -> $VERSION_CODE"
echo "Patched versionName -> $ROOT_VERSION"
echo "Done."
