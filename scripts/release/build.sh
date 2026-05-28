#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

OUT_DIR="$ROOT_DIR/artifacts"
BUNDLE_NAME="seclettr-release"
IMAGE_TAG="release"
SKIP_BUILD=false
SKIP_VERIFY=false

# Read version from root package.json
SECLETTR_VERSION="$(node -e "console.log(require('$ROOT_DIR/package.json').version)")"
GIT_REVISION="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
BUILD_TIMESTAMP="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

API_IMAGE="seclettr/api"
WEB_IMAGE="seclettr/web"
SFU_IMAGE="seclettr/sfu"

usage() {
  cat <<'USAGE'
Usage: ./scripts/release-build.sh [options]

Builds production Docker images for api/web/sfu and exports them into
a single compressed release bundle under ./artifacts.

Options:
  --out-dir <path>    Output directory (default: artifacts)
  --name <name>       Bundle name prefix (default: seclettr-release)
  --tag <tag>         Docker image tag (default: release)
  --skip-build        Reuse existing local images instead of rebuilding
  --skip-verify       Skip the pre-release verification gate
  -h, --help          Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --name)
      BUNDLE_NAME="$2"
      shift 2
      ;;
    --tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=true
      shift
      ;;
    --)
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

require_command tar
require_command gzip
require_command pnpm
resolve_docker_cmd

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGE_DIR="$OUT_DIR/${BUNDLE_NAME}-${STAMP}"
IMAGE_ARCHIVE="$STAGE_DIR/prebuilt-images.tar.gz"
ARCHIVE_PATH="$OUT_DIR/${BUNDLE_NAME}-${STAMP}.tar.gz"
RELEASE_COMPOSE_SRC="$ROOT_DIR/infra/docker-compose.release.yml"
RELEASE_HTTP_OVERRIDE_SRC="$ROOT_DIR/infra/docker-compose.release.http.yml"
ENV_TEMPLATE_SRC="$ROOT_DIR/infra/.env.example"
NGINX_SRC_DIR="$ROOT_DIR/infra/nginx"
MIGRATIONS_SRC_DIR="$ROOT_DIR/infra/migrations"
INSTALL_SCRIPT_SRC="$ROOT_DIR/scripts/release-install.sh"
UNINSTALL_SCRIPT_SRC="$ROOT_DIR/scripts/release-uninstall.sh"
SERVER_INSTALL_SCRIPT_SRC="$ROOT_DIR/scripts/server-install.sh"
LICENSE_SRC="$ROOT_DIR/LICENSE"
NOTICE_SRC="$ROOT_DIR/NOTICE"
THIRD_PARTY_NOTICES_SRC="$ROOT_DIR/THIRD_PARTY_NOTICES.md"
LEGAL_NOTICE_SRC="$ROOT_DIR/LEGAL_NOTICE.md"
DEPLOYMENT_GUIDE_SRC="$ROOT_DIR/DEPLOYMENT.md"

build_image() {
  local image_name="$1"
  local dockerfile_path="$2"

  log_step "Building $image_name:$IMAGE_TAG (version: $SECLETTR_VERSION)"
  run_with_retries 3 5 docker_cli build \
    --build-arg "SECLETTR_VERSION=$SECLETTR_VERSION" \
    --build-arg "GIT_REVISION=$GIT_REVISION" \
    --build-arg "BUILD_TIMESTAMP=$BUILD_TIMESTAMP" \
    -f "$dockerfile_path" -t "$image_name:$IMAGE_TAG" "$ROOT_DIR" \
    || die "Failed to build $image_name:$IMAGE_TAG after repeated attempts"
}

ensure_local_image() {
  local image_name="$1"
  docker_cli image inspect "$image_name:$IMAGE_TAG" >/dev/null 2>&1 \
    || die "Image not found locally: $image_name:$IMAGE_TAG"
}

mkdir -p "$STAGE_DIR"

if [[ "$SKIP_VERIFY" == "false" ]]; then
  log_step "Running pre-release verification gate"
  (cd "$ROOT_DIR" && pnpm verify:release)
fi

if [[ "$SKIP_BUILD" == "false" ]]; then
  build_image "$API_IMAGE" "$ROOT_DIR/apps/api/Dockerfile"
  build_image "$WEB_IMAGE" "$ROOT_DIR/apps/web/Dockerfile"
  build_image "$SFU_IMAGE" "$ROOT_DIR/apps/sfu/Dockerfile"
fi

ensure_local_image "$API_IMAGE"
ensure_local_image "$WEB_IMAGE"
ensure_local_image "$SFU_IMAGE"

log_step "Exporting Docker images to $IMAGE_ARCHIVE"
docker_cli save \
  "$API_IMAGE:$IMAGE_TAG" \
  "$WEB_IMAGE:$IMAGE_TAG" \
  "$SFU_IMAGE:$IMAGE_TAG" \
  | gzip -c >"$IMAGE_ARCHIVE"
hash_file "$IMAGE_ARCHIVE"

log_step "Bundling runtime files"
log_step "Refreshing third-party license notices"
(cd "$ROOT_DIR" && pnpm licenses:third-party)

