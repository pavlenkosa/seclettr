#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
CYN='\033[0;36m'
RST='\033[0m'

NODELESS=true
APT_UPDATED=false
DOCKER_GROUP_CHANGED=false
APT_GET_OPTS=(-o Acquire::ForceIPv4=true)
SUDO_CMD=(sudo)

if [[ -z "${SUDO_ASKPASS:-}" && -x "$HOME/.local/bin/codex-sudo-askpass" ]]; then
  export SUDO_ASKPASS="$HOME/.local/bin/codex-sudo-askpass"
fi

if [[ -n "${SUDO_ASKPASS:-}" ]]; then
  SUDO_CMD=(sudo -A)
fi

usage() {
  cat <<'USAGE'
Usage: ./scripts/server-install.sh

Installs the minimum server-side prerequisites for a simple Seclettr deployment
on Ubuntu/Debian:
  - Docker Engine
  - Docker Compose plugin
  - curl / ca-certificates / jq

It does not install Node.js or workspace dependencies.
USAGE
}

log_step() {
  echo -e "${CYN}==>${RST} $*"
}

log_ok() {
  echo -e "${GRN}OK${RST}  $*"
}

log_warn() {
  echo -e "${YLW}WARN${RST} $*"
}

die() {
  echo -e "${RED}ERR${RST} $*" >&2
  exit 1
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return
  fi

  command -v sudo >/dev/null 2>&1 || die "sudo is required to run: $*"
  "${SUDO_CMD[@]}" "$@"
}

ensure_linux_debian() {
  [[ "$(uname -s)" == "Linux" ]] || die "This installer currently supports Linux only."
  [[ -f /etc/os-release ]] || die "Cannot detect OS metadata."

  # shellcheck disable=SC1091
  source /etc/os-release
  export DISTRO_ID="${ID:-}"
  export DISTRO_CODENAME="${VERSION_CODENAME:-}"

  [[ "$DISTRO_ID" == "ubuntu" || "$DISTRO_ID" == "debian" || "${ID_LIKE:-}" == *debian* ]] \
    || die "This installer currently supports Ubuntu/Debian only."
}

apt_update_once() {
  if [[ "$APT_UPDATED" == "false" ]]; then
    log_step "Running apt-get update"
    run_as_root apt-get "${APT_GET_OPTS[@]}" update
    APT_UPDATED=true
  fi
}

apt_install() {
  local packages=("$@")
  [[ ${#packages[@]} -gt 0 ]] || return 0
  apt_update_once
  log_step "Installing apt packages: ${packages[*]}"
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get "${APT_GET_OPTS[@]}" install -y "${packages[@]}"
}

ensure_base_packages() {
  apt_install ca-certificates curl gnupg lsb-release jq
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log_ok "Docker is already available"
  else
    log_step "Installing Docker Engine and Compose plugin"
    apt_install ca-certificates curl gnupg lsb-release

    run_as_root install -m 0755 -d /etc/apt/keyrings
    if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
      curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" | run_as_root gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      run_as_root chmod a+r /etc/apt/keyrings/docker.gpg
    fi

    local arch
    arch="$(dpkg --print-architecture)"
    [[ -n "$DISTRO_CODENAME" ]] || die "Unable to determine distribution codename for Docker repository."

    echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DISTRO_ID} ${DISTRO_CODENAME} stable" \
      | run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
    APT_UPDATED=false

    apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    if command -v systemctl >/dev/null 2>&1; then
      run_as_root systemctl enable --now docker >/dev/null 2>&1 || true
    fi
  fi

  if ! id -nG "$USER" | grep -qw docker; then
    log_step "Adding $USER to the docker group"
    run_as_root usermod -aG docker "$USER"
    DOCKER_GROUP_CHANGED=true
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

ensure_linux_debian
ensure_base_packages
ensure_docker

log_ok "Server prerequisites are installed"
echo "  docker: $(docker --version)"
echo "  compose: $(docker compose version)"
if [[ "$DOCKER_GROUP_CHANGED" == "true" ]]; then
  log_warn "Docker group membership changed. Re-login before running Docker without sudo."
fi
