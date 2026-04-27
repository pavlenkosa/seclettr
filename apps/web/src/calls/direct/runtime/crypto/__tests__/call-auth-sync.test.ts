import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSodium, toBase64Url } from "@seclettr/crypto";

const callAuthSyncMocks = vi.hoisted(() => ({
  apiSyncCurrentDeviceCryptoMaterial: vi.fn(),
  loadDecrypted: vi.fn(),
  getAuthState: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    syncCurrentDeviceCryptoMaterial:
      callAuthSyncMocks.apiSyncCurrentDeviceCryptoMaterial,
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: callAuthSyncMocks.getAuthState,
  },
}));

vi.mock("@seclettr/crypto", async () => {
  const actual = await vi.importActual<typeof import("@seclettr/crypto")>(
    "@seclettr/crypto"
  );
  return {
    ...actual,
    loadDecrypted: callAuthSyncMocks.loadDecrypted,
  };
});

import { clearCallAuthCache } from "@/calls/direct/runtime/crypto/call-auth-store";
import { createSignedCallOfferAuth } from "@/calls/direct/runtime/crypto/call-auth-actions";

describe("call-auth current device crypto material sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCallAuthCache();
    callAuthSyncMocks.getAuthState.mockReturnValue({
      storageKey: {} as CryptoKey,
      userId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
    });
  });

  afterEach(() => {
    clearCallAuthCache();
  });

  it("syncs the current-device public crypto bundle before signing an offer", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const identityKeyPair = sodium.crypto_box_keypair();
    const signedPreKeyPair = sodium.crypto_box_keypair();
    const signedPreKeySignature = toBase64Url(
      sodium.crypto_sign_detached(signedPreKeyPair.publicKey, signer.privateKey)
    );
    callAuthSyncMocks.loadDecrypted.mockResolvedValue({
      dhPrivateKey: toBase64Url(identityKeyPair.privateKey),
      dhPublicKey: toBase64Url(identityKeyPair.publicKey),
      signingPrivateKey: toBase64Url(signer.privateKey),
      signingPublicKey: toBase64Url(signer.publicKey),
      signedPreKeyPriv: toBase64Url(signedPreKeyPair.privateKey),
      signedPreKeyPub: toBase64Url(signedPreKeyPair.publicKey),
      signedPreKeySig: signedPreKeySignature,
      signedPreKeyId: 73,
    });
    callAuthSyncMocks.apiSyncCurrentDeviceCryptoMaterial.mockResolvedValue(
      undefined
    );

    const auth = await createSignedCallOfferAuth({
      callId: "33333333-3333-4333-8333-333333333333",
      recipientUserId: "44444444-4444-4444-8444-444444444444",
      callType: "video",
      sdp: "v=0\r\ns=-\r\n",
    });

    expect(auth).not.toBeNull();
    expect(
      callAuthSyncMocks.apiSyncCurrentDeviceCryptoMaterial
    ).toHaveBeenCalledWith({
      identityKeyPublic: toBase64Url(identityKeyPair.publicKey),
      signingKeyPublic: toBase64Url(signer.publicKey),
      signedPreKey: {
        id: 73,
        publicKey: toBase64Url(signedPreKeyPair.publicKey),
        signature: signedPreKeySignature,
      },
    });
  });

  it("reuses the successful sync result instead of resyncing on every offer", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const identityKeyPair = sodium.crypto_box_keypair();
    const signedPreKeyPair = sodium.crypto_box_keypair();
    const signedPreKeySignature = toBase64Url(
      sodium.crypto_sign_detached(signedPreKeyPair.publicKey, signer.privateKey)
    );
    callAuthSyncMocks.loadDecrypted.mockResolvedValue({
      dhPrivateKey: toBase64Url(identityKeyPair.privateKey),
      dhPublicKey: toBase64Url(identityKeyPair.publicKey),
      signingPrivateKey: toBase64Url(signer.privateKey),
      signingPublicKey: toBase64Url(signer.publicKey),
      signedPreKeyPriv: toBase64Url(signedPreKeyPair.privateKey),
      signedPreKeyPub: toBase64Url(signedPreKeyPair.publicKey),
      signedPreKeySig: signedPreKeySignature,
      signedPreKeyId: 81,
    });
    callAuthSyncMocks.apiSyncCurrentDeviceCryptoMaterial.mockResolvedValue(
      undefined
    );

    await createSignedCallOfferAuth({
      callId: "55555555-5555-4555-8555-555555555555",
      recipientUserId: "66666666-6666-4666-8666-666666666666",
      callType: "audio",
      sdp: "v=0\r\ns=-\r\n",
    });
    await createSignedCallOfferAuth({
      callId: "77777777-7777-4777-8777-777777777777",
      recipientUserId: "88888888-8888-4888-8888-888888888888",
      callType: "audio",
      sdp: "v=0\r\ns=-\r\n",
    });

    expect(callAuthSyncMocks.apiSyncCurrentDeviceCryptoMaterial).toHaveBeenCalledTimes(1);
  });

  it("fails closed when syncing the current-device public crypto bundle fails", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const identityKeyPair = sodium.crypto_box_keypair();
    const signedPreKeyPair = sodium.crypto_box_keypair();
    callAuthSyncMocks.loadDecrypted.mockResolvedValue({
      dhPrivateKey: toBase64Url(identityKeyPair.privateKey),
      dhPublicKey: toBase64Url(identityKeyPair.publicKey),
      signingPrivateKey: toBase64Url(signer.privateKey),
      signingPublicKey: toBase64Url(signer.publicKey),
      signedPreKeyPriv: toBase64Url(signedPreKeyPair.privateKey),
      signedPreKeyPub: toBase64Url(signedPreKeyPair.publicKey),
      signedPreKeyId: 91,
    });
    callAuthSyncMocks.apiSyncCurrentDeviceCryptoMaterial.mockRejectedValue(
      new Error("repair failed")
    );

    const auth = await createSignedCallOfferAuth({
      callId: "99999999-9999-4999-8999-999999999999",
      recipientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      callType: "video",
      sdp: "v=0\r\ns=-\r\n",
    });

    expect(auth).toBeNull();
  });
});
