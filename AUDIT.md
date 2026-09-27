# Seclettr — Full Code & Delivery Audit

Date: 2026-09-26
Initial branch snapshot: `dev/main` @ `38bc2e4`
Follow-up snapshot: `dev/main` @ `7d257a9`
Method: risk-based read-only review of the monorepo (API, web, SFU, crypto, protocol,
infra, scripts, CI, tests, docs), repository-wide automated checks and targeted runtime
reproductions of critical claims. This was not a line-by-line review of every repository file;
the follow-up inventory contained 2,814 files, with approximately 195,000 TypeScript source
lines. No production code was modified during either audit pass.

Severity legend: **Critical** (blocks release/install or enables account compromise),
**High** (serious security/correctness), **Medium**, **Low**.

> This document is a point-in-time snapshot. Items marked "(fixed)" were addressed
> in the remediation pass that followed the audit; see the git history for details.

## Status update 2026-09-27

Current HEAD: `dev/main` @ `d42a543` (remediation continued through `4a5fa09`, plus the new
e2e-helper commit `d42a543`). Supersedes stale statements in the follow-up audit below:
lint is now 0 errors / 408 warnings (not 456); unit tests are now crypto 46 / API 150 / SFU 24 /
protocol 54 / web 1334 (not 149 API / 1,331 web); Playwright E2E (4/4 chromium) and the external
SFU suite (1/1) are wired into CI and pass locally against a live stack; API integration suites
run with a migration 030 baseline; the F5 unit-test gap is being addressed. CI state: Dev CI
PASSed on `be0bd21`; the Dev Bundle workflow was still failing at the smoke step on pre-fix
commits at last observation — the fix is committed in `56b9a00` and awaits a CI run.

## Follow-up audit at `7d257a9`

The follow-up pass found additional unresolved issues and corrected stale status claims from
the initial audit. Current release assessment: suitable for internal beta testing, but not ready
for a broad production release until the High items below and the verification gaps are resolved.

### F1 — High — Direct-message legacy AD fallback mutates ratchet state before authentication

- `packages/crypto/src/double-ratchet.ts:208-248` deletes skipped keys and/or advances `DHr`,
  `CKr`, and `Nr` before AES-GCM authentication succeeds.
- `apps/web/src/stores/messages/messages-inbound-decrypt-runtime.ts:70-81` retries an
  `OperationError` with legacy associated data using that same already-mutated state.
- Runtime reproduction on the real crypto package:
  - decrypt with v1 AD: `OperationError`;
  - retry the same valid legacy message with v0 AD: authentication still fails;
  - after one tampered attempt, retrying the original on the same state also fails and `Nr`
    advances again.
- The persisted session is normally not overwritten after a failed inbound decrypt because
  `loadSession()` deserializes a fresh state and `saveSession()` happens after success. The
  immediate fallback in the same call is nevertheless deterministically broken.
- Existing web coverage mocks `ratchetDecrypt`, so it proves control flow but not the real state
  transition. Required fix: decrypt against a cloned/candidate state and commit only after
  authentication, with real-crypto regression tests for tamper/retry and v1-to-v0 fallback.

### F2 — High — Current hardened branch is not the release branch

- At follow-up time `dev/main` was 14 commits ahead of `main`; the local checkout was also one
  commit ahead of `origin/dev/main`.
- `.github/workflows/release-bundle.yml:4-16` publishes from `main`; the `dev/main` workflow
  creates a development artifact but no GitHub Release.
- Therefore the reviewed fixes are not automatically represented by the production release
  channel. Promote the reviewed commit to `main` or define an explicit, verified release flow
  from the active branch.

### F3 — High/Medium — Production dependency advisories remain

- `pnpm audit --prod` on 2026-09-26 reported: 0 critical, 1 high, 11 moderate, 1 low.
- The High Fastify advisory `GHSA-jx2c-rxcm-jvmq` is allowlisted in
  `scripts/audit-prod-gate.mjs`. API and SFU have explicit control-character guards for
  `Content-Type`, which mitigate the described tab bypass, but the vulnerable dependency remains.
