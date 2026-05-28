#!/usr/bin/env bash
set -euo pipefail

_sc="$(readlink -f "${BASH_SOURCE[0]}")" && SCRIPT_DIR="$(cd -- "$(dirname -- "$_sc")/.." && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

PROJECT_NAME="seclettr-e2e"
ENV_FILE="$DEFAULT_DEV_ENV_FILE"
REUSE_STACK=false
KEEP_RUNNING=false
NO_BUILD=false
PLAYWRIGHT_ARGS=()

usage() {
  cat <<'USAGE'
Usage: ./scripts/e2e-smoke.sh [options] [-- <playwright args>]

Starts the canonical Docker-based dev stack, verifies basic health/metrics,
and runs the browser smoke suite against that stack.

Options:
  --env-file <path>      Environment file to use (default: infra/.env.dev)
  --project-name <name>  Docker Compose project name (default: seclettr-e2e)
  --reuse-stack          Reuse an already-running stack instead of starting one
  --keep-running         Do not stop the stack after the smoke run
  --no-build             Reuse existing stack images when starting a new stack
  -h, --help             Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --project-name)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --reuse-stack)
      REUSE_STACK=true
      shift
      ;;
    --keep-running)
      KEEP_RUNNING=true
      shift
      ;;
    --no-build)
      NO_BUILD=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      PLAYWRIGHT_ARGS+=("$@")
      break
      ;;
    *)
      PLAYWRIGHT_ARGS+=("$1")
      shift
      ;;
  esac
done

require_command node
require_command pnpm
require_command curl
create_env_file_if_missing "$ENV_FILE" "$DEFAULT_DEV_ENV_TEMPLATE"
load_env_file "$ENV_FILE"

: "${DEV_API_PORT:=3301}"
: "${DEV_WEB_PORT:=5175}"

cleanup() {
  if [[ "$REUSE_STACK" == "false" && "$KEEP_RUNNING" == "false" ]]; then
    bash "$SCRIPT_DIR/dev-down.sh" \
      --env-file "$ENV_FILE" \
      --project-name "$PROJECT_NAME" \
      --volumes || true
  fi
}

trap cleanup EXIT

if [[ "$REUSE_STACK" == "false" ]]; then
  dev_up_args=(
    --env-file "$ENV_FILE"
    --project-name "$PROJECT_NAME"
  )
  if [[ "$NO_BUILD" == "true" ]]; then
    dev_up_args+=(--no-build)
  fi

  bash "$SCRIPT_DIR/dev-up.sh" "${dev_up_args[@]}"
fi

wait_for_http "http://127.0.0.1:${DEV_API_PORT}/health" "API health endpoint"
# web-dev builds @seclettr/crypto and @seclettr/protocol before starting Vite — allow up to 5 min.
wait_for_http "https://127.0.0.1:${DEV_WEB_PORT}" "Web dev server" true 300

metrics_payload="$(curl -fsS "http://127.0.0.1:${DEV_API_PORT}/metrics")"
grep -q "seclettr_http_requests_total" <<<"$metrics_payload" \
  || die "API metrics endpoint did not expose seclettr_http_requests_total"
grep -q 'seclettr_api_health{dependency="db"}' <<<"$metrics_payload" \
  || die "API metrics endpoint did not expose database readiness"

if [[ ${#PLAYWRIGHT_ARGS[@]} -eq 0 ]]; then
  PLAYWRIGHT_ARGS=(tests/e2e)
fi

has_project_arg=false
for ((i = 0; i < ${#PLAYWRIGHT_ARGS[@]}; i++)); do
  arg="${PLAYWRIGHT_ARGS[$i]}"
  if [[ "$arg" == "--project" || "$arg" == --project=* ]]; then
    has_project_arg=true
    break
  fi
done
if [[ "$has_project_arg" == "false" ]]; then
  PLAYWRIGHT_ARGS+=(--project=chromium)
fi

log_step "Running browser smoke suite against the canonical dev stack"
cd "$ROOT_DIR"
BASE_URL="https://127.0.0.1:${DEV_WEB_PORT}" \
API_URL="http://127.0.0.1:${DEV_API_PORT}" \
SECLETTR_E2E_EXTERNAL_STACK=1 \
pnpm exec playwright test "${PLAYWRIGHT_ARGS[@]}"

log_ok "E2E smoke suite passed"
