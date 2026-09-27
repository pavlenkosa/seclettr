import { afterEach, describe, expect, it } from "vitest";
import { createSfuServer, type SfuServerConfig } from "../src/sfu-server.js";

// Regression guard for the mitigation of GHSA-jx2c-rxcm-jvmq (fastify 4.x
// skips body schema validation when Content-Type contains a tab): the
// onRequest hook in sfu-server.ts must reject control characters in
// Content-Type before any body parsing happens.
const baseConfig: SfuServerConfig = {
  port: 0,
  trustProxy: "loopback",
  announcedIp: "127.0.0.1",
  jwtSecret: "test-sfu-jwt-secret-0123456789abcd",
  rateLimitWindowMs: 10_000,
  rateLimitMaxRequests: 120,
  peerTtlMs: 120_000,
  emptyRoomTtlMs: 30_000,
  cleanupIntervalMs: 30_000,
  topology: "single-node",
  corsOrigin: "http://localhost:5173",
};

const openServers: Array<{ fastify: { close(): Promise<void> } }> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((s) => s.fastify.close()));
});

async function buildServer(): Promise<Awaited<ReturnType<typeof createSfuServer>>> {
  const server = await createSfuServer({
    config: baseConfig,
    workerPool: {} as never,
    rooms: new Map(),
    roomAccess: {
      ensureRoomAccess: async () => true,
    },
  });
  openServers.push(server);
  return server;
}

describe("content-type control-char guard", () => {
  it("rejects a tab in Content-Type", async () => {
    const server = await buildServer();
    const res = await server.fastify.inject({
      method: "GET",
      url: "/health/live",
      headers: { "content-type": "application/json\t; charset=utf-8" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid Content-Type header" });
  });

  it("rejects CRLF injection in Content-Type", async () => {
    const server = await buildServer();
    const res = await server.fastify.inject({
      method: "GET",
      url: "/health/live",
      headers: { "content-type": "application/json\r\nX-Evil: 1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid Content-Type header" });
  });

  it("accepts a plain JSON content type", async () => {
    const server = await buildServer();
    const res = await server.fastify.inject({
      method: "GET",
      url: "/health/live",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});