- Moderate advisories include Fastify validation/proxy issues, React Router open-redirect/XSS,
  mediasoup SCTP authentication, and transitive `protobufjs`/`uuid` issues. Some have reduced
  exploitability in the current configuration, but the gate accepts every Moderate advisory
  without a per-advisory decision record.
- Reassess each advisory, apply available patch-level updates where compatible, and document
  concrete non-exploitability evidence for every deferred item.

### F4 — Medium — Browser auth restore and refresh can wait indefinitely

- `apps/web/src/lib/session.ts:119-125` and `apps/web/src/lib/session-preview.ts:113-119`
  call browser `fetch` without a timeout or caller abort signal.
- `apps/web/src/stores/auth-session-restore.ts:97-103` blocks startup directly on session preview.
- A connection that never completes can leave startup pending, while the shared refresh promise
  blocks later HTTP, WebSocket, and SFU refresh consumers. The Capacitor path has explicit connect
  and read timeouts; the browser path does not.

### F5 — Medium — Refresh-token rotation is not concurrency-safe

- `apps/api/src/routes/auth/index.ts:566-605` verifies the old hash and then performs an
  unconditional update without a row lock, compare-and-swap predicate, or reuse record.
- Two tabs/processes can validate the same old token and issue different replacements; one
  response can contain a token that is already invalid. Per-tab promise deduplication does not
  coordinate separate tabs or native processes.
- A correct change needs explicit multi-tab semantics, a bounded previous-token grace/reuse
  strategy, and integration tests for concurrent refresh, replay, logout, and process restart.

### F6 — Medium — Runtime mode is still fail-open to development

- `apps/api/src/config.ts:74-92` still defaults missing `NODE_ENV` to `development`, which makes
  production-only weak-secret guards conditional on an operator remembering the variable.
- Reproduction with only `DATABASE_URL` and a 32-byte `JWT_SECRET` resolved to development with
  the default TURN secret and MinIO credentials.
- `ALLOW_PUBLIC_REGISTRATION` itself now correctly defaults to false, but the release Compose and
  `.env.example` explicitly default it to true without a prominent operator warning.
- Make runtime mode explicit for server startup and document the release registration policy.

### F7 — Medium — CI does not exercise the complete release surface

- Playwright tests under `tests/e2e` are not referenced by any workflow.
- `apps/api/src/test/group-call-sfu-bootstrap.test.ts` remains unwired in CI.
- The browser E2E suite currently has four smoke scenarios and does not cover encrypted groups,
  attachments, group/room calls, logout/revocation, or multi-tab refresh.
- Dev CI does not run coverage or `check:doc-paths`; main CI does.
- Android release/signing, fresh-install/upgrade, and real multi-browser/WebRTC compatibility
  remain outside the normal CI proof.

### F8 — Medium — Lint passes with a large warning backlog

- Repository lint returned zero errors but 456 warnings: 366 in web (74 files) and 90 in API
  (25 files).
- Production warnings include floating/misused promises, hook dependency warnings, unsafe
  assignments/member access and promise-returning UI handlers.
- The CI command therefore proves only "no lint errors", not absence of the classes represented
  by warning-only rules. Prioritize production `no-floating-promises`, hook dependency, and async
  event-handler warnings before tightening the warning budget.

### F9 — Medium/Low — Test depth and signal quality are uneven

- Follow-up line coverage: protocol 89.5%, crypto 80.4%, web 64.4%, SFU 49.3%, API 20.5%.
  API's configured line threshold is only 18%, and default coverage excludes integration suites.
- 1,589 unit tests passed, but the web suite emits extensive React `act(...)` warnings, attempted
  real fetches from presentation tests, repeated Capacitor plugin registration messages, and an
  asynchronous pending-sync error after a test. This noise can conceal new regressions.
- Local API integration execution was blocked by missing `DATABASE_URL`; external SFU, Playwright,
  Android, and release-bundle installation were not executed during the follow-up.

