#!/usr/bin/env bash
# Seclettr uninstaller — stops all services, removes containers, volumes,
# Docker images, and optionally the bundle directory itself.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$SCRIPT_DIR"
COMPOSE_FILE="$BUNDLE_DIR/docker-compose.yml"
HTTP_OVERRIDE_FILE="$BUNDLE_DIR/docker-compose.http.yml"
ENV_FILE="$BUNDLE_DIR/.env"
PROJECT_NAME="seclettr"

REMOVE_IMAGES=false
REMOVE_BUNDLE=false
NON_INTERACTIVE=false

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
CYN='\033[0;36m'
BLD='\033[1m'
DIM='\033[2m'
RST='\033[0m'

# ── Helpers ────────────────────────────────────────────────────────────────────

log_step() { echo -e "${CYN}${BLD}  >${RST} $*"; }
log_ok()   { echo -e "    ${GRN}✓${RST} $*"; }
log_warn() { echo -e "    ${YLW}!${RST} $*"; }
die()      { echo -e "${RED}ERR${RST} $*" >&2; exit 1; }

confirm() {
  local prompt="$1"
  local answer
  read -r -p "$(echo -e "  ${YLW}?${RST} ${prompt} [y/N]: ")" answer
  [[ "${answer,,}" == "y" ]]
}

DOCKER_CMD=(docker)
SUDO_CMD=(sudo)

if [[ -n "${SUDO_ASKPASS:-}" ]]; then
  SUDO_CMD=(sudo -A)
fi

resolve_docker_cmd() {
  if docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker); return
  fi
  if command -v sudo >/dev/null 2>&1 \
      && "${SUDO_CMD[@]}" docker compose version >/dev/null 2>&1 \
      && "${SUDO_CMD[@]}" docker info >/dev/null 2>&1; then
    DOCKER_CMD=("${SUDO_CMD[@]}" docker); return
  fi
  die "Docker is not accessible. Cannot proceed."
}

docker_compose() {
  local args=(-p "$PROJECT_NAME" -f "$COMPOSE_FILE")
  [[ -f "$ENV_FILE" ]] && args+=(--env-file "$ENV_FILE")
  [[ -f "$HTTP_OVERRIDE_FILE" ]] && args+=(-f "$HTTP_OVERRIDE_FILE")
  "${DOCKER_CMD[@]}" compose "${args[@]}" "$@"
}

