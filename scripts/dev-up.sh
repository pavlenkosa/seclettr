#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

PROJECT_NAME="seclettr-dev"
ENV_FILE="$DEFAULT_DEV_ENV_FILE"
NO_BUILD=false
FORCE_REBUILD=false
PULL_IMAGES=false
FOLLOW_LOGS=false

usage() {
  cat <<'USAGE'
Usage: ./scripts/dev-up.sh [options]

Starts the canonical Docker-based development environment:
  - postgres
  - redis
  - minio
  - coturn
  - api
  - sfu
  - web-dev (Vite HMR in Docker)

Options:
  --env-file <path>      Environment file to use (default: infra/.env.dev)
  --project-name <name>  Docker Compose project name (default: seclettr-dev)
  --no-build             Reuse existing images/containers without rebuilding
  --force-rebuild        Force a clean rebuild for api/sfu/web-dev using docker compose build --no-cache
  --pull                 Pull newer base images during forced rebuild
  --logs                 Follow api/sfu/web-dev logs after startup
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
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --force-rebuild)
      FORCE_REBUILD=true
      shift
      ;;
    --pull)
      PULL_IMAGES=true
      shift
      ;;
    --logs)
      FOLLOW_LOGS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ "$NO_BUILD" == "true" && "$FORCE_REBUILD" == "true" ]]; then
  die "--no-build and --force-rebuild cannot be used together"
fi

require_command node
require_command pnpm
resolve_docker_cmd
create_env_file_if_missing "$ENV_FILE" "$DEFAULT_DEV_ENV_TEMPLATE"
load_env_file "$ENV_FILE"

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required in $ENV_FILE}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required in $ENV_FILE}"
: "${DEV_POSTGRES_PORT:=55432}"
: "${DEV_REDIS_PORT:=56379}"
: "${DEV_MINIO_API_PORT:=59000}"
: "${DEV_MINIO_CONSOLE_PORT:=59001}"
: "${DEV_API_PORT:=3301}"
: "${DEV_SFU_PORT:=3302}"
: "${DEV_SFU_RTC_MIN_PORT:=47000}"
: "${DEV_SFU_RTC_MAX_PORT:=47049}"
: "${DEV_WEB_PORT:=5175}"
: "${DEV_TURN_PORT:=53478}"
: "${DEV_TURNS_PORT:=55349}"
: "${S3_BUCKET:=seclettr-attachments}"
: "${MINIO_ACCESS_KEY:=minioadmin}"
: "${MINIO_SECRET_KEY:=dev_minio_secret_value}"

export POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-$DEV_POSTGRES_PORT}"
export REDIS_HOST_PORT="${REDIS_HOST_PORT:-$DEV_REDIS_PORT}"
export MINIO_API_HOST_PORT="${MINIO_API_HOST_PORT:-$DEV_MINIO_API_PORT}"
export MINIO_CONSOLE_HOST_PORT="${MINIO_CONSOLE_HOST_PORT:-$DEV_MINIO_CONSOLE_PORT}"
export API_HOST_PORT="${API_HOST_PORT:-$DEV_API_PORT}"

ensure_port_available "$DEV_POSTGRES_PORT" "Postgres"
ensure_port_available "$DEV_REDIS_PORT" "Redis"
ensure_port_available "$DEV_MINIO_API_PORT" "MinIO API"
ensure_port_available "$DEV_MINIO_CONSOLE_PORT" "MinIO console"
ensure_port_available "$DEV_API_PORT" "API"
ensure_port_available "$DEV_SFU_PORT" "SFU"
ensure_port_available "$DEV_WEB_PORT" "Web"
ensure_port_available "$DEV_TURN_PORT" "TURN"
ensure_port_available "$DEV_TURNS_PORT" "TURNS"
ensure_port_range_available "$DEV_SFU_RTC_MIN_PORT" "$DEV_SFU_RTC_MAX_PORT" "SFU RTP"

log_step "Starting development infra containers"
compose_dev "$PROJECT_NAME" "$ENV_FILE" up -d postgres redis minio minio-init

wait_for_tcp "127.0.0.1" "$DEV_POSTGRES_PORT" "Postgres"
wait_for_tcp "127.0.0.1" "$DEV_REDIS_PORT" "Redis"
wait_for_tcp "127.0.0.1" "$DEV_MINIO_API_PORT" "MinIO"