### F10 — Medium/Low — Local-at-rest data protection remains incomplete

- `apps/web/src/stores/saved/useSavedMessagesStore.ts:44-48` stores saved message text and
  attachment data URLs as plaintext JSON in `localStorage`.
- The plain-message cache key is derived from non-secret identifiers and is obfuscation rather
  than protection against a local attacker.
- This is an acknowledged design task rather than a mechanical encryption change: it requires an
  OS-keystore/passphrase-backed key, migration behavior, and a documented local-attacker model.

### Follow-up verification evidence

- Passed: `pnpm verify:release`, API unit tests (136), crypto tests (44), protocol tests (54),
  SFU tests (24), web tests (1,331), full five-package coverage gate, typechecks, web production
  build/bundle budgets, UI contract/style checks, `check:doc-paths`, third-party notice check,
  and `git diff --check`.
- `pnpm lint` passed with the 456 warnings recorded above.
- `pnpm audit:prod:gate` passed only because the High advisory is explicitly allowlisted and
  Moderate advisories are outside the failure policy.
- Not run/proven: database-backed API integration, external SFU integration, Playwright E2E,
  Android artifacts/signing, full Docker bundle install/upgrade, and real browser media matrices.

---

## 1. Critical

### C1 — Install URL points at a branch where the installer does not exist
- `README.md:196,202`, `DEPLOYMENT.md:27` instruct:
  `https://raw.githubusercontent.com/stepan-pavlenko/seclettr/main/scripts/ops/install-bootstrap.sh`
- Verified: `git cat-file -e main:scripts/ops/install-bootstrap.sh` → `fatal: not in 'main'`.
  The default branch `main` still has the old flat layout (`scripts/install-bootstrap.sh`);
  the new CLI layout only exists on `dev/main`. Every documented install URL 404s for a fresh user.
- Additionally `main:README.md` still references `github.com/pavlenkosa/seclettr`, but the
  actual remote is `stepan-pavlenko/seclettr`.
- Fix: merge `dev/main` → `main` (or retarget docs), add a CI guard that README raw paths exist.
  - Fix (partial, done): the documented URLs now match the repository layout (verified remotely:
    `origin/main` has `scripts/ops/install-bootstrap.sh` and README/DEPLOYMENT reference
    `stepan-pavlenko/seclettr`). A `check:doc-paths` guard runs in CI and fails if a documented
    raw URL points at a missing file or a non-default branch. Deciding whether `main` is the
    released branch remains an operational call.

### C2 — Release pipeline never runs for the active branch
- `.github/workflows/release-bundle.yml:4-10` triggers on `workflow_run` for branch `main` only.
- Active development is `dev/main`; `.github/workflows/dev-bundle.yml` builds artifacts but
  never publishes a GitHub Release (no `softprops/action-gh-release`).
- Net effect: no downloadable release bundle is produced from the active branch, so the
  bootstrap installer cannot find an asset.
- Fix: promote `dev/main` to `main`, and/or publish a release from the dev bundle.

### C3 — Android release artifacts are unsigned and can silently be omitted
- `apps/web/android/app/build.gradle:19-24` has no `signingConfigs` and no `signingConfig`
  on the release build type, so `assembleRelease` produces an unsigned APK.
- `.github/workflows/release-bundle.yml:203-205` lists `app-release.apk`/`app-release.aab`
  with `fail_on_unmatched_files: false`; the dev branch removed the "skipped (no keystore)"
  fallback, so releases can succeed with no mobile artifacts at all.
- Fix (chosen): temporarily remove APK/AAB from releases until a real keystore + signing
  config exist; set `fail_on_unmatched_files: true` for the bundle itself.

### C4 — Group-call frame E2EE fails open in "required" mode
- `apps/web/src/calls/shared/crypto/frame-crypto-core.ts:283-296`: when no key is armed, the
  sender returns the raw frame (`return frameData`) and the receiver passes non-magic frames
  straight through. Plaintext RTP is transmitted/received while the UI reports "encrypted".
