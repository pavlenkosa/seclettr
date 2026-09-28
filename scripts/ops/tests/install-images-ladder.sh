#!/usr/bin/env bash
# Regression tests for the installer's third-party image acquisition ladder
# (ensure_images_available in scripts/release/install.sh).
#
# Tests drive the REAL ladder function from install.sh (via the
# SECLETTR_INSTALL_SHELL_ONLY source-guard) with a docker command shim whose
# behavior is controlled by an image-state file; every docker invocation is
# recorded so tests can assert the exact arguments (pinned tags, no floats).
#
# Run: pnpm test:install-ladder  (or bash scripts/ops/tests/install-images-ladder.sh)
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SH="$SCRIPT_DIR/../../release/install.sh"

PINS=(
  "postgres:16-alpine"
  "redis:7-alpine"
  "bitnamilegacy/minio:2025.7.23-debian-12-r5"
  "bitnamilegacy/minio-client:2025.7.21-debian-12-r3"
  "coturn/coturn:4.18.0-r0-alpine"
)

PASS=0; FAIL=0

finish() {
  echo ""
  echo "Passed: $PASS  Failed: $FAIL"
  [[ $FAIL -eq 0 ]] || exit 1
}
trap finish EXIT

make_shim_full() {
  # Full shim: inspect/load/pull driven by state file; logs every invocation.
  # State file grammar:
  #   image <ref>   → image inspect succeeds for <ref>
  #   archive <ref> → `docker load` imports <ref> into the state
  #   fail <ref>    → `docker pull <ref>` fails
  cat > "$WORK/docker" <<'SHIM'
#!/usr/bin/env bash
echo "$*" >> "$SECLETTR_TEST_LOG"
state="$SECLETTR_TEST_STATE"
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  grep -qx "image $3" "$state" && exit 0 || exit 1
fi
if [[ "$1" == "load" ]]; then
  while read -r kind val; do
    [[ "$kind" == "archive" ]] && echo "image $val" >> "$state"
  done < "$state"
  exit 0
fi
if [[ "$1" == "pull" ]]; then
  ref="$2"
  while read -r kind val; do
    [[ "$kind" == "fail" && "$val" == "$ref" ]] && exit 1
  done < "$state"
  echo "image $ref" >> "$state"
  exit 0
fi
exit 0
SHIM
  chmod +x "$WORK/docker"
}

new_case() {
  WORK="$(mktemp -d /tmp/seclettr-ladder.XXXXXX)"
  export SECLETTR_TEST_STATE="$WORK/images.state"
  export SECLETTR_TEST_LOG="$WORK/docker.log"
  : > "$SECLETTR_TEST_STATE"; : > "$SECLETTR_TEST_LOG"
  make_shim_full
}

# run_ladder <offline:0|1> <archive-file:0|1> [skip-load:0|1] — runs the REAL
# ensure_images_available in a subshell; prints its output.
run_ladder() {
  local offline="$1" has_archive="$2" skip_load="${3:-0}"
  : > "$SECLETTR_TEST_LOG"

  (
    set +e
    unset MINIO_IMAGE MINIO_MC_IMAGE COTURN_IMAGE
    export SECLETTR_INSTALL_SHELL_ONLY=1
    # shellcheck disable=SC1090
    source "$INSTALL_SH"

    # install.sh top-level assignments ran before its guard — set harness
    # vars AFTER source so they survive.
    DOCKER_CMD=("$WORK/docker")
    SELECTED_SERVICES=(postgres redis minio minio-init coturn api sfu web)
    DEPLOY_MODE="full"
    SKIP_MIGRATE=false
    SKIP_LOAD=$([[ "$skip_load" == "1" ]] && echo true || echo false)
    OFFLINE_MODE=$([[ "$offline" == "1" ]] && echo true || echo false)
    IMAGE_ARCHIVE="$WORK/prebuilt-images.tar.gz"
    BUNDLE_DIR="$WORK"
    if [[ "$has_archive" == "1" ]]; then
      # Minimal gzip so the installer's -f check passes; the shim interprets load.
      printf 'archive-marker' | gzip > "$IMAGE_ARCHIVE"
    fi
    ensure_images_available
  ) 2>&1
}

log_count() { grep -c "^$1 " "$SECLETTR_TEST_LOG" || true; }
pulled_refs() { grep "^pull " "$SECLETTR_TEST_LOG" | awk '{print $2}' | sort; }

check() {
  local name="$1" ok="$2" detail="${3:-}"
  if [[ "$ok" == "1" ]]; then
    echo "PASS ($name)"; PASS=$((PASS+1))
  else
    echo "FAIL ($name): $detail"; FAIL=$((FAIL+1))
  fi
}

# ── (a) all images present → rc=0, silent, no pull, no load ─────────────────
new_case
for p in "${PINS[@]}"; do echo "image $p" >> "$SECLETTR_TEST_STATE"; done
RC=0
OUT="$(run_ladder 0 0)" || RC=$?
check "a" "$([[ $RC -eq 0 && $(log_count load) -eq 0 && $(log_count pull) -eq 0 && -z "$OUT" ]] && echo 1 || echo 0)" \
  "rc=$RC loads=$(log_count load) pulls=$(log_count pull) out=$OUT"

