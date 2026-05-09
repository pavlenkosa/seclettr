# Seclettr - Full-Stack E2EE Messenger

Seclettr is a monorepo for an end-to-end encrypted messenger including a web client, API, and SFU calling service.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
  - [Requirements](#requirements)
  - [Initial Development Setup](#initial-development-setup)
- [Development](#development)
  - [Core Commands](#core-commands)
  - [Testing](#testing)
- [Release and Deployment](#release-and-deployment)
  - [Build Release Bundle](#build-release-bundle)
  - [Automatic GitHub Release Artifacts](#automatic-github-release-artifacts)
  - [Installer Modes](#installer-modes)
  - [Step-by-Step Deployment Guide](#step-by-step-deployment-guide)
- [Contributing](#contributing)
  - [PR Rules](#pr-rules)
  - [Pre-Submit Checks](#pre-submit-checks)
- [Legal Notice](#legal-notice)
- [License](#license)

## Features

### What Is Included

- `apps/web`: browser client (React + Vite) with desktop and mobile chat layouts.
- `apps/api`: HTTP + WebSocket backend (Fastify) for auth, messaging, groups, calls, attachments, push.
- `apps/sfu`: mediasoup-based SFU for group call media routing.
- `packages/protocol`: shared wire contracts (Zod schemas + TypeScript types) used by web/api/sfu.
- `packages/crypto`: crypto helpers and protocol primitives used by the client and server flows.

### Messaging and Daily Use

- Direct encrypted chats with:
  - delivery/read acknowledgements;
  - typing and online presence signals;
  - message search in active threads;
  - offline catch-up via pending message delivery.
- Encrypted media and files in direct chats:
  - generic encrypted file attachments;
  - voice notes;
  - video notes;
  - digest checks before decrypt/download to detect corrupted payloads.
- Group chats with:
  - member roster and role model (`owner` / `admin` / `member`);
  - encrypted sender-key group history replay;
  - membership-aware live updates.

### Security Model

- End-to-end encrypted messaging model: payload encryption happens on client devices.
- Device-based identity model:
  - per-device key material provisioning;
  - signed prekey rotation and one-time prekey replenishment;
  - local trust checks with explicit re-verify flow when peer identity changes.
- Optional app lock with local 4-digit PIN and inactivity auto-lock.
- Call security modes in UI (`compatibility` / `balanced` / `strict`) for frame-level media protection strategy.

### Calls and Real-Time

- Direct 1:1 audio/video calls with authenticated signaling over WebSocket.
- Group audio/video calls:
  - live participant roster;
  - join/leave and active-call discovery endpoints;
  - stage-focused layout for active media.
- Screen sharing support in call UIs (with dedicated stage/viewer controls).
- Missed-call tracking surfaces (direct and group) on next session.

### Notifications, UX, and Client Runtime

- Browser push notifications with per-category preferences:
  - direct messages;
  - group messages;
  - call invites;
  - sender visibility in notification content.
- Built-in language support: English and Russian.
- Service worker registration for push runtime (`/push-sw.js`).
- Error boundary and client-error reporting endpoint for runtime diagnostics.

### Deployment and Operations

- Docker-based local development stack.
- Release bundle flow with prebuilt images and installer script.
- Installer deployment modes:
  - `full`: web + backend + infra;
  - `backend`: backend + infra;
  - `web`: web-only mode (can target external backend URLs).
- Health and readiness endpoints (`/health/live`, `/health/ready`) and Prometheus-style metrics endpoint (`/metrics`).

## Installation

### Requirements

- Node.js `>= 22`
- pnpm `>= 8` (repo currently uses `pnpm@8.15.0`)
- Docker + Docker Compose (for local stack and release deployment)

### Initial Development Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```
3. Start the development stack:
   ```bash
   pnpm dev
   ```

## Development

### Core Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start local development stack |
| `pnpm dev:down` | Stop local development stack |
| `pnpm build` | Build all apps/packages |
| `pnpm typecheck` | Run TypeScript checks across workspace |
| `pnpm lint` | Run lint checks |
| `pnpm test` | Run workspace test targets |
| `pnpm verify:release` | Run release verification suite |
| `pnpm test:e2e -- --project=chromium` | Run Chromium smoke e2e |
| `pnpm licenses:third-party` | Regenerate third-party license inventory |

### Testing

- Unit/API integration:
  - `pnpm --filter @seclettr/api test:unit`
  - `pnpm --filter @seclettr/api test:integration`
- Web tests:
  - `pnpm --filter @seclettr/web test`
- SFU tests:
  - `pnpm --filter @seclettr/sfu test`

## Release and Deployment

### Build Release Bundle

```bash
pnpm release:build
```

Output: an archive in `artifacts/` with prebuilt images and runtime files.

### Automatic GitHub Release Artifacts

For every successful push to `main` (after CI passes), GitHub Actions builds a release bundle automatically and publishes:

- an Actions artifact (`seclettr-release-<sha>`);
- a GitHub prerelease entry (`Seclettr Main Snapshot (<sha>)`) with downloadable assets.

Workflow files:

- `.github/workflows/ci.yml`
- `.github/workflows/release-bundle.yml`

### Installer Modes

From the unpacked release bundle:

```bash
./install.sh --interactive
```

Non-interactive modes:

```bash
# Full stack: web + backend + infra
./install.sh --mode full --network tls

# Backend + infra only
./install.sh --mode backend --non-interactive

# Web only (external backend)
./install.sh --mode web --network http \
  --web-api-url https://api.example.com/api \
  --web-sfu-url https://api.example.com/sfu
```

### Step-by-Step Deployment Guide

- [DEPLOYMENT.md](DEPLOYMENT.md)

## Contributing

### PR Rules

- Keep PRs small and focused.
- Do not mix bugfixes, refactors, and cosmetic edits in one PR.
- Include regression risk and validation plan in PR description.
- Never commit secrets, keys, or build artifacts.

### Pre-Submit Checks

```bash
pnpm typecheck
pnpm lint
pnpm verify:release
pnpm test:e2e -- --project=chromium
```

## Legal Notice

- Usage disclaimer and legal notice: [LEGAL_NOTICE.md](LEGAL_NOTICE.md).
- This notice supplements, but does not replace, [LICENSE](LICENSE).

## License

- Project license: [LICENSE](LICENSE) (Apache-2.0).
- Legal notice and usage disclaimer: [LEGAL_NOTICE.md](LEGAL_NOTICE.md).
- Copyright notice: [NOTICE](NOTICE).
- Third-party inventory: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Protocol package licensing:
  - [packages/protocol/LICENSE](packages/protocol/LICENSE)
  - [packages/protocol/NOTICE](packages/protocol/NOTICE)