- `apps/web/src/calls/group/runtime/sfu/producer-runtime.ts:132` gates `required` only on
  browser support, not on key presence.
- Fix (done): fail closed — drop the frame and surface a downgrade signal; gate required mode
  on an armed key.

### C5 — Stored XSS via plain attachments (same-origin token theft)
- `apps/api/src/routes/plain/attachments.ts:117-180`: `contentType` is free-form and persisted,
  then used as `eq $Content-Type` in the presigned POST.
- `infra/nginx/nginx.conf:106-130`: the MinIO proxy location does not include
  `security-headers.conf` and sets no `Content-Disposition`, so attacker-controlled HTML/SVG
  can be served from the app origin. Because `/api/auth/refresh` is same-origin, a successful
  script can mint an access token → account takeover.
- Fix (done): restrict allowed MIME types, force `Content-Disposition: attachment` +
  `X-Content-Type-Options: nosniff` on the plain bucket proxy.

### C6 — E2E and external-SFU tests never run in CI
- API integration suites are now explicitly enabled in both main and dev CI with
  `QM_API_INCLUDE_INTEGRATION_TESTS=1`.
- `tests/e2e` (Playwright) is referenced by no workflow; `group-call-sfu-bootstrap.test.ts`
  (`test:integration:external`) is never invoked.
- Fix (partial, done at `7d257a9`): integration selection uses explicit
  `QM_API_INCLUDE_INTEGRATION_TESTS` / `QM_API_INCLUDE_EXTERNAL_SFU_TESTS` flags rather than
  `process.argv` sniffing. Playwright E2E and the external-SFU suite remain unwired.

### C7 — Storage images no longer exist on Docker Hub (fresh install cannot start)
- `infra/docker-compose.yml:70,91`, `infra/docker-compose.release.yml:97,116`, and
  `scripts/release/install.sh:909-911` pull `minio/minio:latest` / `minio/mc:latest`.
- Verified 2026-09-26: Docker Hub returns `object not found` (404) for the `minio` namespace
  (`https://hub.docker.com/v2/repositories/minio/minio/`), while `postgres`, `redis`, and
  `coturn` resolve and pull normally from the same host/network.
  `docker pull minio/minio:latest` → `pull access denied ... repository does not exist`.
  `quay.io/minio/*` and `ghcr.io/minio/*` also return unauthorized/denied.
- Effect: a fresh install or `docker compose pull` fails at the storage service; the stack cannot
  start. This is independent of the audit branch and affects every deployment.
- Fix (done): images are now configurable (`MINIO_IMAGE` / `MINIO_MC_IMAGE`) and default to
  pinned, verified-working equivalents (`bitnamilegacy/minio:2025.7.23-debian-12-r5`,
  `bitnamilegacy/minio-client:2025.7.21-debian-12-r3`). `user: "0:0"` is set on the MinIO service
  because the replacement image defaults to UID 1001 and cannot write the root-owned data volume;
  the healthcheck and init container commands are unchanged. Verified end-to-end with
  `docker compose up minio minio-init`: healthy + bucket created.

---

## 2. High

### H1 — Cross-thread content disclosure via `replyToId`
- `apps/api/src/routes/plain/messages.ts:114,217` and `apps/api/src/routes/plain/groups.ts:812`
  accept any UUID as `replyToId` without verifying the target is in the same thread/group,
  visible to the sender, or not deleted. `HISTORY_SQL` does
  `LEFT JOIN plain_messages rp ON rp.id = pm.reply_to_id` and returns `rp.content`.
- Impact: a sender can reference a message from another user's thread and read its content via
  the reply preview.
- Fix (done): validate target thread/visibility/deletion before insert; reject otherwise.

### H2 — Insecure configuration defaults
- `apps/api/src/config.ts:16-40`: non-production auto-loads `infra/.env.dev|.env.sandbox|.env`.
- `:42-52,65`: `EnvBooleanSchema` resolves `undefined`/`""` to **true**, so
  `ALLOW_PUBLIC_REGISTRATION` defaults to open registration.
