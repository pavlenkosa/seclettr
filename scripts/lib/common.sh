#!/usr/bin/env bash
# Seclettr CLI library — extends scripts/common.sh with step tracking, spinner,
# logo, and interactive helpers.
#
# SECLETTR_CLI_DIR and ROOT_DIR must be set by the caller (scripts/seclettr).

set -euo pipefail

[[ -n "${SECLETTR_CLI_DIR:-}" ]] || { echo "ERR SECLETTR_CLI_DIR not set" >&2; exit 1; }
[[ -n "${ROOT_DIR:-}" ]] || { echo "ERR ROOT_DIR not set" >&2; exit 1; }

INFRA_DIR="$ROOT_DIR/infra"

# Additional ANSI codes (not defined in scripts/common.sh)
BLD='\033[1m'
DIM='\033[2m'

# ── Step counter (same pattern as release-install.sh) ──────────────────────────

_SECLETTR_TOTAL_STEPS=1
_SECLETTR_CURRENT_STEP=0

seclettr_steps_init() {
  _SECLETTR_TOTAL_STEPS="${1:-1}"
  _SECLETTR_CURRENT_STEP=0
}

seclettr_step() {
  _SECLETTR_CURRENT_STEP=$(( _SECLETTR_CURRENT_STEP + 1 ))
  local label="$*"
  echo -e ""
  echo -e "${CYN}${BLD}  [${_SECLETTR_CURRENT_STEP}/${_SECLETTR_TOTAL_STEPS}]${RST}${BLD} ${label}${RST}"
}

# ── Spinner ────────────────────────────────────────────────────────────────────

# Run a command with a spinner; suppress its stdout/stderr unless it fails.
seclettr_run() {
  local label="$1"; shift
  local tmpout
  tmpout="$(mktemp)"
  local spin_chars=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local spin_idx=0

  printf "       %s %s" "${spin_chars[0]}" "$label"

  "$@" >"$tmpout" 2>&1 &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r       %s %s" "${spin_chars[$spin_idx]}" "$label"
    spin_idx=$(( (spin_idx + 1) % ${#spin_chars[@]} ))
    sleep 0.12
  done
  local rc=0
  set +e
  wait "$pid"
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    printf "\r       ${GRN}✓${RST} %s\n" "$label"
  else
    printf "\r       ${RED}✗${RST} %s\n" "$label"
    echo -e "${RED}--- output ---${RST}"
    cat "$tmpout" >&2
    echo -e "${RED}--------------${RST}"
  fi
  rm -f "$tmpout"
  return $rc
}

# ── Logo ───────────────────────────────────────────────────────────────────────

seclettr_logo() {
  local version
  if command -v node >/dev/null 2>&1; then
    version="$(node -e "try{console.log(require('$ROOT_DIR/package.json').version)}catch(e){console.log('?')}" 2>/dev/null)" || version="?"
  else
    version="?"
  fi

  echo -e ""
  echo -e "${GRN}  ◆  Seclettr CLI  ${DIM}v${version}${RST}"
  echo -e "${GRN}  ──────────────────────────────────────────${RST}"
  echo -e ""
}

# ── Confirmation prompt ────────────────────────────────────────────────────────

seclettr_confirm() {
  local prompt="${1:-Continue?}"
  local default="${2:-y}"
  local yn
  if [[ "$default" == "y" ]]; then
    read -r -p "  ${prompt} [Y/n]: " yn
    yn="${yn:-y}"
  else
    read -r -p "  ${prompt} [y/N]: " yn
    yn="${yn:-n}"
  fi
  [[ "$yn" =~ ^[YyДд] ]]
}

# ── Help ───────────────────────────────────────────────────────────────────────

seclettr_help() {
  seclettr_logo
  echo -e "  ${BLD}USAGE${RST}"
  echo -e "    ${CYN}seclettr${RST} ${DIM}[global options]${RST} ${GRN}<command>${RST} ${DIM}[subcommand]${RST} ${DIM}[options]${RST}"
  echo -e ""
  echo -e "  ${BLD}COMMANDS${RST}"
  echo -e ""
  echo -e "    ${GRN}dev up${RST}           Start development environment (localhost)"
  echo -e "    ${GRN}dev up --lan${RST}     Start development environment (LAN for call testing)"
  echo -e "    ${GRN}dev down${RST}         Stop development environment"
  echo -e "    ${GRN}dev status${RST}       Show running containers for the dev stack"
  echo -e "    ${GRN}dev logs${RST}         Tail logs from dev services"
  echo -e "    ${GRN}dev install${RST}      Install dev toolchain (Docker, Node, pnpm, Playwright)"
  echo -e "    ${GRN}dev certs${RST}        Generate TLS dev certificates"
  echo -e "    ${GRN}dev test-env${RST}     Generate test .env with random secrets"
  echo -e ""
  echo -e "    ${GRN}release build${RST}    Build release Docker images and bundle"
  echo -e "    ${GRN}release install${RST}  Deploy release bundle on a server"
  echo -e ""
  echo -e "    ${GRN}server install${RST}   Install Docker + Compose on Ubuntu/Debian"
  echo -e "    ${GRN}ghcr update${RST}      Pull images from GHCR and restart stack"
  echo -e ""
}
