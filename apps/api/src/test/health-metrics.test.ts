import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, resolveHealthStatus } from "../index.js";
import { cacheDepHealth } from "../services/observability.js";

// Focused unit tests for health/metrics endpoints and the metrics
// authorization + WS subprotocol selection helpers in index.ts.
// The app runs against the same in-memory services used by the unit suite
// (QM_API_TEST_USE_IN_MEMORY_SERVICES=1 from vitest.config.ts), so no
// external Postgres/Redis is required. Readiness assertions are structural:
// they check the /health contract (status === resolveHealthStatus(db, redis))
// instead of hardcoding ok/degraded, so they hold whether or not a real DB
// is available (dev CI provides a Postgres service container).
const app = await buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  // Fresh dependency-health cache per test so /metrics renders what the test
  // seeds rather than state leaked from another test or a real probe.
  cacheDepHealth(true, true);
});

describe("resolveHealthStatus", () => {
  it("maps both dependencies healthy to ok", () => {
    expect(resolveHealthStatus(true, true)).toBe("ok");
  });

  it("maps any unhealthy dependency to degraded", () => {
    expect(resolveHealthStatus(false, true)).toBe("degraded");
    expect(resolveHealthStatus(true, false)).toBe("degraded");
    expect(resolveHealthStatus(false, false)).toBe("degraded");
  });
});

describe("health endpoints", () => {
  it("reports liveness with the app version", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; version: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBeTruthy();
  });

  it("reports readiness status consistent with the dependency probes", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      version: string;
      dependencies: { db: boolean; redis: boolean };
    };
    expect(body.version).toBeTruthy();
    // Structural contract: both dependency booleans are present and the
    // status is exactly the mapping of those probes.
    expect(typeof body.dependencies.db).toBe("boolean");
    expect(typeof body.dependencies.redis).toBe("boolean");
    expect(body.status).toBe(
      resolveHealthStatus(body.dependencies.db, body.dependencies.redis)
    );
  });

  it("exposes the legacy /health alias with the same structural contract", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; version: string };
    expect(body.version).toBeTruthy();
    // The alias serves the same readiness payload shape (without the
    // dependencies detail block), so assert it against the readiness status.
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    const readyBody = ready.json() as { status: string };
    expect(body.status).toBe(readyBody.status);
    expect(["ok", "degraded"]).toContain(body.status);
  });
});

describe("/metrics", () => {
  it("renders cached dependency health as Prometheus gauges", async () => {
    cacheDepHealth(false, true);
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    const body = res.body;
    expect(body).toContain('seclettr_api_health{dependency="db"} 0');
    expect(body).toContain('seclettr_api_health{dependency="redis"} 1');
  });

  it("exposes the HTTP request counter metric", async () => {
    await app.inject({ method: "GET", url: "/health/live" });
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("seclettr_http_requests_total");
  });
});