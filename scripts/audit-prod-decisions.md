# Production audit decisions

Reviewed: 2026-09-26
Regenerate report with: `pnpm audit --prod --json`
Gate: `pnpm audit:prod:gate` (`scripts/audit-prod-gate.mjs`) — fails on any high/critical
production advisory not listed in `ALLOWLISTED_HIGH_OR_CRITICAL_GHSAS`.

Current state after this change: 7 remaining vulnerabilities
(1 high — allowlisted, 5 moderate, 1 low). 5 advisories were fixed by version bumps
in this change.

## Fixed by this change

Dependency bumps: `react-router-dom` 6.30.3 → 6.30.6, `@remix-run/router`
1.23.2 → 1.23.4 (transitive), `protobufjs` 7.6.1 → 7.6.6, `mediasoup`
3.20.0 → 3.20.6.

| GHSA ID | Package | Severity | Was | Now | Decision | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| GHSA-2j2x-hqr9-3h42 | react-router / @remix-run/router | moderate | react-router 6.30.3 / router 1.23.2 | react-router 6.30.6 / router 1.23.4 | FIXED-THIS-CHANGE | Fixed in react-router 6.30.4 / @remix-run/router 1.23.3; bumped to 6.30.6 / 1.23.4 within the 6.x major. |
| GHSA-jjmj-jmhj-qwj2 | react-router-dom | moderate | 6.30.3 | 6.30.6 | FIXED-THIS-CHANGE | Patched in 6.30.6 (advisory affects <= 6.30.5); in-range patch bump of react-router-dom. |
| GHSA-f38q-mgvj-vph7 | protobufjs | moderate | 7.6.1 | 7.6.6 | FIXED-THIS-CHANGE | Fixed in protobufjs 7.6.3+; bumped to 7.6.6 within the ^7 range. |
| GHSA-j3f2-48v5-ccww | protobufjs | moderate | 7.6.1 | 7.6.6 | FIXED-THIS-CHANGE | Fixed in protobufjs 7.6.5+ (affects 7.5.0–7.6.4); bumped to 7.6.6 within the ^7 range. |
| GHSA-p7x2-g5cq-fhmq | mediasoup | moderate | 3.20.0 | 3.20.6 | FIXED-THIS-CHANGE | Fixed in mediasoup 3.20.6 (affects 3.20.0–3.20.5); in-range minor bump in apps/sfu. |

## Accepted with mitigation

| GHSA ID | Package | Severity | Was | Now | Decision | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| GHSA-jx2c-rxcm-jvmq | fastify | high | 4.29.1 | 4.29.1 | ACCEPTED-WITH-MITIGATION | Content-Type control-character bypass of body schema validation. Mitigations: explicit control-char Content-Type rejection guards exist in `apps/api/src/index.ts` and `apps/sfu/src/sfu-server.ts`; request bodies are additionally validated with Zod schemas in route handlers; production is TLS-terminated. Allowlisted in `scripts/audit-prod-gate.mjs`. Revisit: fastify 5 migration. |
| GHSA-wrjc-x8rr-h8h6 | react-router | moderate | 6.30.6 | 6.30.6 | ACCEPTED-WITH-MITIGATION | Patched only in react-router v7 major (>= 7.18.0); no in-range 6.x fix. SPA contains no `dangerouslySetInnerHTML` or `eval` usage in `apps/web/src`; open-redirect exposure is bounded by the app's navigation handling. Revisit: react-router 7 migration. |
| GHSA-337j-9hxr-rhxg | react-router | moderate | 6.30.6 | 6.30.6 | ACCEPTED-WITH-MITIGATION | Same v7-only fix situation as GHSA-wrjc-x8rr-h8h6: patched only in >= 7.18.0. Same mitigations apply (no `dangerouslySetInnerHTML`/`eval`; bounded navigation handling). Revisit: react-router 7 migration. |

## Not fixable in range

| GHSA ID | Package | Severity | Was | Now | Decision | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| GHSA-444r-cwp2-x5xf | fastify | moderate | 4.29.1 | 4.29.1 | NOT-FIXABLE-IN-RANGE | Fixed only in fastify 5.8.3+; 4.x → 5.x is a breaking major migration of routes/plugins. Revisit: fastify 5 migration task. |
| GHSA-w2qp-rph6-63g4 | fastify | moderate | 4.29.1 | 4.29.1 | NOT-FIXABLE-IN-RANGE | Fixed only in fastify 5.12.1+; requires the same 4 → 5 major migration. Revisit: fastify 5 migration task. |
| GHSA-mrq3-vjjr-p77c | fastify | low | 4.29.1 | 4.29.1 | NOT-FIXABLE-IN-RANGE | Fixed only in fastify 5.7.3+; requires the 4 → 5 major migration. Revisit: fastify 5 migration task. |
| GHSA-w5hq-g745-h8pq | uuid | moderate | 8.3.2 / 9.0.1 | 8.3.2 / 9.0.1 | NOT-FIXABLE-IN-RANGE | Fixed in uuid 11.1.1+; installed consumers declare ^8/^9 compatibility and bumping to 11.x is a breaking major upgrade. Revisit: uuid 11 migration. |