- `:55`: `NODE_ENV` defaults to `development`, disabling every production guard.
- Impact: a bare-metal `pnpm start` without `NODE_ENV=production` runs with open registration
  and weak-secret allowances.
- Fix (partial): `ALLOW_PUBLIC_REGISTRATION` now defaults to false and dotenv loading is limited
  to explicit opt-in/test. `NODE_ENV` still defaults to `development`; see F6. Release Compose
  also explicitly defaults public registration to true.

### H3 — Attachment verification buffers whole objects in memory
- `apps/api/src/routes/attachments/index.ts:170-244`: `verifyAttachmentObject` /
  `fetchAttachmentObjectBytes` load up to `MAX_ATTACHMENT_BYTES` (default 100 MiB) into the
  process to hash it. Concurrent verifications exhaust heap.
- Fix (done): stream into `crypto.createHash` instead of buffering the full blob.

### H4 — Access tokens survive logout
- `apps/api/src/middleware/auth.ts:23-39` only verifies the JWT (`tokenUse==="access"`) and
  never consults `auth_sessions`, so a revoked session's access token (and its WS connection)
  remains valid until expiry.
- Fix (done): check session liveness on protected requests and WS connect.

### H5 — WebSocket Authorization header does not enforce `tokenUse`
- `apps/api/src/services/ws-auth.ts:85-96`: for the `Authorization` header source, no
  `tokenUse` check is performed, so a `guest`/`contact` token can open `/ws`.
- Fix (done): require `ws`/`access` for all sources.

### H6 — Android backup can exfiltrate E2EE material
- `apps/web/android/app/src/main/AndroidManifest.xml:5` sets `android:allowBackup="true"`.
- `res/xml/backup_rules.xml` / `res/xml/data_extraction_rules.xml` exclude only two
  SharedPreferences files; IndexedDB lives under `app_webview/` and is not excluded.
- Fix (done): disable backup / exclude webview storage.

### H7 — Media-key ACK can be forged
- `apps/web/src/calls/group/runtime/media-key/media-key-ack-proof.ts:63`: `if (!proof) return true`.
- `apps/web/src/calls/group/runtime/useGroupCallInboundAckVerification.ts:49-51`: an unknown
  `keyId` is verified against `new Uint8Array(32)` (all-zero key) and then acknowledged.
- Fix (done): require the proof; reject ACKs with no matching local key.

### H8 — Media keys are not zeroized on teardown
- `apps/web/src/calls/direct/runtime/useDirectCallFrameCryptoRuntime.ts:155-179` clears refs but
  never `fill(0)`s `sendKeyBytes`/`recvKeyBytes`.
- `apps/web/src/calls/group/runtime/sfu/consumer-manager.ts:63,304` drops
  `remoteFrameKeyContextsByDeviceId` without zeroizing raw key bytes.
- Fix (done): zero key buffers on close/reconfigure.

### H9 — Third-party notices generator is a silent no-op
- `scripts/generate-third-party-notices.mjs:90-101` reads `rawEntry.version` / `rawEntry.path`,
  but `pnpm licenses list --prod --json` emits `versions: []` / `paths: []`. Every entry is
  skipped, `packages.length === 0`, and the script exits 0 before the `--check` comparison.
- Impact: `pnpm licenses:third-party:check`, the git pre-commit hook, and `release:build`
  cannot detect a stale `THIRD_PARTY_NOTICES.md` (legal/compliance false negative).
- Fix (done): iterate `versions` × `paths`; make `--check` compare even at zero packages.

### H10 — Base Compose web service is broken on Linux
- `infra/docker-compose.yml:228-229`: healthcheck probes `http://127.0.0.1:8080`, which nginx
  answers with a 301 to HTTPS (`infra/nginx/nginx.conf:45-49`), so web is never healthy.
- `infra/docker-compose.yml:215-233`: `web` has no `extra_hosts`, but
  `infra/nginx/nginx.conf:34-37` declares `upstream sfu { server host.docker.internal:3002; }`,
  which is unresolvable on Linux without `host-gateway` → nginx exits at startup.
