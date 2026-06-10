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

# ── Step counter ───────────────────────────────────────────────────────────────

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

# Color one line of the ASCII mark:
#   @%  → bold green  (dense / main shape)
#   #   → green
#   *+  → cyan        (medium highlights)
#   .:-= → dim green  (shading / gradient)
_seclettr_color_art_line() {
  local line="$1" out="" i char
  for (( i=0; i<${#line}; i++ )); do
    char="${line:$i:1}"
    case "$char" in
      '@'|'%') out+="${BLD}${GRN}${char}${RST}" ;;
      '#')     out+="${GRN}${char}${RST}" ;;
      '*'|'+') out+="${CYN}${char}${RST}" ;;
      '.'|':'|'-'|'=') out+="${DIM}${char}${RST}" ;;
      *) out+="${char}" ;;
    esac
  done
  echo -e "   $out"
}

seclettr_logo() {
  local version
  if command -v node >/dev/null 2>&1; then
    version="$(node -e "try{process.stdout.write(require('$ROOT_DIR/package.json').version)}catch(e){process.stdout.write('?')}" 2>/dev/null)" || version="?"
  else
    version="?"
  fi

  echo ""
  _seclettr_color_art_line "    .=#@%#+-.               "
  _seclettr_color_art_line " :+%@%*==*%%@%#+-:          "
  _seclettr_color_art_line "%@%+:       :=+#%@@%*=-.    "
  _seclettr_color_art_line "%%+              .-=*%@@%#+=:"
  _seclettr_color_art_line "%@+    .-*%#*=:.       :=+#%@%#+"
  _seclettr_color_art_line "%%=  :#@@#=+#%@@%*+-.       .*@@"
  _seclettr_color_art_line "@@%+-:-:      .-=*%@@%#*=:   =%%"
  _seclettr_color_art_line ".-+#%@%#*=:.        :-+#@@#  =%%"
  _seclettr_color_art_line "..   :-+#%@@%#+-:       +@%  +@%"
  _seclettr_color_art_line "%@+  *#:  .:=*#%@@#*=:. .++  -%#"
  _seclettr_color_art_line "%%+  %@*        .-+#%@@%*+-.     "
  _seclettr_color_art_line "%@+  *%@@%*=-.       .:-+#%@%#+-"
  _seclettr_color_art_line "%%=    .-+#%@@%#+-:    :==..-#@@"
  _seclettr_color_art_line "@@#-:       .:=*#%@@%#@@#+.  =%%"
  _seclettr_color_art_line "-+#%@@%*=-.       .-++-.     =%%"
  _seclettr_color_art_line "    .-+*%@@%#+-:            :#@@"
  _seclettr_color_art_line "          :=*#%@@%*=:.  .-*%@#+:"
  _seclettr_color_art_line "               .-+#%@@%%%@@=.   "
  _seclettr_color_art_line "                    .:=#%@%     "
  _seclettr_color_art_line "                        .=#.    "
  echo ""
  echo -e "   ${BLD}${GRN}S E C L E T T R${RST}  ${DIM}v${version}${RST}"
  echo -e "   ${DIM}secure messaging developer toolkit${RST}"
  echo ""
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
  echo -e "    ${CYN}seclettr${RST} ${DIM}[--version]${RST} ${GRN}<command>${RST} ${DIM}[subcommand] [options]${RST}"
  echo ""

  echo -e "  ${BLD}DEV${RST}  ${DIM}— local development environment${RST}"
  echo -e "    ${GRN}dev up${RST}                Start dev stack (localhost)"
  echo -e "    ${GRN}dev up --lan${RST}          Start dev stack exposed on LAN"
  echo -e "    ${GRN}dev down${RST}              Stop dev stack"
  echo -e "    ${GRN}dev status${RST}            Show running containers"
  echo -e "    ${GRN}dev logs${RST} ${DIM}[service]${RST}    Tail container logs"
  echo -e "    ${GRN}dev install${RST}           Install dev toolchain (Docker, Node, pnpm)"
  echo -e "    ${GRN}dev certs${RST}             Generate TLS dev certificates via mkcert"
  echo -e "    ${GRN}dev test-env${RST}          Generate test .env with random secrets"
  echo ""

  echo -e "  ${BLD}RELEASE${RST}  ${DIM}— build and deploy${RST}"
  echo -e "    ${GRN}release build${RST}         Build release Docker images and bundle"
  echo -e "    ${GRN}release install${RST}       Deploy bundle on a server"
  echo -e "    ${GRN}release uninstall${RST}     Remove deployed stack and images"
  echo ""

  echo -e "  ${BLD}OPS${RST}  ${DIM}— operations and QA${RST}"
  echo -e "    ${GRN}ops e2e${RST} ${DIM}[-- args]${RST}     Run Playwright e2e smoke suite"
  echo -e "    ${GRN}ops ghcr update${RST}       Pull images from GHCR and restart stack"
  echo ""

  echo -e "  ${BLD}ANDROID${RST}  ${DIM}— native build helpers${RST}"
  echo -e "    ${GRN}android sync${RST}          Sync versionCode/versionName from package.json (dry-run)"
  echo -e "    ${GRN}android sync --apply${RST}  Patch build.gradle in place"
  echo ""

  echo -e "  ${BLD}SONAR${RST}  ${DIM}— static analysis${RST}"
  echo -e "    ${GRN}sonar scan${RST}            Run SonarQube scan"
  echo -e "    ${GRN}sonar scan --coverage${RST} Collect coverage first, then scan"
  echo ""

  echo -e "  ${BLD}SERVER${RST}  ${DIM}— host provisioning${RST}"
  echo -e "    ${GRN}server install${RST}        Install Docker + Compose on Ubuntu/Debian"
  echo ""

  echo -e "  ${DIM}Run 'seclettr <command> --help' for command-specific options.${RST}"
  echo ""
}
