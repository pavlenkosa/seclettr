#!/usr/bin/env bash
set -euo pipefail

echo "Stopping Seclettr dev envrionment..."

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

PROJECT_NAME="seclettr-dev"
ENV_FILE="$DEFAULT_DEV_ENV_FILE"
REMOVE_VOLUMES=false
REMOVE_LOCAL_IMAGES=false
PRUNE_BUILDER_CACHE=false

usage() {
  cat <<'USAGE'
Usage: ./scripts/dev-down.sh [options]

Stops the canonical Docker-based development environment.

Options:
  --env-file <path>      Environment file to use if present (default: infra/.env.dev)
  --project-name <name>  Docker Compose project name (default: seclettr-dev)
  --volumes              Remove named volumes as part of shutdown
  --rmi-local            Remove local Docker images built for this project
  --builder-prune        Prune Docker builder cache (equivalent to: docker builder prune -af)
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
    --volumes)
      REMOVE_VOLUMES=true
      shift
      ;;
    --rmi-local)
      REMOVE_LOCAL_IMAGES=true
      shift
      ;;
    --builder-prune)
      PRUNE_BUILDER_CACHE=true
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

resolve_docker_cmd

# Stop and remove all containers belonging to this project, regardless of
# which compose override (dev.yml vs dev-lan.yml) was used to start them.
mapfile -t containers < <(docker_cli ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null || true)
if [[ ${#containers[@]} -gt 0 ]]; then
  log_step "Stopping containers..."
  docker_cli rm -f "${containers[@]}" >/dev/null
else
  log_ok "No running containers found for project $PROJECT_NAME"
fi

# Remove named volumes if requested
if [[ "$REMOVE_VOLUMES" == "true" ]]; then
  log_step "Removing named volumes..."
  mapfile -t volumes < <(docker_cli volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null || true)
  if [[ ${#volumes[@]} -gt 0 ]]; then
    docker_cli volume rm "${volumes[@]}"
    log_ok "Volumes removed"
  else
    log_ok "No volumes found for project $PROJECT_NAME"
  fi
fi

# Remove project networks
mapfile -t networks < <(docker_cli network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null || true)
if [[ ${#networks[@]} -gt 0 ]]; then
  docker_cli network rm "${networks[@]}" 2>/dev/null || true
fi

if [[ "$REMOVE_LOCAL_IMAGES" == "true" ]]; then
  log_step "Removing local images for project $PROJECT_NAME..."
  mapfile -t images < <(docker_cli images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | awk -v p="${PROJECT_NAME}-" '$1 ~ "^" p { print $2 }' | sort -u)
  if [[ ${#images[@]} -gt 0 ]]; then
    docker_cli rmi -f "${images[@]}" >/dev/null 2>&1 || true
    log_ok "Local project images removed"
  else
    log_ok "No local project images found for project $PROJECT_NAME"
  fi
fi

if [[ "$PRUNE_BUILDER_CACHE" == "true" ]]; then
  log_step "Pruning Docker builder cache..."
  docker_cli builder prune -af >/dev/null
  log_ok "Docker builder cache pruned"
fi

log_ok "Development environment stopped"
