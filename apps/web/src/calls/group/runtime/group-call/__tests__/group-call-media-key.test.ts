import { beforeAll, describe, expect, it } from "vitest";
import { ensureSodium, generateIdentityBundle, toBase64Url } from "@seclettr/crypto";
import {
  createLocalGroupCallMediaKey,
  decryptGroupCallMediaKeyFromSignal,
  encryptGroupCallMediaKeyForDevice,
  shouldReplaceReceivedGroupCallMediaKey,
  type ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/group-call/media-key";

describe("group-call-media-key", () => {
  beforeAll(async () => {
    await ensureSodium();
  });

  it("round-trips a media key through sealed-box encryption", async () => {
    const sender = await generateIdentityBundle();
    const recipient = await generateIdentityBundle();
    const localKey = createLocalGroupCallMediaKey();
    const callId = crypto.randomUUID();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const targetDeviceId = crypto.randomUUID();
    const encryptedKey = await encryptGroupCallMediaKeyForDevice(
      localKey,
      toBase64Url(recipient.dhKeyPair.publicKey),
      {
        callId,
        senderUserId,
        senderDeviceId,
        targetDeviceId,
      }
    );

    const decrypted = await decryptGroupCallMediaKeyFromSignal(
      {
        type: "group.call.media-key",
        callId,
        senderUserId,
        senderDeviceId,
        targetDeviceId,
        epoch: localKey.epoch,
        keyId: localKey.keyId,
        algorithm: localKey.algorithm,
        encryptedKey,
        sentAt: new Date().toISOString(),
      },
      recipient.dhKeyPair
    );

    expect(Array.from(decrypted.keyBytes)).toEqual(Array.from(localKey.keyBytes));
    expect(decrypted.algorithm).toBe("aes-256-gcm");
    expect(decrypted.epoch).toBe(1);
    expect(sender.dhKeyPair.publicKey).toBeDefined();
  });

  it("keeps legacy raw-32-byte payloads decodable during rollout", async () => {
    const sodium = await ensureSodium();
    const recipient = await generateIdentityBundle();
    const localKey = createLocalGroupCallMediaKey();
    const encryptedKey = toBase64Url(
      sodium.crypto_box_seal(localKey.keyBytes, recipient.dhKeyPair.publicKey)
    );

    const decrypted = await decryptGroupCallMediaKeyFromSignal(
      {
        type: "group.call.media-key",
        callId: crypto.randomUUID(),
        senderUserId: crypto.randomUUID(),
        senderDeviceId: crypto.randomUUID(),
        targetDeviceId: crypto.randomUUID(),
        epoch: localKey.epoch,
        keyId: localKey.keyId,
        algorithm: localKey.algorithm,
        encryptedKey,
        sentAt: new Date().toISOString(),
      },
      recipient.dhKeyPair
    );

    expect(Array.from(decrypted.keyBytes)).toEqual(Array.from(localKey.keyBytes));
  });

  it("rejects outer metadata tampering for versioned payloads", async () => {
    const recipient = await generateIdentityBundle();
    const localKey = createLocalGroupCallMediaKey();
    const callId = crypto.randomUUID();
    const encryptedKey = await encryptGroupCallMediaKeyForDevice(
      localKey,
      toBase64Url(recipient.dhKeyPair.publicKey),
      {
        callId,
        senderUserId: crypto.randomUUID(),
        senderDeviceId: crypto.randomUUID(),
        targetDeviceId: crypto.randomUUID(),
      }
    );

    await expect(
      decryptGroupCallMediaKeyFromSignal(
        {
          type: "group.call.media-key",
          callId: crypto.randomUUID(),
          senderUserId: crypto.randomUUID(),
          senderDeviceId: crypto.randomUUID(),
          targetDeviceId: crypto.randomUUID(),
          epoch: localKey.epoch + 1,
          keyId: localKey.keyId,
          algorithm: localKey.algorithm,
          encryptedKey,
          sentAt: new Date().toISOString(),
        },
        recipient.dhKeyPair
      )
    ).rejects.toThrow(/metadata mismatch/i);
  });

  it("prefers newer epochs and fresher timestamps", () => {
    const current = {
      senderUserId: "user-1",
      senderDeviceId: "device-1",
      targetDeviceId: "device-2",
      epoch: 1,
      keyId: "key-1",
      algorithm: "aes-256-gcm",
      keyBytes: new Uint8Array(32),
      sentAt: "2026-02-28T00:00:00.000Z",
    } satisfies ReceivedGroupCallMediaKey;

    const newerEpoch = {
      ...current,
      epoch: 2,
      keyId: "key-2",
      sentAt: "2026-02-28T00:01:00.000Z",
    } satisfies ReceivedGroupCallMediaKey;

    const sameEpochNewerTime = {
      ...current,
      sentAt: "2026-02-28T00:02:00.000Z",
    } satisfies ReceivedGroupCallMediaKey;

    expect(shouldReplaceReceivedGroupCallMediaKey(current, newerEpoch)).toBe(true);
    expect(shouldReplaceReceivedGroupCallMediaKey(current, sameEpochNewerTime)).toBe(true);
    expect(shouldReplaceReceivedGroupCallMediaKey(newerEpoch, current)).toBe(false);
  });
});
