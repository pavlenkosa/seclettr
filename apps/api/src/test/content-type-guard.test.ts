import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../index.js";

// Regression guard for the mitigation of GHSA-jx2c-rxcm-jvmq (fastify 4.x
// skips body schema validation when Content-Type contains a tab): the
// onRequest hook in index.ts must reject control characters in Content-Type
// before any body parsing happens.
const app = await buildApp();

afterAll(async () => {
  await app.close();
});

describe("content-type control-char guard", () => {
  it("rejects a tab in Content-Type", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "content-type": "application/json\t; charset=utf-8" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid Content-Type header" });
  });

  it("rejects CRLF injection in Content-Type", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "content-type": "application/json\r\nX-Evil: 1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid Content-Type header" });
  });

  it("accepts a plain JSON content type", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});
