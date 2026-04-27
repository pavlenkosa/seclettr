import { describe, expect, it } from "vitest";
import { ensureSodium } from "@seclettr/crypto";
import { deriveDirectCallFrameKeys } from "@/calls/direct/runtime/crypto/direct-call-frame-crypto";

describe("direct-call-frame-crypto", () => {
  it("derives matching directional keys for both call participants", async () => {
    const sodium = await ensureSodium();
    const aliceIdentity = sodium.crypto_box_keypair();
    const bobIdentity = sodium.crypto_box_keypair();
    const callId = crypto.randomUUID();

    const aliceKeys = await deriveDirectCallFrameKeys({
      callId,
      localUserId: "alice-user",
      localDeviceId: "alice-device",
      localIdentityPrivateKey: aliceIdentity.privateKey,
      peerUserId: "bob-user",
      peerDeviceId: "bob-device",
      peerIdentityPublicKey: bobIdentity.publicKey,
    });

    const bobKeys = await deriveDirectCallFrameKeys({
      callId,
      localUserId: "bob-user",
      localDeviceId: "bob-device",
      localIdentityPrivateKey: bobIdentity.privateKey,
      peerUserId: "alice-user",
      peerDeviceId: "alice-device",
      peerIdentityPublicKey: aliceIdentity.publicKey,
    });

    expect(Array.from(aliceKeys.sendKeyBytes)).toEqual(Array.from(bobKeys.recvKeyBytes));
    expect(Array.from(aliceKeys.recvKeyBytes)).toEqual(Array.from(bobKeys.sendKeyBytes));
  });

  it("uses unique key material per call id", async () => {
    const sodium = await ensureSodium();
    const localIdentity = sodium.crypto_box_keypair();
    const peerIdentity = sodium.crypto_box_keypair();

    const first = await deriveDirectCallFrameKeys({
      callId: crypto.randomUUID(),
      localUserId: "alice-user",
      localDeviceId: "alice-device",
      localIdentityPrivateKey: localIdentity.privateKey,
      peerUserId: "bob-user",
      peerDeviceId: "bob-device",
      peerIdentityPublicKey: peerIdentity.publicKey,
    });

    const second = await deriveDirectCallFrameKeys({
      callId: crypto.randomUUID(),
      localUserId: "alice-user",
      localDeviceId: "alice-device",
      localIdentityPrivateKey: localIdentity.privateKey,
      peerUserId: "bob-user",
      peerDeviceId: "bob-device",
      peerIdentityPublicKey: peerIdentity.publicKey,
    });

    expect(Array.from(first.sendKeyBytes)).not.toEqual(Array.from(second.sendKeyBytes));
    expect(Array.from(first.recvKeyBytes)).not.toEqual(Array.from(second.recvKeyBytes));
  });
});
