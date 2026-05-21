import { afterEach, describe, expect, it, vi } from "vitest";
import type { WsServerMessage } from "@seclettr/protocol";
import { createGroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/media-key/media-key-delivery";

describe("group-call-media-key-delivery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries delivery until ack arrives and then stops", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => ({ status: "sent" as const }));
    const callId = crypto.randomUUID();
    const localDeviceId = crypto.randomUUID();
    const remoteDeviceId = crypto.randomUUID();
    const tracker = createGroupCallMediaKeyDeliveryTracker({
      callId,
      localDeviceId,
      send,
      retryDelaysMs: [100, 200],
    });

    const firstStatus = tracker.share({
      type: "group.call.media-key",
      callId,
      targetDeviceId: remoteDeviceId,
      epoch: 1,
      keyId: "key-1",
      algorithm: "aes-256-gcm",
      encryptedKey: "ciphertext",
    });
    expect(firstStatus).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(2);

    const ackedTarget = tracker.acknowledge({
      type: "group.call.media-key.ack",
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: remoteDeviceId,
      targetDeviceId: localDeviceId,
      epoch: 1,
      keyId: "key-1",
      ackedAt: new Date().toISOString(),
    } satisfies Extract<WsServerMessage, { type: "group.call.media-key.ack" }>);

    expect(ackedTarget).toBe(remoteDeviceId);
    expect(tracker.isDelivered(remoteDeviceId, "key-1")).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("allows re-share after retry budget exhaustion", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => ({ status: "sent" as const }));
    const callId = crypto.randomUUID();
    const localDeviceId = crypto.randomUUID();
    const remoteDeviceId = crypto.randomUUID();
    const tracker = createGroupCallMediaKeyDeliveryTracker({
      callId,
      localDeviceId,
      send,
      retryDelaysMs: [50],
    });

    tracker.share({
      type: "group.call.media-key",
      callId,
      targetDeviceId: remoteDeviceId,
      epoch: 1,
      keyId: "key-2",
      algorithm: "aes-256-gcm",
      encryptedKey: "ciphertext",
    });
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(send).toHaveBeenCalledTimes(2);

    const secondShareStatus = tracker.share({
      type: "group.call.media-key",
      callId,
      targetDeviceId: remoteDeviceId,
      epoch: 1,
      keyId: "key-2",
      algorithm: "aes-256-gcm",
      encryptedKey: "ciphertext",
    });
    expect(secondShareStatus).toBe("sent");
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("emits exhausted callback when retries are fully spent without ack", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => ({ status: "sent" as const }));
    const onDeliveryExhausted = vi.fn();
    const callId = crypto.randomUUID();
    const localDeviceId = crypto.randomUUID();
    const remoteDeviceId = crypto.randomUUID();
    const tracker = createGroupCallMediaKeyDeliveryTracker({
      callId,
      localDeviceId,
      send,
      retryDelaysMs: [10, 20],
      onDeliveryExhausted,
    });

    tracker.share({
      type: "group.call.media-key",
      callId,
      targetDeviceId: remoteDeviceId,
      epoch: 2,
      keyId: "key-4",
      algorithm: "aes-256-gcm",
      encryptedKey: "ciphertext",
    });

    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10);
    expect(send).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(20);
    expect(send).toHaveBeenCalledTimes(3);
    expect(onDeliveryExhausted).toHaveBeenCalledTimes(1);
    expect(onDeliveryExhausted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "group.call.media-key",
        callId,
        targetDeviceId: remoteDeviceId,
        keyId: "key-4",
      })
    );

    // Once exhausted and not acked, the same payload can be shared again.
    const reshared = tracker.share({
      type: "group.call.media-key",
      callId,
      targetDeviceId: remoteDeviceId,
      epoch: 2,
      keyId: "key-4",
      algorithm: "aes-256-gcm",
      encryptedKey: "ciphertext",
    });
    expect(reshared).toBe("sent");
  });

  it("ignores ack for a different local device", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => ({ status: "sent" as const }));
    const callId = crypto.randomUUID();
    const localDeviceId = crypto.randomUUID();
    const remoteDeviceId = crypto.randomUUID();
    const tracker = createGroupCallMediaKeyDeliveryTracker({
      callId,
      localDeviceId,
      send,
      retryDelaysMs: [100],
    });

    tracker.share({
      type: "group.call.media-key",
      callId,
      targetDeviceId: remoteDeviceId,
      epoch: 1,
      keyId: "key-3",
      algorithm: "aes-256-gcm",
      encryptedKey: "ciphertext",
    });

    const ackedTarget = tracker.acknowledge({
      type: "group.call.media-key.ack",
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: remoteDeviceId,
      targetDeviceId: crypto.randomUUID(),
      epoch: 1,
      keyId: "key-3",
      ackedAt: new Date().toISOString(),
    } satisfies Extract<WsServerMessage, { type: "group.call.media-key.ack" }>);

    expect(ackedTarget).toBeNull();
    expect(tracker.isDelivered(remoteDeviceId, "key-3")).toBe(false);
  });
});
