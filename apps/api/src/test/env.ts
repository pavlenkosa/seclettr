import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const INFRA_ENV_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../infra"
);

const INFRA_ENV_CANDIDATES = [
  resolve(INFRA_ENV_DIR, ".env.dev"),
  resolve(INFRA_ENV_DIR, ".env.sandbox"),
  resolve(INFRA_ENV_DIR, ".env"),
];

function assignEnvIfAbsent(key: string, value: string | undefined): void {
  if (!key || !value || process.env[key]) return;
  process.env[key] = value;
}

function readEnvFile(envPath: string): void {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replaceAll(/^["']|["']$/g, "");
    assignEnvIfAbsent(key, value);
  }
}

function resolveInfraPort(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return fallback;
}

function populateDerivedInfraEnv(): void {
  const postgresPassword = process.env["POSTGRES_PASSWORD"];
  const redisPassword = process.env["REDIS_PASSWORD"];
  const postgresPort = resolveInfraPort(["DEV_POSTGRES_PORT", "POSTGRES_HOST_PORT"], "5432");
  const redisPort = resolveInfraPort(["DEV_REDIS_PORT", "REDIS_HOST_PORT"], "6379");
  const minioApiPort = resolveInfraPort(["DEV_MINIO_API_PORT", "MINIO_API_HOST_PORT"], "9000");

  assignEnvIfAbsent(
    "DATABASE_URL",
    postgresPassword
      ? `postgresql://seclettr:${postgresPassword}@127.0.0.1:${postgresPort}/seclettr`
      : undefined
  );
  assignEnvIfAbsent(
    "REDIS_URL",
    redisPassword
      ? `redis://:${redisPassword}@127.0.0.1:${redisPort}`
      : undefined
  );
  assignEnvIfAbsent("S3_ENDPOINT", `http://127.0.0.1:${minioApiPort}`);
}

export function loadInfraEnvIfPresent(): void {
  for (const envPath of INFRA_ENV_CANDIDATES) {
    if (!existsSync(envPath)) continue;
    readEnvFile(envPath);
    break;
  }
  populateDerivedInfraEnv();
}

export function assertRequiredEnv(requiredKeys: string[]): void {
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Integration tests require env vars: ${missing.join(", ")}.\n` +
      `Provide them directly or via infra/.env.dev, infra/.env.sandbox, or infra/.env before running tests.`
    );
  }
}

export async function assertDatabaseReachable(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 3_000,
  });

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    const details = (() => {
      if (error instanceof AggregateError && error.errors.length > 0) {
        return error.errors
          .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
          .join("; ");
      }
      const aggregateErrors = (error as { aggregateErrors?: unknown[] } | null)?.aggregateErrors;
      if (Array.isArray(aggregateErrors) && aggregateErrors.length > 0) {
        return aggregateErrors
          .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
          .join("; ");
      }
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return String(error);
    })();
    throw new Error(
      `Integration tests require a reachable Postgres instance.\n` +
      `DATABASE_URL: ${databaseUrl}\n` +
      `Connectivity check failed: ${details}`
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}
