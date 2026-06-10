import { describe, expect, it } from "vitest";
import { createWebSocketRuntime } from "../services/ws-runtime.js";

describe("createWebSocketRuntime", () => {
  it("creates all expected singletons", () => {
    const rt = createWebSocketRuntime();

    expect(rt.connections).toBeDefined();
    expect(rt.callSessionStore).toBeDefined();
    expect(rt.directCallLifecycleManager).toBeDefined();
    expect(rt.directCallSignalRouter).toBeDefined();
    expect(rt.wsRateLimiter).toBeDefined();
    expect(rt.routeToDevice).toBeDefined();
    expect(rt.routeToDevices).toBeDefined();
  });

  it("creates independent instances on each call", () => {
    const rt1 = createWebSocketRuntime();
    const rt2 = createWebSocketRuntime();

    expect(rt1.connections).not.toBe(rt2.connections);
    expect(rt1.wsRateLimiter).not.toBe(rt2.wsRateLimiter);
  });
});