# ── (b) missing + online → pulls exactly the missing pinned tags ─────────────
new_case
OUT="$(run_ladder 0 0)"
PULLED="$(pulled_refs)"
EXPECTED_PULLED="$(printf '%s\n' "${PINS[@]}" | sort)"
check "b" "$([[ "$PULLED" == "$EXPECTED_PULLED" && $(log_count load) -eq 0 ]] && echo 1 || echo 0)" \
  "pulled=[$PULLED] expected=[$EXPECTED_PULLED] out=$OUT"

# ── (c) missing + archive contains the tags → load used, no pull ─────────────
new_case
for p in "${PINS[@]}"; do echo "archive $p" >> "$SECLETTR_TEST_STATE"; done
OUT="$(run_ladder 0 1)"
check "c" "$([[ $(log_count load) -eq 1 && $(log_count pull) -eq 0 ]] && echo 1 || echo 0)" \
  "loads=$(log_count load) pulls=$(log_count pull) out=$OUT"

# ── (d) explicit offline + archive missing → hard fail naming archive path ───
new_case
OUT="$(run_ladder 1 0)"
check "d" "$(grep -q "Offline mode: image archive not found: $WORK/prebuilt-images.tar.gz" <<<"$OUT" && echo 1 || echo 0)" \
  "out=$OUT"

# ── (e) pull failure → hard fail listing the image ────────────────────────────
new_case
echo "fail redis:7-alpine" >> "$SECLETTR_TEST_STATE"
OUT="$(run_ladder 0 0)"
check "e" "$(grep -q "Failed to pull required image(s): redis:7-alpine" <<<"$OUT" && echo 1 || echo 0)" \
  "out=$OUT"

# ── (f) load ok but required image still missing → hard fail listing image ───
# Pull disabled entirely (offline mode) with a no-op archive: load runs,
# satisfies nothing, and offline mode hard-fails listing the archive + images.
new_case
OUT="$(run_ladder 1 1)"
check "f" "$(grep -q "Offline mode: image archive did not satisfy required images" <<<"$OUT" && grep -q "postgres:16-alpine" <<<"$OUT" && echo 1 || echo 0)" \
  "out=$OUT"

# ── (g) attempted tags == compose pins exactly (no float/rewrite) ────────────
new_case
OUT="$(run_ladder 0 0)"
ALL_ARGS="$(grep -E '^(image inspect|pull) ' "$SECLETTR_TEST_LOG" | awk '{print $NF}' | sort -u)"
EXPECTED_ALL="$(printf '%s\n' "${PINS[@]}" | sort -u)"
FLOATS="$(grep -E ':latest|:main' "$SECLETTR_TEST_LOG" || true)"
check "g" "$([[ "$ALL_ARGS" == "$EXPECTED_ALL" && -z "$FLOATS" ]] && echo 1 || echo 0)" \
  "args=[$ALL_ARGS] floats=[$FLOATS]"

# ── (h) production parity: required set via REAL set_selected_services(full) ──
# Drive the real service selector under the source guard, then run the ladder
# with every pin missing, an archive present, and network allowed: it must
# pull exactly the 5 pinned third-party images and exit 0.
new_case
OUT="$(
  (
    set +e
    unset MINIO_IMAGE MINIO_MC_IMAGE COTURN_IMAGE
    export SECLETTR_INSTALL_SHELL_ONLY=1
    # shellcheck disable=SC1090
    source "$INSTALL_SH"

    DOCKER_CMD=("$WORK/docker")
    DEPLOY_MODE="full"
    SKIP_MIGRATE=false
    SKIP_LOAD=false
    OFFLINE_MODE=false
    IMAGE_ARCHIVE="$WORK/prebuilt-images.tar.gz"
    BUNDLE_DIR="$WORK"
    printf 'archive %s\n' "${PINS[@]}" > "$SECLETTR_TEST_STATE"

    # The real selector defines the required set (no harness hardcoding).
    set_selected_services
    : "${SELECTED_SERVICES:?"set_selected_services produced no services"}"

    ensure_images_available
  ) 2>&1
)"
RC=$?
PULLED="$(pulled_refs)"
EXPECTED_PULLED="$(printf '%s\n' "${PINS[@]}" | sort)"
check "h" "$([[ $RC -eq 0 && "$PULLED" == "$EXPECTED_PULLED" ]] && echo 1 || echo 0)" \
  "rc=$RC pulled=[$PULLED] expected=[$EXPECTED_PULLED] out=$OUT"

# ── (i) skip-load regression (exact CI bug): archive load skipped, pins still ──
# acquired via pull. SKIP_LOAD must mean "don't load prebuilt-images.tar.gz",
# never "don't acquire images".
new_case
OUT="$(run_ladder 0 1 1)"
RC=$?
PULLED="$(pulled_refs)"
EXPECTED_PULLED="$(printf '%s\n' "${PINS[@]}" | sort)"
LOADS="$(log_count load)"
check "i" "$([[ $RC -eq 0 && "$PULLED" == "$EXPECTED_PULLED" && "$LOADS" -eq 0 ]] && echo 1 || echo 0)" \
  "rc=$RC pulls=[$PULLED] loads=$LOADS expected=[$EXPECTED_PULLED] out=$OUT"