cp "$RELEASE_COMPOSE_SRC" "$STAGE_DIR/docker-compose.yml"
cp "$RELEASE_HTTP_OVERRIDE_SRC" "$STAGE_DIR/docker-compose.http.yml"
cp "$ENV_TEMPLATE_SRC" "$STAGE_DIR/.env.example"
cp "$INSTALL_SCRIPT_SRC" "$STAGE_DIR/install.sh"
cp "$UNINSTALL_SCRIPT_SRC" "$STAGE_DIR/uninstall.sh"
cp "$SERVER_INSTALL_SCRIPT_SRC" "$STAGE_DIR/install-docker.sh"
cp "$LICENSE_SRC" "$STAGE_DIR/LICENSE"
cp "$NOTICE_SRC" "$STAGE_DIR/NOTICE"
cp "$THIRD_PARTY_NOTICES_SRC" "$STAGE_DIR/THIRD_PARTY_NOTICES.md"
cp "$LEGAL_NOTICE_SRC" "$STAGE_DIR/LEGAL_NOTICE.md"
cp "$DEPLOYMENT_GUIDE_SRC" "$STAGE_DIR/DEPLOYMENT.md"
chmod +x "$STAGE_DIR/install.sh" "$STAGE_DIR/uninstall.sh" "$STAGE_DIR/install-docker.sh"
cp -R "$NGINX_SRC_DIR" "$STAGE_DIR/nginx"
mkdir -p "$STAGE_DIR/nginx/certs"
cp -R "$MIGRATIONS_SRC_DIR" "$STAGE_DIR/migrations"

cat >"$STAGE_DIR/RELEASE_INFO.txt" <<EOF
version=${SECLETTR_VERSION}
created_at=${BUILD_TIMESTAMP}
git_revision=${GIT_REVISION}
bundle_name=${BUNDLE_NAME}-${STAMP}
image_archive=$(basename "$IMAGE_ARCHIVE")
images=${API_IMAGE}:${IMAGE_TAG},${WEB_IMAGE}:${IMAGE_TAG},${SFU_IMAGE}:${IMAGE_TAG}
load_command=docker load -i prebuilt-images.tar.gz
install_command=./install.sh
EOF

cat >"$STAGE_DIR/DEPLOY.md" <<EOF
# Release Bundle

This bundle contains production Docker images for the Seclettr API, web, and SFU services.
It supports single-node deployment modes without rebuilding images:

- \`full\` — web + backend + infra
- \`backend\` — backend + infra only
- \`web\` — web frontend only (can target external backend via runtime URLs)

## Load Images

\`\`\`bash
./install.sh
\`\`\`

## Images Included

- ${API_IMAGE}:${IMAGE_TAG}
- ${WEB_IMAGE}:${IMAGE_TAG}
- ${SFU_IMAGE}:${IMAGE_TAG}

## Bundle Runtime Files

- \`docker-compose.yml\` — standalone runtime using prebuilt images
- \`docker-compose.http.yml\` — HTTP-only override for simple non-TLS testing
- \`.env.example\` — environment template
- \`migrations/\` — SQL migrations for the bundled migration runner
- \`nginx/\` — nginx configs and cert mount point
- \`install.sh\` — load images, run migrations, and start the stack
- \`uninstall.sh\` — stop services, remove containers, volumes, and optionally images
- \`install-docker.sh\` — optional Docker/Compose installer for Ubuntu/Debian
- \`DEPLOYMENT.md\` — step-by-step deployment guide
- \`LICENSE\`, \`NOTICE\`, \`THIRD_PARTY_NOTICES.md\`, \`LEGAL_NOTICE.md\` — legal bundle for redistribution

## First-Run Flow

1. Run the interactive installer. It can generate secrets and a self-signed certificate automatically.
2. For a trusted TLS certificate, place \`cert.pem\` and \`key.pem\` into \`./nginx/certs/\` before running the installer, or choose Let's Encrypt in the wizard.
3. Optional: copy \`.env.example\` to \`.env\` if you want to review values before the first run.

\`\`\`bash
./install.sh --interactive
\`\`\`

\`\`\`bash
# Full stack over HTTPS
./install.sh --mode full --network tls
\`\`\`

\`\`\`bash
# Backend only
./install.sh --mode backend --non-interactive
\`\`\`

\`\`\`bash
# Web-only targeting external backend
./install.sh --mode web --network http \\
  --web-api-url https://api.example.com/api \\
  --web-sfu-url https://api.example.com/sfu
\`\`\`

## Update Flow

Put the new release archive into the current unpacked release directory and run:

\`\`\`bash
./install.sh --update ./seclettr-release-main-NEW.tar.gz
\`\`\`

The installer unpacks the new bundle next to the current one, copies \`.env\`
and TLS certificates, creates a backup, runs migrations, loads new images, and
restarts containers without deleting Docker volumes.
EOF

log_step "Packing release bundle to $ARCHIVE_PATH"
tar -czf "$ARCHIVE_PATH" -C "$OUT_DIR" "$(basename "$STAGE_DIR")"
hash_file "$ARCHIVE_PATH"

log_ok "Release bundle created"
echo "  Bundle dir: $STAGE_DIR"
echo "  Archive:    $ARCHIVE_PATH"
if [[ -f "${ARCHIVE_PATH}.sha256" ]]; then
  echo "  Checksum:   ${ARCHIVE_PATH}.sha256"
fi
