#!/usr/bin/env bash
# Regression tests for the installer's .env placeholder detection
# (env_has_placeholders in scripts/release/install.sh) and its interaction
# with fill_env_secrets.
#
# Production bug this guards against: env_has_placeholders used to grep for
# CHANGE_ME across the WHOLE .env, including comment lines. The shipped
# template's own hint comment ("replace all CHANGE_ME values...") therefore
# matched forever, so every install re-ran fill_env_secrets, which re-derived
# domain vars (TURN_DOMAIN, CORS_ORIGIN) from the detected IP and overwrote
# the user's values — breaking Let's Encrypt (cert requested for a bare IP).
#
# Tests drive the REAL functions from install.sh (via the
# SECLETTR_INSTALL_SHELL_ONLY source-guard); no docker/network is used.
#
# Run: bash scripts/ops/tests/install-placeholder-detection.sh
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SH="$SCRIPT_DIR/../../release/install.sh"
ENV_TEMPLATE="$SCRIPT_DIR/../../../infra/.env.example"

PASS=0; FAIL=0

finish() {
  echo ""
  echo "Passed: $PASS  Failed: $FAIL"
  [[ $FAIL -eq 0 ]] || exit 1
}
trap finish EXIT

new_case() {
  WORK="$(mktemp -d /tmp/seclettr-placeholders.XXXXXX)"
  ENV_FILE="$WORK/.env"
  cp "$ENV_TEMPLATE" "$ENV_FILE"
}

# set_env_var <file> <KEY> <value> — mirrors the installer's line-based rewrite.
set_env_var() {
  sed -i -e "s|^$2=.*|$2=$3|" "$1"
}

env_var() {
  awk -F= -v key="$1" '$1 == key { print substr($0, length(key) + 2); exit }' "$2"
}

# fill_template_values <file> — replace every real CHANGE_ME_* placeholder
# token in assignment lines with dummy filled values (what fill_env_secrets
# would produce), simulating a user's fully-filled .env.
fill_template_values() {
  sed -i \
    -e 's|CHANGE_ME_POSTGRES_PASSWORD|1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f|g' \
    -e 's|CHANGE_ME_REDIS_PASSWORD|2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a|g' \
    -e 's|CHANGE_ME_JWT_SECRET_MIN_32_CHARS|3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d|g' \
    -e 's|CHANGE_ME_TURN_SECRET|4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e|g' \
    -e 's|CHANGE_ME_MINIO_ACCESS_KEY|AAAAAAAAAAAAAAAAAAAA|g' \
    -e 's|CHANGE_ME_MINIO_SECRET|5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f|g' \
    -e 's|CHANGE_ME_METRICS_BEARER_TOKEN|6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c|g' \
    -e 's|CHANGE_ME_VAPID_PUBLIC_KEY|B7cD8eF9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9A0b1C2d3E4f5G6h7i8j9k0l1m2n3o4p5q|g' \
    -e 's|CHANGE_ME_VAPID_PRIVATE_KEY|M2n3o4p5q6r7s8t9u0v1w2x3y4z5A6b7C8d9E0f1G2h3i4j5|g' \
    -e 's|CHANGE_ME_VAPID_SUBJECT|mailto:admin@chat.example.com|g' \
    "$1"
}

# run_detection <detected-ip> [setup-domain] — replicates the installer
# main-loop gate around env_has_placeholders / fill_env_secrets
# (install.sh ~:2049-2093), with network-dependent inputs fixed by the harness.
run_detection() {
  local detected_ip="$1" setup_domain="${2:-}"
  (
    set +e
    export SECLETTR_INSTALL_SHELL_ONLY=1
    # shellcheck disable=SC1090
    source "$INSTALL_SH"

    # Top-level assignments ran before the guard — set harness vars AFTER
    # source so they survive.
    ENV_FILE="$WORK/.env"

    ENV_NEEDS_GENERATION=false
    if env_has_placeholders; then
      ENV_NEEDS_GENERATION=true
    fi
    if [[ "$ENV_NEEDS_GENERATION" == "true" ]]; then
      fill_env_secrets "$ENV_FILE" "$detected_ip" "$setup_domain"
    fi
    echo "NEEDS_GENERATION=$ENV_NEEDS_GENERATION"
  ) 2>&1
}

check() {
  local name="$1" ok="$2" detail="${3:-}"
  if [[ "$ok" == "1" ]]; then
    echo "PASS ($name)"; PASS=$((PASS+1))
  else
    echo "FAIL ($name): $detail"; FAIL=$((FAIL+1))
  fi
}

DETECTED_IP="203.0.113.7"
USER_DOMAIN="chat.example.com"