- Fix (done): add `extra_hosts`, fix the healthcheck.

### H11 — `seclettr dev test-env` writes to a non-existent path
- `scripts/dev/test-env.sh:4-6`: `ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"` resolves to
  `scripts/`, so `TARGET="$ROOT/infra/.env.test"` = `scripts/infra/.env.test`.
- Fix (done): `../..`.

### H12 — Installer leaves secrets and keys world-readable
- `scripts/release/install.sh:569,604,629,645,1690`: `chmod 644 key.pem`.
- `scripts/release/install.sh:1865-1869`: `.env` created with the default umask, never
  restricted.
- Fix (done): `chmod 600` for `.env`, `640` for private keys.

### H13 — SFU resource exhaustion and weak access control
- `apps/sfu/src/sfu-server.ts:267,346,459`: no caps on transports/producers/consumers/rooms.
- `apps/sfu/src/http-rate-limit.ts:19,64`: unbounded bucket Map with O(n) prune per request;
  `trustProxy: "loopback, linklocal, uniquelocal"` (`config.ts:102-103`) lets a LAN client
  spoof `X-Forwarded-For` and mint unlimited keys.
- `apps/sfu/src/sfu-server.ts:585-588`: `DELETE /rooms/:roomId/peers/:userId` does not call
  `ensureRoomAccess`.
- Fix (done): room access now enforced on peer delete; `maxRooms`/`maxPeersPerRoom`/
  `maxTransportsPerPeer`/`maxProducersPerPeer`/`maxConsumersPerPeer` caps added (503 on room cap,
  429 on per-device caps); rate-limit key no longer mixes spoofable `request.ip`; bucket Map
  bounded (`maxBuckets`) with opportunistic prune and fail-closed overflow. Caps are configurable
  via `SFU_MAX_*` / `SFU_RATE_LIMIT_MAX_BUCKETS`.

### H14 — Crypto memory/aliasing defects
- `packages/crypto/src/x3dh.ts:102-118`: `dh4` is not zeroized in the OTK branch.
- `packages/crypto/src/sender-keys.ts:137-149`: `cachedMk.fill(0)` mutates a `Uint8Array` owned
  by the caller's `state.MKSKIPPED`, permanently corrupting that state.
- Fix (done): `dh4` zeroized after concat; cached MK cloned before decrypt so only the clone is
  zeroized and `state.MKSKIPPED` is left intact. Regression test covers cache reuse across calls.

### H15 — Unbounded protocol schemas
- `packages/protocol/src/websocket.ts:72,104,156`: `sdp`, `candidate`, `rtpCapabilities` are
  unbounded `z.string()`.
- `packages/protocol/src/media-encryption.ts:58`: `encryptedKey` unbounded.
- `packages/protocol/src/common.ts:17-29`: recursive `JsonValueSchema` with no depth/node limit.
- Fix (done): `sdp`/`candidate`/`rtpCapabilities`/`encryptedKey` bounded via `MAX_*_LENGTH`;
  `JsonObjectSchema` uses `z.preprocess` with an iterative depth/node bound checked *before* the
  recursive parse (fails closed instead of overflowing the stack). Tests added.

---

## 3. Medium (selection)

Web
- No request timeouts on the API/session `fetch` paths (`apps/web/src/lib/api/client.ts:75-129`,
  `src/lib/session-preview.ts:115`).
  - Fix (partial, done): the shared API transport `request()` now composes a 30s
    `AbortSignal.timeout` with any caller-provided signal and maps a timeout to `ApiError(408)`.
    Uploads use a separate XHR/fetch path (`lib/upload-progress.ts`) and are unaffected. Browser
    session preview and refresh remain unbounded and can block restore/refresh if a request never
    settles; see F4.
- Logger redaction short-circuits at `depth > 2` (`src/lib/logger.ts:63`), leaking deep nested
  values in production.
  - Fix (done): values beyond the depth bound are replaced with `[Truncated]` instead of returned
    raw; sanitizer exported and covered by `logger-sanitize.test.ts`.