usage() {
  cat <<'USAGE'
Usage: ./uninstall.sh [options]

Stops all Seclettr services and removes containers and volumes.
By default only containers and volumes are removed (data is wiped).
Docker images and the bundle directory are kept unless requested.

Options:
  --remove-images     Also remove the seclettr/* Docker images
  --remove-bundle     Also delete this bundle directory (irreversible!)
  --non-interactive   Skip confirmation prompts (use with care)
  --project-name      Docker Compose project name (default: seclettr)
  --compose-file      Path to compose file (default: ./docker-compose.yml)
  --env-file          Path to .env file (default: ./.env)
  -h, --help          Show this help
USAGE
}

# ── Argument parsing ───────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remove-images)    REMOVE_IMAGES=true;   shift ;;
    --remove-bundle)    REMOVE_BUNDLE=true;   shift ;;
    --non-interactive)  NON_INTERACTIVE=true; shift ;;
    --project-name)     PROJECT_NAME="$2";    shift 2 ;;
    --compose-file)     COMPOSE_FILE="$2";    shift 2 ;;
    --env-file)         ENV_FILE="$2";        shift 2 ;;
    -h|--help)          usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# ── Banner ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${RED}${BLD}╔══════════════════════════════════════════════════╗${RST}"
echo -e "${RED}${BLD}║           Seclettr Uninstaller                   ║${RST}"
echo -e "${RED}${BLD}╚══════════════════════════════════════════════════╝${RST}"
echo ""
echo -e "  This will ${RED}${BLD}permanently delete${RST} all Seclettr data on this server:"
echo -e "  ${DIM}• All running containers will be stopped${RST}"
echo -e "  ${DIM}• postgres_data volume  (all messages, accounts, groups)${RST}"
echo -e "  ${DIM}• minio_data volume     (all uploaded attachments)${RST}"
if [[ "$REMOVE_IMAGES" == "true" ]]; then
  echo -e "  ${DIM}• Docker images: seclettr/api, seclettr/web, seclettr/sfu${RST}"
fi
if [[ "$REMOVE_BUNDLE" == "true" ]]; then
  echo -e "  ${DIM}• Bundle directory: ${BUNDLE_DIR}${RST}"
fi
echo ""
echo -e "  ${RED}${BLD}There is no undo. All user data will be lost.${RST}"
echo ""

# ── Confirmation ───────────────────────────────────────────────────────────────

if [[ "$NON_INTERACTIVE" == "false" ]]; then
  confirm "Are you sure you want to uninstall Seclettr?" \
    || { echo "  Aborted."; exit 0; }

  echo ""
  echo -e "  ${YLW}${BLD}Last chance.${RST} Type ${BLD}CONFIRM${RST} to proceed:"
  read -r _final
  if [[ "$_final" != "CONFIRM" ]]; then
    echo "  Aborted."
    exit 0
  fi
  echo ""
fi

resolve_docker_cmd

# ── Step 1: Stop and remove containers ────────────────────────────────────────

log_step "Stopping and removing containers"
if [[ -f "$COMPOSE_FILE" ]]; then
  docker_compose down --remove-orphans --timeout 20 2>/dev/null && log_ok "Containers stopped and removed" \
    || log_warn "Some containers could not be stopped gracefully (may already be down)"
else
  log_warn "Compose file not found at $COMPOSE_FILE — skipping compose down"
  # Fall back to removing containers by project label
  _containers="$("${DOCKER_CMD[@]}" ps -aq --filter "label=com.docker.compose.project=${PROJECT_NAME}" 2>/dev/null || true)"
  if [[ -n "$_containers" ]]; then
    # shellcheck disable=SC2086
    "${DOCKER_CMD[@]}" rm -f $_containers 2>/dev/null && log_ok "Containers removed by project label" || true
  fi
fi

# ── Step 2: Remove volumes ─────────────────────────────────────────────────────

log_step "Removing data volumes"
_volumes=(
  "${PROJECT_NAME}_postgres_data"
  "${PROJECT_NAME}_minio_data"
)
for _vol in "${_volumes[@]}"; do
  if "${DOCKER_CMD[@]}" volume inspect "$_vol" >/dev/null 2>&1; then
    "${DOCKER_CMD[@]}" volume rm "$_vol" >/dev/null \
      && log_ok "Removed volume: $_vol" \
      || log_warn "Could not remove volume: $_vol (may still be in use)"
  else
    log_warn "Volume not found (already removed?): $_vol"
  fi
done

# ── Step 3: Remove images (optional) ──────────────────────────────────────────

if [[ "$REMOVE_IMAGES" == "true" ]]; then
  log_step "Removing Docker images"
  _images=(
    "seclettr/api:release"
    "seclettr/web:release"
    "seclettr/sfu:release"
    "seclettr/api"
    "seclettr/web"
    "seclettr/sfu"
  )
  _removed=0
  for _img in "${_images[@]}"; do
    if "${DOCKER_CMD[@]}" image inspect "$_img" >/dev/null 2>&1; then
      "${DOCKER_CMD[@]}" rmi "$_img" >/dev/null 2>&1 \
        && { log_ok "Removed image: $_img"; _removed=$(( _removed + 1 )); } \
        || log_warn "Could not remove image: $_img (may be used by another container)"
    fi
  done
  [[ $_removed -eq 0 ]] && log_warn "No seclettr/* images found"
fi

# ── Step 4: Remove bundle directory (optional) ────────────────────────────────

if [[ "$REMOVE_BUNDLE" == "true" ]]; then
  log_step "Removing bundle directory"
  # Safety check: never delete / or short paths
  if [[ "${#BUNDLE_DIR}" -lt 8 || "$BUNDLE_DIR" == "/" ]]; then
    log_warn "Bundle directory path looks unsafe ('$BUNDLE_DIR') — skipping deletion"
  else
    rm -rf "$BUNDLE_DIR" \
      && log_ok "Removed bundle directory: $BUNDLE_DIR" \
      || log_warn "Could not fully remove $BUNDLE_DIR"
  fi
fi

# ── Done ───────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GRN}${BLD}  Uninstall complete.${RST}"
echo ""
echo -e "  ${DIM}Containers and volumes have been removed.${RST}"
if [[ "$REMOVE_IMAGES" == "false" ]]; then
  echo -e "  ${DIM}Docker images were kept. Remove them with:${RST}"
  echo -e "  ${DIM}  docker rmi seclettr/api:release seclettr/web:release seclettr/sfu:release${RST}"
fi
if [[ "$REMOVE_BUNDLE" == "false" && -d "$BUNDLE_DIR" ]]; then
  echo -e "  ${DIM}Bundle directory kept at: ${BUNDLE_DIR}${RST}"
  echo -e "  ${DIM}Remove it manually or re-run with --remove-bundle${RST}"
fi
echo ""