# ── (a) CHANGE_ME only in a comment (fully-filled user .env, e.g. the
#        template's own hint comment) → NOT treated as unfilled: no
#        fill_env_secrets re-run, pre-set domain vars preserved ───────────────
new_case
fill_template_values "$ENV_FILE"
set_env_var "$ENV_FILE" TURN_DOMAIN "$USER_DOMAIN"
set_env_var "$ENV_FILE" CORS_ORIGIN "https://$USER_DOMAIN"
grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | grep -q CHANGE_ME && {
  echo "FAIL: setup error — filled template still has assignment-line CHANGE_ME"; exit 1;
}
cp "$ENV_FILE" "$ENV_FILE.before"
OUT="$(run_detection "$DETECTED_IP")"
check "a" "$([[ "$OUT" == *"NEEDS_GENERATION=false"* ]] && diff -q "$ENV_FILE.before" "$ENV_FILE" >/dev/null && echo 1 || echo 0)" \
  "out=[$OUT] diff=[$(diff "$ENV_FILE.before" "$ENV_FILE" | head -5)]"

# ── (b) real KEY=CHANGE_ME placeholders → secrets still auto-generated ───────
new_case
grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' "$ENV_FILE" >/dev/null || {
  echo "FAIL: template unexpectedly has no real placeholders"; exit 1;
}
OUT="$(run_detection "$DETECTED_IP")"
PG="$(env_var POSTGRES_PASSWORD "$ENV_FILE")"
JWT="$(env_var JWT_SECRET "$ENV_FILE")"
TURN_DOMAIN="$(env_var TURN_DOMAIN "$ENV_FILE")"
CORS="$(env_var CORS_ORIGIN "$ENV_FILE")"
check "b" "$([[ "$OUT" == *"NEEDS_GENERATION=true"* ]] \
  && ! grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' "$ENV_FILE" \
  && [[ "$PG" =~ ^[0-9a-f]{48}$ && "$JWT" =~ ^[0-9a-f]{64}$ ]] \
  && [[ "$TURN_DOMAIN" == "$DETECTED_IP" && "$CORS" == "https://$DETECTED_IP" ]] \
  && echo 1 || echo 0)" \
  "out=[$OUT] pg=[$PG] jwt_len=[${#JWT}] turn_domain=[$TURN_DOMAIN] cors=[$CORS]"

# ── (c) installer-filled .env re-run → idempotent no-op preserving values
#        (template's CHANGE_ME hint comment is present the whole time) ────────
new_case
OUT_FIRST="$(run_detection "$DETECTED_IP" "$USER_DOMAIN")"
cp "$ENV_FILE" "$ENV_FILE.filled"
OUT_SECOND="$(run_detection "$DETECTED_IP" "$USER_DOMAIN")"
check "c" "$([[ "$OUT_FIRST" == *"NEEDS_GENERATION=true"* && "$OUT_SECOND" == *"NEEDS_GENERATION=false"* ]] \
  && diff -q "$ENV_FILE.filled" "$ENV_FILE" >/dev/null && echo 1 || echo 0)" \
  "first=[$OUT_FIRST] second=[$OUT_SECOND] diff=[$(diff "$ENV_FILE.filled" "$ENV_FILE" | head -5)]"

# ── (d) mixed: CHANGE_ME comment + one real placeholder → fills ONLY the
#        placeholder; user's domain vars keep their values (installer knows
#        the domain via SETUP_DOMAIN, so no IP re-derivation) ─────────────────
new_case
fill_template_values "$ENV_FILE"
sed -i -e 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=CHANGE_ME_POSTGRES_PASSWORD|' "$ENV_FILE"
set_env_var "$ENV_FILE" TURN_DOMAIN "$USER_DOMAIN"
set_env_var "$ENV_FILE" CORS_ORIGIN "https://$USER_DOMAIN"
OUT="$(run_detection "$DETECTED_IP" "$USER_DOMAIN")"
PG="$(env_var POSTGRES_PASSWORD "$ENV_FILE")"
TURN_DOMAIN="$(env_var TURN_DOMAIN "$ENV_FILE")"
CORS="$(env_var CORS_ORIGIN "$ENV_FILE")"
check "d" "$([[ "$OUT" == *"NEEDS_GENERATION=true"* ]] \
  && [[ "$PG" =~ ^[0-9a-f]{48}$ && "$PG" != "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f" ]] \
  && [[ "$TURN_DOMAIN" == "$USER_DOMAIN" && "$CORS" == "https://$USER_DOMAIN" ]] \
  && echo 1 || echo 0)" \
  "out=[$OUT] pg=[$PG] turn_domain=[$TURN_DOMAIN] cors=[$CORS]"