- Saved messages and part of the plain cache are plaintext/weakly encrypted at rest
  (`src/stores/saved/useSavedMessagesStore.ts:47`, `src/stores/plain/messages/plain-messages-cache.ts:30-46`).
  - Deferred with rationale: the plain cache "encryption" derives its AES-GCM key from
    `userId:deviceId`, neither of which is secret, so it is obfuscation rather than confidentiality
    against a local attacker. Extending the same scheme to saved messages would add complexity and
    the appearance of at-rest encryption without a real threat-model improvement (AGENTS.md §10).
    A meaningful fix requires a passphrase/OS-keystore-backed key and an explicit migration of the
    existing plaintext store; tracked as a design task rather than a mechanical change.
- `String.fromCodePoint(...blob)` can throw `RangeError` for large caches
  (`plain-messages-cache.ts:84`).
  - Fix (done): encode in 8 KB chunks (matching the attachment base64 pattern).

API
- Group member-count check is outside a transaction (`apps/api/src/routes/groups/index.ts:430-470`).
  - Fix (done): count check + inserts now run inside a transaction that locks the group row
    (`SELECT ... FOR UPDATE`), preventing concurrent add-member calls from exceeding the cap.
- Refresh-token rotation has no row lock / reuse detection (`routes/auth/index.ts:565-605`).
  - Deferred with rationale: the client deduplicates refresh calls per tab
    (`apps/web/src/lib/session.ts` `_refreshPromise`) but has no cross-tab coordination, so a naive
    single-use + row-lock scheme would invalidate legitimate refreshes from other tabs/devices and
    sign users out. A correct fix needs a short reuse grace window (accept the previous hash within
    N seconds) plus a schema column to track it, and must be validated across multi-tab and
    process-kill scenarios before shipping.
- `/metrics` bearer comparison is not constant-time (`src/index.ts:214-222`).
  - Fix (done): constant-time comparison via `lib/constant-time.ts` (hashes both sides to a fixed
    length before `timingSafeEqual`).
- Attachment storage 503 responses echo the raw S3 error via `details`
  (`routes/attachments/index.ts`), potentially exposing bucket names, endpoint URLs, or credential
  hints to clients.
  - Fix (done): the 503 body is now a generic `{ error: "Attachment storage unavailable" }`; the
    detail remains in the server log. The write-only `lastError` state and its formatter were
    removed.
- Path params are generally not UUID-validated → 500 on malformed input.
  - Fix (done): root cause was that `fastify.setErrorHandler`/`setNotFoundHandler` were installed
    *after* route registration, so errors thrown in plugin scopes bypassed the custom handler and
    were serialized by Fastify's default handler — leaking the raw driver message (e.g. Postgres
    `22P02 invalid input syntax for type uuid`) with a 500. Handlers are now registered before any
    `register()` call, and `22P02` (invalid text representation) maps to a generic 400. Covered by
    `apps/api/src/test/malformed-param.test.ts`.

Infra / CI / supply chain
- `minio`, `mc`, `coturn` pinned to `:latest`.
  - Fix (done): MinIO images replaced with pinned, configurable equivalents (C7); coturn pinned
    to `4.18.0-r0-alpine` and made configurable via `COTURN_IMAGE`.
- No resource limits / `no-new-privileges` / `cap_drop` in compose.
  - Fix (done): `no-new-privileges` + `cap_drop: ALL` and memory ceilings added to the
    `api`/`sfu`/`web` (and `migrate`) services in both compose files; data services
    (postgres/redis/minio) are intentionally left unconstrained.
- Actions pinned to mutable tags; no Dependabot/SBOM/cosign/Sonar.
  - Fix (partial): Dependabot added for npm, GitHub Actions, and Docker. All workflow
    `uses:` references are now pinned to immutable commit SHAs. Release image builds now emit
    signed SBOM and provenance attestations (`sbom`/`provenance` on `docker/build-push-action`,
    with `id-token`/`attestations` permissions). cosign verification and Sonar remain open.