export DATABASE_URL="postgresql://seclettr:${POSTGRES_PASSWORD}@127.0.0.1:${DEV_POSTGRES_PORT}/seclettr"
export REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:${DEV_REDIS_PORT}"
export S3_ENDPOINT="http://127.0.0.1:${DEV_MINIO_API_PORT}"
export S3_ACCESS_KEY="${MINIO_ACCESS_KEY}"
export S3_SECRET_KEY="${MINIO_SECRET_KEY}"
# Presigned upload URLs served through the Vite HTTPS dev-server proxy so
# browsers on this machine never see plain HTTP MinIO requests.
export S3_PUBLIC_URL="https://127.0.0.1:${DEV_WEB_PORT}"
export PORT="${DEV_API_PORT}"
export HOST="127.0.0.1"
export SFU_URL="${SFU_URL:-http://127.0.0.1:${DEV_SFU_PORT}}"
export TURN_DOMAIN="${TURN_DOMAIN:-127.0.0.1}"
export TURN_EXTERNAL_IP="${TURN_EXTERNAL_IP:-127.0.0.1}"
export TURN_PORT="${DEV_TURN_PORT}"
export TURNS_PORT="${DEV_TURNS_PORT}"
export ANNOUNCED_IP="${ANNOUNCED_IP:-127.0.0.1}"

log_step "Running database migrations"
cd "$ROOT_DIR"
node scripts/run-pnpm.mjs db:migrate

if [[ "$FORCE_REBUILD" == "true" ]]; then
  log_step "Force rebuilding api, sfu and web-dev images without cache..."
  build_args=(build --no-cache)
  if [[ "$PULL_IMAGES" == "true" ]]; then
    build_args+=(--pull)
  fi
  build_args+=(api sfu web-dev)
  compose_dev "$PROJECT_NAME" "$ENV_FILE" "${build_args[@]}"
fi

log_step "Starting API, SFU, TURN and web-dev"
up_args=(up -d coturn api sfu web-dev)
if [[ "$NO_BUILD" == "false" && "$FORCE_REBUILD" == "false" ]]; then
  up_args=(up -d --build coturn api sfu web-dev)
fi
compose_dev "$PROJECT_NAME" "$ENV_FILE" "${up_args[@]}"

wait_for_http "http://127.0.0.1:${DEV_API_PORT}/health" "API health endpoint"
wait_for_http "http://127.0.0.1:${DEV_SFU_PORT}/health" "SFU health endpoint"
# web-dev builds @seclettr/crypto and @seclettr/protocol before starting Vite,
# which takes ~2-3 min on a cold container — allow up to 5 min.
wait_for_http "https://127.0.0.1:${DEV_WEB_PORT}" "Web dev server" true 300

for attempt in $(seq 1 30); do
  if compose_dev "$PROJECT_NAME" "$ENV_FILE" exec -T sfu node -e 'const base = process.env.API_INTERNAL_URL; if (!base) process.exit(2); fetch(base.replace(/\/+$/, "") + "/health").then(async (response) => { if (!response.ok) process.exit(1); process.stdout.write(await response.text()); }).catch(() => process.exit(1));' >/dev/null 2>&1; then
    log_ok "SFU can reach the API control plane"
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    die "Timed out waiting for SFU to reach the API control plane"
  fi
  sleep 1
done

log_ok "Development environment is running"
echo "  Web:      https://127.0.0.1:${DEV_WEB_PORT}"
echo "  API:      http://127.0.0.1:${DEV_API_PORT}"
echo "  SFU:      http://127.0.0.1:${DEV_SFU_PORT}"
echo "  Postgres: 127.0.0.1:${DEV_POSTGRES_PORT}"
echo "  Redis:    127.0.0.1:${DEV_REDIS_PORT}"
echo "  Stop:     bash ./scripts/dev-down.sh --env-file $ENV_FILE --project-name $PROJECT_NAME"

if [[ "$FOLLOW_LOGS" == "true" ]]; then
  compose_dev "$PROJECT_NAME" "$ENV_FILE" logs -f api sfu web-dev
fi
