import { describe, expect, it, vi } from "vitest";
import {
  handleGroupCallMediaKeySignal,
  handleGroupCallProducerStateSignal,
} from "../services/ws-group-call-signals.js";

function createDeps() {
  return {
    getActiveRoomSession: vi.fn(),
    hasDeviceScopedGroupCallParticipants: vi.fn(),
    hasGroupCallParticipantDevice: vi.fn(),
    hasGroupCallParticipantUser: vi.fn(),
    isAllowedGroupMemberDevice: vi.fn(),
    routeToDevice: vi.fn(),
    publishGroupProducerStateEvent: vi.fn(),
    publishGroupMediaModeEvent: vi.fn(),
    sendWsMessage: vi.fn(),
  };
}

function createSender() {
  return {
    ws: {} as never,
    userId: "user-1",
    deviceId: "device-1",
    sessionId: "session-1",
  };
}

function createFastify() {
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as never;
}

describe("ws-group-call-signals", () => {
  it("rejects media-key delivery to a target device outside device-scoped presence", async () => {
    const deps = createDeps();
    const callId = crypto.randomUUID();
    deps.getActiveRoomSession.mockResolvedValue({
      id: callId,
      group_id: crypto.randomUUID(),
    });
    deps.hasDeviceScopedGroupCallParticipants.mockResolvedValue(true);
    deps.hasGroupCallParticipantDevice.mockImplementation(
      async (_roomId: string, deviceId: string) => deviceId === "device-1"
    );
    deps.isAllowedGroupMemberDevice.mockResolvedValue(true);

    await handleGroupCallMediaKeySignal(
      deps,
      createFastify(),
      createSender(),
      {
        type: "group.call.media-key",
        callId,
        targetDeviceId: "device-2",
        epoch: 1,
        keyId: "key-1",
        algorithm: "aes-256-gcm",
        encryptedKey: "AAAA",
      }
    );

    expect(deps.sendWsMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "error",
        code: "TARGET_DEVICE_NOT_ALLOWED",
      })
    );
    expect(deps.routeToDevice).not.toHaveBeenCalled();
  });

  it("rejects video producer state without explicit source before room processing", async () => {
    const deps = createDeps();

    await handleGroupCallProducerStateSignal(
      deps,
      createFastify(),
      createSender(),
      {
        type: "group.call.producer_state",
        callId: crypto.randomUUID(),
        producerId: "producer-1",
        kind: "video",
        state: "added",
      }
    );

    expect(deps.sendWsMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "error",
        code: "INVALID_PAYLOAD",
      })
    );
    expect(deps.getActiveRoomSession).not.toHaveBeenCalled();
    expect(deps.publishGroupProducerStateEvent).not.toHaveBeenCalled();
  });

  it("rejects audio producer state when a visual source is provided", async () => {
    const deps = createDeps();

    await handleGroupCallProducerStateSignal(
      deps,
      createFastify(),
      createSender(),
      {
        type: "group.call.producer_state",
        callId: crypto.randomUUID(),
        producerId: "producer-1",
        kind: "audio",
        source: "camera",
        state: "added",
      }
    );

    expect(deps.sendWsMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "error",
        code: "INVALID_PAYLOAD",
      })
    );
    expect(deps.getActiveRoomSession).not.toHaveBeenCalled();
    expect(deps.publishGroupProducerStateEvent).not.toHaveBeenCalled();
  });
});
