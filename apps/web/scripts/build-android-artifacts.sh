#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ANDROID_DIR="${APP_DIR}/android"
MODE="${1:-debug}"

usage() {
  cat <<'USAGE'
Usage: ./scripts/build-android-artifacts.sh [debug|release]

Modes:
  debug    Build an installable debug APK after syncing web assets
  release  Build debug APK + release APK + release AAB after syncing web assets
USAGE
}

case "${MODE}" in
  debug)
    ;;
  release)
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown mode: ${MODE}" >&2
    usage >&2
    exit 1
    ;;
esac

echo "[android] toolchain"
node --version
pnpm --version
java -version

echo "[android] syncing web assets into Capacitor shell"
(cd "${APP_DIR}" && pnpm run android:sync)

BACKGROUND_RUNNER_AAR="${APP_DIR}/node_modules/@capacitor/background-runner/android/src/main/libs/android-js-engine-release.aar"
if [[ ! -f "${BACKGROUND_RUNNER_AAR}" ]]; then
  echo "[android] ERROR: missing ${BACKGROUND_RUNNER_AAR}" >&2
  echo "[android] run pnpm install and verify @capacitor/background-runner package is installed" >&2
  exit 1
fi

echo "[android] building ${MODE} artifacts"
cd "${ANDROID_DIR}"
chmod +x ./gradlew

if [[ "${MODE}" == "debug" ]]; then
  ./gradlew --no-daemon assembleDebug
else
  ./gradlew --no-daemon assembleDebug assembleRelease bundleRelease
fi
