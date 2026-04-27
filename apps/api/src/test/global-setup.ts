import type { FastifyInstance } from "fastify";
import { assertDatabaseReachable, assertRequiredEnv, loadInfraEnvIfPresent } from "./env.js";

export default async function globalSetup() {
  loadInfraEnvIfPresent();

  if (process.env["API_URL"]) {
    return;
  }

  assertRequiredEnv(["DATABASE_URL", "JWT_SECRET"]);
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for local integration test bootstrap");
  }
  await assertDatabaseReachable(databaseUrl);

  if (!process.env["QM_API_TEST_USE_IN_MEMORY_SERVICES"]) {
    process.env["QM_API_TEST_USE_IN_MEMORY_SERVICES"] = "1";
  }
  if (!process.env["QM_API_TEST_AUTH_RATE_LIMIT_MAX"]) {
    process.env["QM_API_TEST_AUTH_RATE_LIMIT_MAX"] = "500";
  }
  if (!process.env["QM_API_TEST_REFRESH_RATE_LIMIT_MAX"]) {
    process.env["QM_API_TEST_REFRESH_RATE_LIMIT_MAX"] = "500";
  }

  const { buildApp } = await import("../index.js");
  const { pool } = await import("../db/pool.js");
  const { redis } = await import("../services/redis.js");

  const app: FastifyInstance = await buildApp();
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve API test server address");
  }

  process.env["API_URL"] = `http://127.0.0.1:${address.port}`;

  return async () => {
    await app.close();
    await pool.end();
    redis.disconnect();
  };
}
