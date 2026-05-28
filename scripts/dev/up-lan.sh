#!/usr/bin/env bash
set -euo pipefail
# dev-up-lan.sh — starts the development stack with all services accessible on
# the local network (0.0.0.0 bindings), correct ANNOUNCED_IP for mediasoup,
# and TURN server pointing at the LAN IP.  Use this when testing WebRTC calls
# between multiple devices on the same network.

echo "Running Seclettr dev environment..."

_sc="$(readlink -f "${BASH_SOURCE[0]}")" && SCRIPT_DIR="$(cd -- "$(dirname -- "$_sc")/.." && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

PROJECT_NAME="seclettr-dev"
ENV_FILE="$DEFAULT_DEV_ENV_FILE"
LAN_IP=""
NO_BUILD=false
FORCE_REBUILD=false
PULL_IMAGES=false
FOLLOW_LOGS=false

usage() {
  cat <<'USAGE'
Usage: ./scripts/dev-up-lan.sh [options]

Starts the Docker-based dev environment with all WebRTC services exposed on
0.0.0.0 so other devices on the same network can reach the app and make calls.

Key differences from dev-up.sh:
  - SFU (mediasoup) ANNOUNCED_IP is set to the LAN IP
  - TURN server external IP and domain are set to the LAN IP
  - All WebRTC ports (RTP + TURN) bind to 0.0.0.0
  - Web dev server binds to 0.0.0.0 and uses TLS certs from infra/.dev-certs/

Prerequisites:
  - Run ./scripts/gen-dev-certs.sh --lan-ip <ip> once to generate trusted certs
  - Import infra/.dev-certs/seclettr-rootCA.pem on other LAN devices

Services started:
  postgres, redis, minio, coturn, api, sfu, web-dev (Vite HMR)

Options:
  --lan-ip <ip>          LAN IP of this machine (auto-detected if omitted)
  --env-file <path>      Environment file (default: infra/.env.dev)
  --project-name <name>  Docker Compose project name (default: seclettr-dev)
  --no-build             Reuse existing images without rebuilding
  --force-rebuild        Force a clean rebuild for api/sfu/web-dev using docker compose build --no-cache
  --pull                 Pull newer base images during forced rebuild
  --logs                 Follow api/sfu/web-dev logs after startup
  -h, --help             Show this help
USAGE
}

# ── Helpers ───────────────────────────────────────────────────────────────────

detect_lan_ip() {
  local ip=""
  # Preferred: ip route (accurate — uses the route to a public address)
  if command -v ip >/dev/null 2>&1; then
    ip=$(ip route get 8.8.8.8 2>/dev/null \
      | awk '/src/ { for(i=1;i<=NF;i++) if ($i=="src") { print $(i+1); break } }')
    [[ -n "$ip" && "$ip" != "127.0.0.1" ]] && echo "$ip" && return
  fi
  # Fallback: hostname -I (first non-loopback address)
  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [[ -n "$ip" && "$ip" != "127.0.0.1" ]] && echo "$ip" && return
  fi
  echo ""
}

cert_covers_ip() {
  local cert_file="$1"
  local ip="$2"
  [[ -f "$cert_file" ]] || return 1
  openssl x509 -in "$cert_file" -text -noout 2>/dev/null | grep -q "IP Address:$ip"
}

# ── Argument parsing ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lan-ip)
      LAN_IP="$2"
      shift 2
      ;;
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

# ── Preflight ─────────────────────────────────────────────────────────────────

if [[ "$NO_BUILD" == "true" && "$FORCE_REBUILD" == "true" ]]; then
  die "--no-build and --force-rebuild cannot be used together"
fi

require_command node
require_command pnpm
require_command openssl
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
: "${TURN_MIN_PORT:=55000}"
: "${TURN_MAX_PORT:=55199}"
: "${S3_BUCKET:=seclettr-attachments}"
: "${MINIO_ACCESS_KEY:=minioadmin}"
: "${MINIO_SECRET_KEY:=dev_minio_secret_value}"
: "${TURN_SECRET:=dev_turn_secret_123456}"

# ── LAN IP detection ──────────────────────────────────────────────────────────

if [[ -z "$LAN_IP" ]]; then
  LAN_IP=$(detect_lan_ip)
  if [[ -z "$LAN_IP" ]]; then
    die "Could not auto-detect LAN IP. Use --lan-ip <ip> to specify it manually."
  fi
  log_step "Detected LAN IP: $LAN_IP"
else
  log_step "Using LAN IP: $LAN_IP"
fi

# ── Certificate check ─────────────────────────────────────────────────────────

CERT_FILE="$INFRA_DIR/.dev-certs/seclettr-dev-cert.pem"
if ! cert_covers_ip "$CERT_FILE" "$LAN_IP"; then
  log_warn "Dev certificate does not cover $LAN_IP."
  log_warn "Run once to generate a trusted cert:"
  log_warn "  bash ./scripts/gen-dev-certs.sh --lan-ip $LAN_IP"
  log_warn ""
  log_warn "Without a valid cert, browsers on other devices will show a TLS"
  log_warn "warning. Chrome/Firefox work after proceeding; Safari may block WebRTC."
fi

# ── Override network-sensitive env vars for LAN mode ─────────────────────────
# These override any values from the env file so mediasoup and coturn
# announce the correct IP to remote browsers.

export ANNOUNCED_IP="$LAN_IP"
export TURN_EXTERNAL_IP="$LAN_IP"
export TURN_DOMAIN="$LAN_IP"

