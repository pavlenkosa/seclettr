#!/usr/bin/env bash
set -euo pipefail

_sc="$(readlink -f "${BASH_SOURCE[0]}")" && SCRIPT_DIR="$(cd -- "$(dirname -- "$_sc")/.." && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

LAN_IP=""

MKCERT_VERSION="v1.4.4"

usage() {
  cat <<'USAGE'
Usage: ./scripts/gen-dev-certs.sh [options]

Generates a locally-trusted TLS certificate for the Seclettr dev server
using mkcert. The certificate covers localhost + 127.0.0.1, and optionally
a LAN IP so other devices on the network can trust it.

mkcert is installed automatically if not present (apt, brew, or GitHub binary).

Options:
  --lan-ip <ip>   LAN IP to include in the certificate (e.g. 192.168.1.42)
  -h, --help      Show this help
USAGE
}

ensure_mkcert() {
  if command -v mkcert >/dev/null 2>&1; then
    return
  fi

  log_step "mkcert not found — installing..."

  # apt (Debian/Ubuntu) — also install libnss3-tools so mkcert can register in Firefox/Chrome
  if command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get install -y mkcert libnss3-tools && return
  fi

  # brew (macOS)
  if command -v brew >/dev/null 2>&1; then
    brew install mkcert && return
  fi

  # GitHub binary release (Linux x86_64 / arm64 fallback)
  require_command curl
  local arch os
  arch=$(uname -m)
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$arch" in
    x86_64)  arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "Unsupported architecture for mkcert auto-install: $arch. Install mkcert manually: https://github.com/FiloSottile/mkcert" ;;
  esac

  local url="https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-${os}-${arch}"
  log_step "Downloading mkcert ${MKCERT_VERSION} from GitHub..."
  run_as_root curl -fsSL -o /usr/local/bin/mkcert "$url"
  run_as_root chmod +x /usr/local/bin/mkcert
  log_ok "mkcert installed to /usr/local/bin/mkcert"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lan-ip)
      LAN_IP="$2"
      shift 2
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

ensure_mkcert

CERT_DIR="$INFRA_DIR/.dev-certs"
mkdir -p "$CERT_DIR"

log_step "Installing mkcert root CA into system trust store (may prompt for password)"
mkcert -install

HOSTS=(localhost 127.0.0.1)
if [[ -n "$LAN_IP" ]]; then
  HOSTS+=("$LAN_IP")
fi

log_step "Generating certificate for: ${HOSTS[*]}"

mkcert \
  -key-file "$CERT_DIR/seclettr-dev-key.pem" \
  -cert-file "$CERT_DIR/seclettr-dev-cert.pem" \
  "${HOSTS[@]}"

CAROOT="$(mkcert -CAROOT)"
cp "$CAROOT/rootCA.pem" "$CERT_DIR/seclettr-rootCA.pem"
[[ -f "$CAROOT/rootCA.cer" ]] && cp "$CAROOT/rootCA.cer" "$CERT_DIR/seclettr-rootCA.cer"

log_ok "Certificates written to $CERT_DIR"
echo "  Cert:  $CERT_DIR/seclettr-dev-cert.pem"
echo "  Key:   $CERT_DIR/seclettr-dev-key.pem"
echo "  CA:    $CERT_DIR/seclettr-rootCA.pem"

if [[ -n "$LAN_IP" ]]; then
  echo ""
  echo "  To trust the certificate on other LAN devices, install the CA:"
  echo "    Linux/macOS/Android: $CERT_DIR/seclettr-rootCA.pem"
  echo "    Windows/iOS:         $CERT_DIR/seclettr-rootCA.cer"
fi
