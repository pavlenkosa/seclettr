#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

SONAR_HOST_URL="${SONAR_HOST_URL:-http://127.0.0.1:9000}"

if [[ -z "${SONAR_TOKEN:-}" && -f "${HOME}/.config/seclettr/sonar-token" ]]; then
  SONAR_TOKEN="$(cat "${HOME}/.config/seclettr/sonar-token")"
fi

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "ERR: SONAR_TOKEN is not set and ~/.config/seclettr/sonar-token not found." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERR: docker is required to run sonar-scanner-cli." >&2
  exit 1
fi

COVERAGE_REPORT_PATHS=()
for report in \
  "$ROOT_DIR/apps/web/coverage/lcov.info" \
  "$ROOT_DIR/apps/api/coverage/lcov.info" \
  "$ROOT_DIR/packages/crypto/coverage/lcov.info"; do
  if [[ -f "$report" ]]; then
    COVERAGE_REPORT_PATHS+=("${report#"$ROOT_DIR/"}")
  fi
done

SCANNER_ARGS=(
  -Dsonar.projectKey=seclettr
  -Dsonar.projectBaseDir=/usr/src
  -Dsonar.sources=apps,packages,scripts
  -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/coverage/**,**/*.generated.ts,**/.turbo/**,**/artifacts/**,**/.scannerwork/**
  -Dsonar.tests=apps,packages,tests
  -Dsonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/__tests__/**
  -Dsonar.typescript.tsconfigPaths=apps/web/tsconfig.json,apps/api/tsconfig.json,packages/crypto/tsconfig.json,packages/protocol/tsconfig.json,apps/sfu/tsconfig.json
  # Coverage is not meaningful for:
  #   - server-side DB/WebSocket code (requires a live DB+broker)
  #   - WebRTC call runtime hooks (require browser WebRTC/getUserMedia APIs + SFU)
  #   - presentation-only UI components (video surfaces, call overlays, icon sheets)
  #   - top-level page shells that are pure React-Router wrappers
  #   - service worker (cannot run in Node test environment)
  # S6819: custom ARIA-role widgets (Listbox, Combobox, ConversationList, SeclettrMark SVG) –
  #        native <select>/<input> cannot match the design/UX requirements.
  # S7924: CSS contrast with CSS custom properties – Sonar cannot resolve var(--token)
  #        at static analysis time, so all color tokens are flagged as 0-contrast.
  -Dsonar.issue.ignore.multicriteria=e1,e2,e3,e4
  -Dsonar.issue.ignore.multicriteria.e1.ruleKey=typescript:S6819
  -Dsonar.issue.ignore.multicriteria.e1.resourceKey=**/Listbox.tsx
  -Dsonar.issue.ignore.multicriteria.e2.ruleKey=typescript:S6819
  -Dsonar.issue.ignore.multicriteria.e2.resourceKey=**/ConversationList.tsx
  -Dsonar.issue.ignore.multicriteria.e3.ruleKey=typescript:S6819
  -Dsonar.issue.ignore.multicriteria.e3.resourceKey=**/SeclettrMark.tsx
  -Dsonar.issue.ignore.multicriteria.e4.ruleKey=css:S7924
  -Dsonar.issue.ignore.multicriteria.e4.resourceKey=apps/web/src/**/*.module.css
  -Dsonar.coverage.exclusions=\
apps/api/src/services/websocket.ts,\
apps/api/src/services/ws-direct-call-router.ts,\
apps/api/src/services/ws-group-call-signals.ts,\
apps/api/src/services/ws-message-events.ts,\
apps/api/src/services/ws-auth.ts,\
apps/api/src/services/call-routing-state.ts,\
apps/api/src/services/call-auth.ts,\
apps/api/src/services/direct-call-routing.ts,\
apps/api/src/routes/**,\
apps/web/src/App.tsx,\
apps/web/src/pages/AuthPage.tsx,\
apps/web/src/pages/AuthRecoveryPage.tsx,\
apps/web/src/pages/UIKitPage.tsx,\
apps/web/src/calls/group/runtime/useGroupCallPanelRuntime.ts,\
apps/web/src/calls/group/runtime/useGroupCallSessionRuntime.ts,\
apps/web/src/calls/group/runtime/useGroupCallPanelPresentation.ts,\
apps/web/src/calls/group/runtime/useGroupCallPanelDock.ts,\
apps/web/src/calls/group/runtime/useGroupCallSync.ts,\
apps/web/src/calls/group/runtime/useGroupCallSession.ts,\
apps/web/src/calls/shared/media/audio-activity-registry.ts,\
apps/web/src/calls/direct/presentation/components/DirectCallActiveMinimized.tsx,\
apps/web/src/calls/direct/presentation/components/DirectCallControls.tsx,\
apps/web/src/calls/direct/presentation/components/DirectCallIncomingOverlay.tsx,\
apps/web/src/calls/direct/presentation/components/DirectCallSurfaceRenderer.tsx,\
apps/web/src/calls/direct/runtime/useDirectCallLocalMedia.ts,\
apps/web/src/calls/group/presentation/useGroupCallPanelDock.ts,\
apps/web/src/calls/group/presentation/components/GroupCallDetailsDrawer.tsx,\
apps/web/src/calls/group/presentation/components/GroupCallHeader.tsx,\
apps/web/src/calls/group/presentation/components/GroupCallMediaSection.tsx,\
apps/web/src/calls/shared/presentation/CallIcons.tsx,\
apps/web/src/components/common/ErrorBoundary.tsx,\
apps/web/src/components/common/LockScreen.tsx,\
apps/web/src/pages/chat/ChatMobileTabBar.tsx,\
apps/web/src/pages/chat/ChatThreadActionButtons.tsx,\
apps/web/src/pages/chat/ChatThreadPane.tsx,\
apps/web/src/pages/ChatPage.tsx,\
apps/web/src/calls/direct/runtime/useDirectCallController.ts,\
apps/web/src/calls/direct/presentation/components/DirectCallActiveOverlay.tsx,\
apps/web/src/calls/group/presentation/GroupCallPanel.tsx,\
apps/web/src/calls/group/presentation/useGroupCallPanelPresentation.ts,\
apps/web/public/push-sw.js,\
apps/sfu/**
)

if [[ ${#COVERAGE_REPORT_PATHS[@]} -gt 0 ]]; then
  IFS=,
  SCANNER_ARGS+=("-Dsonar.javascript.lcov.reportPaths=${COVERAGE_REPORT_PATHS[*]}")
  unset IFS
  echo "Using coverage reports: ${COVERAGE_REPORT_PATHS[*]}"
else
  echo "WARN: lcov reports not found, coverage will be 0 in Sonar."
fi

echo "Running Sonar scan against ${SONAR_HOST_URL}"
docker run --rm --network host \
  -e SONAR_HOST_URL="$SONAR_HOST_URL" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$ROOT_DIR:/usr/src" \
  sonarsource/sonar-scanner-cli:latest \
  "${SCANNER_ARGS[@]}"
