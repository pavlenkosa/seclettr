import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSodium, toBase64Url } from "@seclettr/crypto";

const callAuthDirectoryMocks = vi.hoisted(() => ({
  getUserDeviceDirectory: vi.fn(),
  getAuthState: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getUserDeviceDirectory: callAuthDirectoryMocks.getUserDeviceDirectory,
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: callAuthDirectoryMocks.getAuthState,
  },
}));

import { clearCallAuthCache, loadPeerIdentityPublicKey } from "@/calls/direct/runtime/crypto/call-auth-store";
import { createOfferCallAuthProof } from "@/calls/direct/runtime/crypto/call-auth-proof";
import { verifyIncomingCallOffer } from "@/calls/direct/runtime/crypto/call-auth-actions";

const OFFER_SDP = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
].join("\r\n");

describe("call-auth device directory integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCallAuthCache();
    callAuthDirectoryMocks.getAuthState.mockReturnValue({
      userId: "33333333-3333-4333-8333-333333333333",
    });
  });

  afterEach(() => {
    clearCallAuthCache();
  });

  it("loads and caches peer identity keys through the typed user-device directory helper", async () => {
    const identityPublicKey = new Uint8Array([1, 2, 3, 4]);
    callAuthDirectoryMocks.getUserDeviceDirectory.mockResolvedValue([
      {
        deviceId: "22222222-2222-4222-8222-222222222222",
        identityKeyPublic: toBase64Url(identityPublicKey),
        signingKeyPublic: "unused-signing-key",
      },
    ]);

    const first = await loadPeerIdentityPublicKey(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    );
    const second = await loadPeerIdentityPublicKey(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    );

    expect(first).toEqual(identityPublicKey);
    expect(second).toEqual(identityPublicKey);
    expect(callAuthDirectoryMocks.getUserDeviceDirectory).toHaveBeenCalledTimes(1);
    expect(callAuthDirectoryMocks.getUserDeviceDirectory).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("treats signed incoming offers as invalid when the authoritative device directory cannot confirm the claimed device key", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const auth = await createOfferCallAuthProof({
      callId: "44444444-4444-4444-8444-444444444444",
      senderUserId: "11111111-1111-4111-8111-111111111111",
      senderDeviceId: "22222222-2222-4222-8222-222222222222",
      recipientUserId: "33333333-3333-4333-8333-333333333333",
      callType: "audio",
      sdp: OFFER_SDP,
      signingPrivateKey: signer.privateKey,
    });
    callAuthDirectoryMocks.getUserDeviceDirectory.mockResolvedValue([]);

    await expect(
      verifyIncomingCallOffer({
        type: "call.offer",
        callId: "44444444-4444-4444-8444-444444444444",
        callerUserId: auth.senderUserId,
        callerDeviceId: auth.senderDeviceId,
        targetUserId: auth.recipientUserId,
        sdp: OFFER_SDP,
        callType: "audio",
        auth,
      })
    ).resolves.toEqual({ state: "invalid" });
  });

  it("keeps signed incoming offers unverified when the device directory lookup itself fails", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const auth = await createOfferCallAuthProof({
      callId: "55555555-5555-4555-8555-555555555555",
      senderUserId: "11111111-1111-4111-8111-111111111111",
      senderDeviceId: "22222222-2222-4222-8222-222222222222",
      recipientUserId: "33333333-3333-4333-8333-333333333333",
      callType: "audio",
      sdp: OFFER_SDP,
      signingPrivateKey: signer.privateKey,
    });
    callAuthDirectoryMocks.getUserDeviceDirectory.mockRejectedValue(
      new Error("directory unavailable")
    );

    await expect(
      verifyIncomingCallOffer({
        type: "call.offer",
        callId: "55555555-5555-4555-8555-555555555555",
        callerUserId: auth.senderUserId,
        callerDeviceId: auth.senderDeviceId,
        targetUserId: auth.recipientUserId,
        sdp: OFFER_SDP,
        callType: "audio",
        auth,
      })
    ).resolves.toEqual({ state: "unverified" });
  });
});
