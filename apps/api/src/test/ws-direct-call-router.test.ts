import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildIcePayload,
  createDirectCallSignalRouter,
  isAllowedDirectCallCalleeSignalSender,
  supportsRenegotiationV1,
} from "../services/ws-direct-call-router.js";
import type {
  CallSession,
  CallSessionStore,
  DirectCallLifecycleManager,
} from "../services/call-routing-state.js";

function createCallSession(overrides?: Partial<CallSession>): CallSession {
  return {
    callerUserId: "caller-user",
    callerDeviceId: "caller-device",
    calleeUserId: "callee-user",
    calleeDeviceId: "callee-device",
    calleeDeviceIds: ["callee-device"],
    ...overrides,
  };
}

function createFastify() {
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  } as never;
}

describe("ws-direct-call-router helpers", () => {
  it("accepts pending invited callee devices before a call is established", () => {
    const session = createCallSession({
      calleeDeviceId: null,
      calleeDeviceIds: ["callee-device", "callee-device-2"],
    });

    expect(
      isAllowedDirectCallCalleeSignalSender(
        "callee-user",
        "callee-device-2",
        session,
        { allowPendingTargets: true }
      )
    ).toBe(true);
    expect(
      isAllowedDirectCallCalleeSignalSender(
        "callee-user",
        "stranger-device",
        session,
        { allowPendingTargets: true }
      )
    ).toBe(false);
  });

  it("requires both sides to advertise renegotiation support", () => {
    expect(
      supportsRenegotiationV1(
        createCallSession({
          callerSupportsRenegotiationV1: true,
          calleeSupportsRenegotiationV1: true,
        })
      )
    ).toBe(true);
    expect(
      supportsRenegotiationV1(
        createCallSession({
          callerSupportsRenegotiationV1: true,
          calleeSupportsRenegotiationV1: false,
        })
      )
    ).toBe(false);
  });

  it("normalizes direct-call ICE payloads for relay", () => {
    expect(
      buildIcePayload({
        type: "call.ice",
        callId: "call-1",
        candidate: { candidate: "candidate:1 1 udp 1 127.0.0.1 9999 typ host" },
      } as never)
    ).toEqual({
      type: "call.ice",
      callId: "call-1",
      candidate: { candidate: "candidate:1 1 udp 1 127.0.0.1 9999 typ host" },
    });
    expect(
      buildIcePayload({
        type: "call.ice.batch",
        callId: "call-1",
        candidates: [{ candidate: "candidate:2 1 udp 1 127.0.0.1 9998 typ host" }],
      } as never)
    ).toEqual({
      type: "call.ice.batch",
      callId: "call-1",
      candidates: [{ candidate: "candidate:2 1 udp 1 127.0.0.1 9998 typ host" }],
    });
  });
});

describe("createDirectCallSignalRouter renegotiation", () => {
  it.each([
    ["call.renegotiate.offer"],
    ["call.renegotiate.answer"],
  ] as const)(
    "rejects unsupported renegotiation %s before auth verification",
    async (messageType) => {
      const setSession = vi.fn();
      const routeToDevice = vi.fn();
      const session = createCallSession({
        callerSupportsRenegotiationV1: true,
        calleeSupportsRenegotiationV1: false,
      });
      const lifecycleManager = {
        loadAuthoritativeSession: vi.fn().mockResolvedValue({
          ok: true,
          session,
        }),
      } as unknown as DirectCallLifecycleManager;
      const callSessionStore = {
        set: setSession,
        get: vi.fn(),
        listByDevice: vi.fn(),
        delete: vi.fn(),
      } as unknown as CallSessionStore;
      const router = createDirectCallSignalRouter({
        callSessionStore,
        directCallLifecycleManager: lifecycleManager,
        hasActiveConnectionForDevice: () => false,
        loadUserDeviceIds: async () => [],
        routeToDevice: async (deviceId, msg) => {
          routeToDevice(deviceId, msg);
        },
        routeToDevices: async () => undefined,
      });

      await router.handleSignal(
        createFastify(),
        { userId: "caller-user", deviceId: "caller-device" },
        {
          type: messageType,
          callId: "call-1",
          revision: 1,
          sdp: "v=0",
        } as never
      );

      expect(routeToDevice).toHaveBeenCalledWith(
        "caller-device",
        expect.objectContaining({
          type: "error",
          code: "CALL_RENEGOTIATION_UNSUPPORTED",
        })
      );
      expect(setSession).not.toHaveBeenCalled();
    }
  );
});