# Extend CORS_ORIGIN with the LAN access URLs
EXISTING_CORS="${CORS_ORIGIN:-https://localhost:${DEV_WEB_PORT},http://localhost:${DEV_WEB_PORT}}"
LAN_CORS="https://${LAN_IP}:${DEV_WEB_PORT},http://${LAN_IP}:${DEV_WEB_PORT}"
export CORS_ORIGIN="${EXISTING_CORS},${LAN_CORS}"

# Port mapping exports used by the compose files
export POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-$DEV_POSTGRES_PORT}"
export REDIS_HOST_PORT="${REDIS_HOST_PORT:-$DEV_REDIS_PORT}"
export MINIO_API_HOST_PORT="${MINIO_API_HOST_PORT:-$DEV_MINIO_API_PORT}"
export MINIO_CONSOLE_HOST_PORT="${MINIO_CONSOLE_HOST_PORT:-$DEV_MINIO_CONSOLE_PORT}"
export API_HOST_PORT="${API_HOST_PORT:-$DEV_API_PORT}"

# ── Tear down any existing stack with this project name ───────────────────────
# Handles both --no-build reruns and stacks started via dev-up.sh or dev-up-lan.sh.

mapfile -t existing_containers < <(docker_cli ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null || true)
if [[ ${#existing_containers[@]} -gt 0 ]]; then
  log_step "Stopping existing $PROJECT_NAME containers..."
  docker_cli rm -f "${existing_containers[@]}" >/dev/null
fi

# ── Port availability checks ──────────────────────────────────────────────────

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

# ── Start infra ───────────────────────────────────────────────────────────────

log_step "Starting infra containers (postgres, redis, minio)"
compose_dev_lan "$PROJECT_NAME" "$ENV_FILE" up -d postgres redis minio minio-init

wait_for_tcp "127.0.0.1" "$DEV_POSTGRES_PORT" "Postgres"
wait_for_tcp "127.0.0.1" "$DEV_REDIS_PORT" "Redis"
wait_for_tcp "127.0.0.1" "$DEV_MINIO_API_PORT" "MinIO"

export DATABASE_URL="postgresql://seclettr:${POSTGRES_PASSWORD}@127.0.0.1:${DEV_POSTGRES_PORT}/seclettr"
export REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:${DEV_REDIS_PORT}"
export S3_ENDPOINT="http://127.0.0.1:${DEV_MINIO_API_PORT}"
export S3_ACCESS_KEY="${MINIO_ACCESS_KEY}"
export S3_SECRET_KEY="${MINIO_SECRET_KEY}"
# Presigned upload URLs served through the Vite HTTPS dev-server proxy so
# all LAN devices access MinIO over HTTPS (same origin as the web app).
export S3_PUBLIC_URL="https://${LAN_IP}:${DEV_WEB_PORT}"
export PORT="${DEV_API_PORT}"
export HOST="0.0.0.0"
export SFU_URL="${SFU_URL:-http://127.0.0.1:${DEV_SFU_PORT}}"

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
  compose_dev_lan "$PROJECT_NAME" "$ENV_FILE" "${build_args[@]}"
fi

log_step "Starting API, SFU, TURN and web-dev  [LAN mode — ANNOUNCED_IP=${LAN_IP}]"
up_args=(up -d coturn api sfu web-dev)
if [[ "$NO_BUILD" == "false" && "$FORCE_REBUILD" == "false" ]]; then
  up_args=(up -d --build coturn api sfu web-dev)
fi
compose_dev_lan "$PROJECT_NAME" "$ENV_FILE" "${up_args[@]}"

wait_for_http "http://127.0.0.1:${DEV_API_PORT}/health" "API health endpoint"
wait_for_http "http://127.0.0.1:${DEV_SFU_PORT}/health" "SFU health endpoint"
wait_for_http "https://127.0.0.1:${DEV_WEB_PORT}" "Web dev server" true

for attempt in $(seq 1 30); do
  if compose_dev_lan "$PROJECT_NAME" "$ENV_FILE" exec -T sfu node -e 'const base = process.env.API_INTERNAL_URL; if (!base) process.exit(2); fetch(base.replace(/\/+$/, "") + "/health").then(async (response) => { if (!response.ok) process.exit(1); process.stdout.write(await response.text()); }).catch(() => process.exit(1));' >/dev/null 2>&1; then
    log_ok "SFU can reach the API control plane"
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    die "Timed out waiting for SFU to reach the API control plane"
  fi
  sleep 1
done

# ── Summary ───────────────────────────────────────────────────────────────────

log_ok "LAN development environment is running"
echo ""
echo "  Local:    https://127.0.0.1:${DEV_WEB_PORT}"
echo "  LAN:      https://${LAN_IP}:${DEV_WEB_PORT}   ← share this with other devices"
echo "  API:      http://127.0.0.1:${DEV_API_PORT}"
echo "  SFU:      http://127.0.0.1:${DEV_SFU_PORT}  (ANNOUNCED_IP=${LAN_IP})"
echo "  TURN:     turn:${LAN_IP}:${DEV_TURN_PORT}"
echo "  Stop:     bash ./scripts/dev-down.sh --env-file $ENV_FILE --project-name $PROJECT_NAME"
echo ""
echo "  Trust the CA on other devices to avoid TLS warnings:"
echo "    Linux/macOS/Android: $INFRA_DIR/.dev-certs/seclettr-rootCA.pem"
echo "    Windows/iOS:         $INFRA_DIR/.dev-certs/seclettr-rootCA.cer"
echo ""

if [[ "$FOLLOW_LOGS" == "true" ]]; then
  compose_dev_lan "$PROJECT_NAME" "$ENV_FILE" logs -f api sfu web-dev
fi
