import { describe, expect, it } from "vitest";
import { terminateDirectCallSession } from "../services/direct-call-routing.js";
import type { CallSession, CallSessionStore } from "../services/call-routing-state.js";

function createInMemoryStore(sessionByCallId: Record<string, CallSession>): CallSessionStore {
  const map = new Map(Object.entries(sessionByCallId));
  return {
    async set(callId, session) {
      map.set(callId, session);
    },
    async get(callId) {
      return map.get(callId) ?? null;
    },
    async listByDevice(deviceId) {
      return [...map.entries()]
        .filter(([, session]) => session.callerDeviceId === deviceId || session.calleeDeviceId === deviceId)
        .map(([callId]) => callId);
    },
    async delete(callId) {
      map.delete(callId);
    },
  };
}

describe("direct call routing termination", () => {
  it("routes caller termination to the established callee device", async () => {
    const store = createInMemoryStore({
      "call-1": {
        callerUserId: "caller-user",
        callerDeviceId: "caller-device",
        calleeUserId: "callee-user",
        calleeDeviceId: "callee-device",
        calleeDeviceIds: ["callee-device"],
      },
    });
    const notifiedDeviceIds: string[] = [];

    const result = await terminateDirectCallSession({
      callId: "call-1",
      actorDeviceId: "caller-device",
      callSessionStore: store,
      loadUserDeviceIds: async () => [],
      routeToDevice: async (deviceId) => {
        notifiedDeviceIds.push(deviceId);
      },
      routeToDevices: async (deviceIds) => {
        notifiedDeviceIds.push(...deviceIds);
      },
    });

    expect(result).toEqual({
      ok: true,
      session: {
        callerUserId: "caller-user",
        callerDeviceId: "caller-device",
        calleeUserId: "callee-user",
        calleeDeviceId: "callee-device",
        calleeDeviceIds: ["callee-device"],
      },
      terminatedByRole: "caller",
      notifiedDeviceIds: ["callee-device"],
    });
    expect(notifiedDeviceIds).toEqual(["callee-device"]);
    await expect(store.get("call-1")).resolves.toBeNull();
  });

  it("routes callee termination back to the caller device", async () => {
    const store = createInMemoryStore({
      "call-1": {
        callerUserId: "caller-user",
        callerDeviceId: "caller-device",
        calleeUserId: "callee-user",
        calleeDeviceId: "callee-device",
        calleeDeviceIds: ["callee-device"],
      },
    });
    const notifiedDeviceIds: string[] = [];

    const result = await terminateDirectCallSession({
      callId: "call-1",
      actorDeviceId: "callee-device",
      callSessionStore: store,
      loadUserDeviceIds: async () => [],
      routeToDevice: async (deviceId) => {
        notifiedDeviceIds.push(deviceId);
      },
      routeToDevices: async (deviceIds) => {
        notifiedDeviceIds.push(...deviceIds);
      },
    });

    expect(result).toEqual({
      ok: true,
      session: {
        callerUserId: "caller-user",
        callerDeviceId: "caller-device",
        calleeUserId: "callee-user",
        calleeDeviceId: "callee-device",
        calleeDeviceIds: ["callee-device"],
      },
      terminatedByRole: "callee",
      notifiedDeviceIds: ["caller-device"],
    });
    expect(notifiedDeviceIds).toEqual(["caller-device"]);
  });

  it("returns forbidden for non-participant device ids", async () => {
    const store = createInMemoryStore({
      "call-1": {
        callerUserId: "caller-user",
        callerDeviceId: "caller-device",
        calleeUserId: "callee-user",
        calleeDeviceId: "callee-device",
        calleeDeviceIds: ["callee-device"],
      },
    });

    const result = await terminateDirectCallSession({
      callId: "call-1",
      actorDeviceId: "stranger-device",
      callSessionStore: store,
      loadUserDeviceIds: async () => [],
      routeToDevice: async () => undefined,
      routeToDevices: async () => undefined,
    });

    expect(result).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("returns not_found for unknown call ids", async () => {
    const store = createInMemoryStore({});

    const result = await terminateDirectCallSession({
      callId: "missing-call",
      actorDeviceId: "caller-device",
      callSessionStore: store,
      loadUserDeviceIds: async () => [],
      routeToDevice: async () => undefined,
      routeToDevices: async () => undefined,
    });

    expect(result).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