describe("createDirectCallSignalRouter peer relay", () => {
  it("routes caller ICE to the invited callee devices before answer", async () => {
    const routeToDevices = vi.fn();
    const session = createCallSession({
      calleeDeviceId: null,
      calleeDeviceIds: ["callee-device", "callee-device-2"],
    });
    const router = createDirectCallSignalRouter({
      callSessionStore: {
        set: vi.fn(),
        get: vi.fn(),
        listByDevice: vi.fn(),
        delete: vi.fn(),
      } as unknown as CallSessionStore,
      directCallLifecycleManager: {
        loadAuthoritativeSession: vi.fn().mockResolvedValue({
          ok: true,
          session,
        }),
      } as unknown as DirectCallLifecycleManager,
      hasActiveConnectionForDevice: () => false,
      loadUserDeviceIds: async () => [],
      routeToDevice: async () => undefined,
      routeToDevices: async (deviceIds, msg) => {
        routeToDevices(deviceIds, msg);
      },
    });

    await router.handleSignal(
      createFastify(),
      { userId: "caller-user", deviceId: "caller-device" },
      {
        type: "call.ice",
        callId: "call-1",
        candidate: { candidate: "candidate:1" },
      } as never
    );

    expect(routeToDevices).toHaveBeenCalledWith(
      ["callee-device", "callee-device-2"],
      expect.objectContaining({
        type: "call.ice",
        callId: "call-1",
      })
    );
  });

  it("rejects media-state relay from a non-selected callee device", async () => {
    const routeToDevice = vi.fn();
    const router = createDirectCallSignalRouter({
      callSessionStore: {
        set: vi.fn(),
        get: vi.fn(),
        listByDevice: vi.fn(),
        delete: vi.fn(),
      } as unknown as CallSessionStore,
      directCallLifecycleManager: {
        loadAuthoritativeSession: vi.fn().mockResolvedValue({
          ok: true,
          session: createCallSession(),
        }),
      } as unknown as DirectCallLifecycleManager,
      hasActiveConnectionForDevice: () => false,
      loadUserDeviceIds: async () => [],
      routeToDevice: async (deviceId, msg) => {
        routeToDevice(deviceId, msg);
      },
      routeToDevices: async () => undefined,
    });

    await router.handleSignal(
      createFastify(),
      { userId: "callee-user", deviceId: "other-callee-device" },
      {
        type: "call.media_state",
        callId: "call-1",
        source: "camera",
        state: "off",
        seq: 1,
      } as never
    );

    expect(routeToDevice).toHaveBeenCalledWith(
      "other-callee-device",
      expect.objectContaining({
        type: "error",
        code: "CALL_PARTICIPANT_FORBIDDEN",
      })
    );
  });
});

describe("createDirectCallSignalRouter disconnect cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("reconciles stale direct-call runtime state after disconnect grace expires", async () => {
    const cleanupDisconnectedDeviceMock = vi.fn().mockResolvedValue([
      {
        callId: "call-1",
        previousStatus: "ringing",
        nextStatus: "missed",
        actorDeviceId: "callee-device",
      },
    ] as never);

    const lifecycleManager = {
      replayPendingOffers: vi.fn(),
      cleanupDisconnectedDevice: async (params: { deviceId: string }) =>
        cleanupDisconnectedDeviceMock(params),
    } as unknown as DirectCallLifecycleManager;

    const callSessionStore: CallSessionStore = {
      async set() {},
      async get() {
        return null;
      },
      async listByDevice() {
        return ["call-1"];
      },
      async delete() {},
    };

    const router = createDirectCallSignalRouter({
      callSessionStore,
      directCallLifecycleManager: lifecycleManager,
      hasActiveConnectionForDevice: () => false,
      loadUserDeviceIds: async () => [],
      routeToDevice: async () => undefined,
      routeToDevices: async () => undefined,
      disconnectGraceMs: 5_000,
    });

    router.scheduleDisconnectCleanup(
      {
        log: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        },
      } as never,
      {
        userId: "callee-user",
        deviceId: "callee-device",
      }
    );

    await vi.advanceTimersByTimeAsync(5_000);

    expect(cleanupDisconnectedDeviceMock).toHaveBeenCalledWith({
      deviceId: "callee-device",
    });
  });
});
