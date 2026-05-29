#!/usr/bin/env node

import { spawnSync } from "node:child_process";

// Explicitly accepted risks with documented rationale.
// Each entry must include: advisory ID, affected package, reason for deferral,
// and a revisit trigger (next major dep upgrade or fixed version).
//
// GHSA-jx2c-rxcm-jvmq — HIGH — fastify <=4.x Content-Type tab character
// allows body-validation bypass (schema check skipped if Content-Type header
// contains a tab). Fixed in fastify >=5.7.2.
// Rationale: upgrade from 4.x to 5.x is a breaking API change requiring
// migration of all routes and plugins. Deferred until fastify 5 migration.
// Mitigations: (1) all request bodies are additionally validated with Zod
// schemas inside route handlers; (2) the API is not exposed without TLS
// in production configs. Revisit: fastify 5.x migration task.
const ALLOWLISTED_HIGH_OR_CRITICAL_GHSAS = new Set([
  "GHSA-jx2c-rxcm-jvmq",
]);

function fail(message, details = "") {
  console.error(`\n[audit:prod:gate] ${message}`);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function parseAuditReport(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Could not parse pnpm audit JSON output");
  }
}

function advisoryIdentity(advisory) {
  return advisory.github_advisory_id ?? String(advisory.id ?? "unknown-advisory");
}

function formatAdvisory(advisory) {
  const identity = advisoryIdentity(advisory);
  const severity = String(advisory.severity ?? "unknown").toLowerCase();
  const moduleName = advisory.module_name ?? "unknown-module";
  const title = advisory.title ?? "Untitled advisory";
  const cves = Array.isArray(advisory.cves) ? advisory.cves.join(", ") : "";
  const cveSuffix = cves ? ` (${cves})` : "";
  return `- ${identity} | ${severity} | ${moduleName}: ${title}${cveSuffix}`;
}

const auditRun = spawnSync("pnpm", ["audit", "--prod", "--json"], {
  encoding: "utf8",
  env: process.env,
});

if (auditRun.error) {
  fail("Failed to execute `pnpm audit --prod --json`.", String(auditRun.error));
}

const report = parseAuditReport(auditRun.stdout ?? "");
if (!report) {
  fail(
    "Received empty audit output.",
    String(auditRun.stderr ?? "").trim()
  );
}

const advisories = Object.values(report.advisories ?? {});
const highOrCritical = advisories.filter((advisory) => {
  const severity = String(advisory.severity ?? "").toLowerCase();
  return severity === "high" || severity === "critical";
});

const disallowed = highOrCritical.filter((advisory) => {
  return !ALLOWLISTED_HIGH_OR_CRITICAL_GHSAS.has(advisoryIdentity(advisory));
});

if (disallowed.length > 0) {
  fail(
    "Found non-allowlisted high/critical production advisories.",
    disallowed.map(formatAdvisory).join("\n")
  );
}

if (highOrCritical.length > 0) {
  console.warn(
    `[audit:prod:gate] High/critical advisories are present but explicitly allowlisted: ${highOrCritical
      .map((advisory) => advisoryIdentity(advisory))
      .join(", ")}`
  );
}

const vulnerabilities = report.metadata?.vulnerabilities;
if (vulnerabilities) {
  console.log(
    `[audit:prod:gate] Vulnerability summary: critical=${vulnerabilities.critical ?? 0}, high=${vulnerabilities.high ?? 0}, moderate=${vulnerabilities.moderate ?? 0}, low=${vulnerabilities.low ?? 0}`
  );
}

console.log("[audit:prod:gate] PASS: no non-allowlisted high/critical production advisories.");