- Automated release always uses `--skip-verify`; `cancel-in-progress: true` on release.
  - Fix (partial): `cancel-in-progress: false` on release already fixed in Phase 0. The
    snapshot (`workflow_run`) build still passes `--skip-verify`; the manual,
    versioned release path runs the full gate.
- Dockerfiles copy the whole build tree into runtime images.
  - Fix (done): the API and SFU runtime stages now swap in a production-only `node_modules`
    (`proddeps` stage) and drop sources; the API image shrank from 447 MB to 256 MB and the SFU
    from ~600 MB to 218 MB. The `migrate` service runs the compiled `dist/db/migrate.js` instead
    of `pnpm db:migrate` (tsx), so it no longer needs dev dependencies. Verified both slim images
    serve `/health` and the compiled migrator runs against Postgres.
- `scripts/release/install.sh:215-258` installs the CentOS Docker repo on Fedora/RHEL.
  - Fix (done): the RHEL-family branches now select the Fedora/RHEL/CentOS repo by distro ID.

Tests
- No coverage thresholds; coverage only for 3 of 5 packages.
  - Fix (done): all five packages (web, api, crypto, protocol, sfu) now have ratchet coverage
    thresholds and a `test:coverage` script; the root `pnpm test:coverage` in CI runs all of them
    and fails on regression. All five coverage reports are uploaded as CI artifacts.
- No `apps/web/vitest.config.ts`; 238 test files rely on per-file environment docblocks.
  - Fix (done): `apps/web/vite.config.ts` now declares the shared test config (include globs,
    default `node` environment, globals). Per-file `@vitest-environment` docblocks still take
    precedence, so no test behavior changed.
- `apps/api/src/db/migrate.ts` baseline map omits migrations 015/027/029 and is untested.
  - Fix (done): baseline checks added for 015/027/029; `migrate-baseline.test.ts` fails if any
    migration file lacks a baseline entry.

Docs
- No `CHANGELOG`, `SECURITY`, `CODEOWNERS`, or `CONTRIBUTING`.
- `DEPLOYMENT.md` omits the SFU RTP range `40000-49999`.
  - Fix (done): `DEPLOYMENT.md` now documents the SFU media UDP range `40000-49999` alongside the
    TURN ports.

---

## 4. Positive observations

- All SQL is parameterized; no string-concatenated user input reaches SQL.
- No `dangerouslySetInnerHTML`, `eval`, `innerHTML`, or dynamic `Function` in the web app.
- Access tokens are memory-only; refresh tokens use HttpOnly cookies on web.
- No `@ts-ignore` / `@ts-expect-error` / TODO markers were found in non-test source. Explicit or
  inferred unsafe values do remain in production paths and are represented in the lint warning
  backlog; see F8.
- Private keys are never sent to the server; only public material is uploaded.
- Argon2id is used for the app-lock PIN with constant-time comparison.
- WebSocket client has backoff+jitter, bounded queue, protocol-version hard fail.
- Guest-room SFU access validates the guest session still exists after kick.

---

## 5. Recommended remediation order

1. Unblock delivery: merge `dev/main` → `main`, fix install URLs, notices generator, compose,
   installer permissions, Android release handling. (Phase 0)
2. Close critical security: frame-crypto fail-closed, media-key ACK proof, plain-attachment
   XSS, `replyToId` validation, config defaults, attachment streaming, session revocation,
   Android backup, media-key zeroization. (Phase 1)
3. Harden and instrument: SFU limits, crypto memory fixes, protocol bounds, CI e2e/coverage/
   security scanning, migrations tests, docs. (Phase 2)
4. Follow-up blockers: make ratchet decrypt transactional, restore real legacy-AD compatibility,
   add browser auth timeouts, make refresh rotation concurrency-safe, eliminate or explicitly
   accept current dependency advisories, reduce production lint warnings, and run the unproven
   integration/E2E/release-install surfaces. (Phase 3)
