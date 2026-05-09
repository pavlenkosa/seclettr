# Deployment Guide (Step-by-Step)

This guide is written for first-time operators.
You do not need to build from source: use the prebuilt release bundle from GitHub.

## 1. What You Need

- Linux server (Ubuntu 22.04+ recommended)
- Docker + Docker Compose plugin
- Open ports:
  - `80` and `443` for web mode/full mode
  - `3478` (TURN) + UDP media ranges if calls are enabled
- Domain name (recommended for production)

If Docker is missing, use the helper installer from the release bundle:

```bash
./install-docker.sh
```

## 2. Download the Bundle from GitHub

1. Open the repository page on GitHub.
2. Go to **Releases**.
3. Download the latest **Seclettr Main Snapshot** assets:
- `seclettr-release-main-<timestamp>.tar.gz`
- `seclettr-release-main-<timestamp>.tar.gz.sha256`

## 3. Verify Download Integrity

```bash
sha256sum -c seclettr-release-main-<timestamp>.tar.gz.sha256
```

Expected result: `OK`.

## 4. Unpack the Bundle

```bash
tar -xzf seclettr-release-main-<timestamp>.tar.gz
cd seclettr-release-main-<timestamp>
```

## 5. Prepare Environment File

The installer generates secrets automatically on first run, so you can skip this step and go straight to step 8.

If you want to review or customise values before the first run:

```bash
cp .env.example .env
```

Open `.env` and adjust:

- `CORS_ORIGIN` — the URL your users will access (e.g. `https://chat.example.com`)
- `TURN_DOMAIN` — domain or IP of the TURN server
- `TURN_EXTERNAL_IP` / `ANNOUNCED_IP` — public IP of the server (auto-detected if omitted)

All cryptographic secrets (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `TURN_SECRET`,
`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `METRICS_BEARER_TOKEN`) are generated automatically
if you leave them as `CHANGE_ME_*` placeholders.

## 6. Choose Deployment Mode

### Mode A: Full stack (web + backend + infra)
Best for single-server deployment.

### Mode B: Backend only
Runs API/SFU/infra without web frontend.

### Mode C: Web only
Runs web frontend only and points to external API/SFU.

## 7. TLS or HTTP

### Production (recommended): TLS
- If `./nginx/certs/cert.pem` and `key.pem` are absent, the installer generates a
  **self-signed certificate** automatically using the configured domain/IP.
- To use a trusted certificate (Let's Encrypt, etc.), place files into `./nginx/certs/`
  **before** running the installer:
  - `cert.pem`
  - `key.pem`
- Keep `NETWORK_MODE=tls`.

> **Note:** Self-signed certificates will trigger a browser security warning.
> Replace them with a CA-signed certificate for public-facing deployments.

### Local/test only: HTTP
- Use `--network http` at install time.

## 8. Run Installer

### Interactive (recommended for first run)

```bash
./install.sh --interactive
```

### Non-interactive examples

```bash
# Full stack over TLS
./install.sh --mode full --network tls

# Backend only
./install.sh --mode backend --non-interactive

# Web only targeting external backend
./install.sh --mode web --network http \
  --web-api-url https://api.example.com/api \
  --web-sfu-url https://api.example.com/sfu
```

## 9. Check That Services Are Healthy

```bash
docker compose -p seclettr --env-file .env -f docker-compose.yml ps
```

Then verify:

- API health: `http://127.0.0.1:3001/health`
- Web:
  - `https://<your-domain>` (TLS mode)
  - `http://<your-domain>` (HTTP mode)

## 10. Common Operations

### View logs

```bash
docker compose -p seclettr --env-file .env -f docker-compose.yml logs -f api sfu web
```

### Restart services

```bash
docker compose -p seclettr --env-file .env -f docker-compose.yml restart
```

### Stop stack

```bash
docker compose -p seclettr --env-file .env -f docker-compose.yml down
```

## 11. Update to a New Version

The release bundle has a built-in update mode. It keeps Docker volumes in place,
copies your runtime configuration from the previous bundle, loads the new images,
runs migrations, and restarts only the services required by the selected mode.

### Easiest update path

Upload the new release archive into the current unpacked release directory and run:

```bash
cd /path/to/current/seclettr-release-main-<old-timestamp>
./install.sh --update ./seclettr-release-main-<new-timestamp>.tar.gz
```

The current installer will:

- unpack the new archive next to the current release directory
- hand off to the new archive's `install.sh`
- copy `.env` and TLS certificates from the current release
- create a backup
- load new Docker images
- run database migrations
- restart containers without deleting Docker volumes

### Manual update path

```bash
# 1. Download and verify the new bundle
sha256sum -c seclettr-release-main-<new-timestamp>.tar.gz.sha256

# 2. Unpack the new bundle
tar -xzf seclettr-release-main-<new-timestamp>.tar.gz
cd seclettr-release-main-<new-timestamp>

# 3. Run update, pointing to the previous unpacked release directory
./install.sh update --from /path/to/previous/seclettr-release-main-<old-timestamp>
```

During update the installer creates `backups/update-<timestamp>/` with:

- `.env`
- TLS certificates, if present
- `runtime-config.js`, if present
- `postgres.sql.gz`, if the previous Postgres container is running

Do not run `uninstall.sh` for an update unless you intentionally want to remove
the deployment. The update flow does not remove Docker volumes, so Postgres and
MinIO data remain in place.

## 12. Security Notes

- Do not expose Postgres/Redis/MinIO ports publicly.
- Use strong secrets in `.env`.
- Use TLS in production.
- Keep Docker host and OS patched.
- Read legal notices: `LEGAL_NOTICE.md`
