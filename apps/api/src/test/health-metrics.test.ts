import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../index.js";

// Focused unit tests for health/metrics endpoints and the metrics
// authorization + WS subprotocol selection helpers in index.ts.
// The app runs against the same in-memory services used by the unit suite
// (QM_API_TEST_USE_IN_MEMORY_SERVICES=1 from vitest.config.ts), so no
// external Postgres/Redis is required.
const app = await buildApp();

afterAll(async () => {
  await app.close();
});

describe("health endpoints", () => {
  it("reports liveness with the app version", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; version: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBeTruthy();
  });

  it("reports readiness with dependency detail from in-memory services", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      dependencies: { db: boolean; redis: boolean };
    };
    // In-memory services: redis ping answers PONG; pool.query fails without a
    // real DB, so the endpoint must report degraded, not ok.
    expect(body.dependencies.redis).toBe(true);
    expect(body.dependencies.db).toBe(false);
    expect(body.status).toBe("degraded");
  });

  it("exposes the legacy /health alias", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string };
    expect(body.status).toBe("degraded");
  });
});
