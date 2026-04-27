import { ensureSodium, toBase64Url } from "@seclettr/crypto";

interface DeriveDirectCallFrameKeysParams {
  callId: string;
  localUserId: string;
  localDeviceId: string;
  peerUserId: string;
  peerDeviceId: string;
  // Identity key fallback (v1, no forward secrecy):
  localIdentityPrivateKey: Uint8Array;
  peerIdentityPublicKey: Uint8Array;
  // Ephemeral key pair for per-call forward secrecy (v2).
  // When both are provided, ephemeral DH is used and the private key is
  // zeroed immediately after derivation. Falls back to identity keys if absent.
  localEphemeralPrivateKey?: Uint8Array;
  peerEphemeralPublicKey?: Uint8Array;
}

export interface DirectCallFrameKeyMaterial {
  sendKeyBytes: Uint8Array;
  recvKeyBytes: Uint8Array;
  keyFingerprint: string;
  /** True when per-call forward secrecy was achieved via ephemeral DH. */
  forwardSecure: boolean;
}

const FRAME_KEY_DERIVATION_SCOPE_V1 = "seclettr.direct-call.frame.v1";
// v2 scope is used when ephemeral keys are present, providing domain separation
// from v1 (identity-key) derivations to prevent cross-version key reuse.
const FRAME_KEY_DERIVATION_SCOPE_V2 = "seclettr.direct-call.frame.v2";

function toExactArrayBuffer(data: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return out;
}

function utf8(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", toExactArrayBuffer(data));
  return new Uint8Array(digest);
}

async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  outputLength: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toExactArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toExactArrayBuffer(salt),
      info: toExactArrayBuffer(info),
    },
    key,
    outputLength * 8
  );
  return new Uint8Array(bits);
}

function buildKeyInfo(params: {
  scope: string;
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  recipientDeviceId: string;
}): Uint8Array {
  return utf8([
    params.scope,
    "media-key",
    params.callId,
    `${params.senderUserId}:${params.senderDeviceId}`,
    `${params.recipientUserId}:${params.recipientDeviceId}`,
  ].join(":"));
}

function buildSessionSalt(scope: string, callId: string): Uint8Array {
  return utf8(`${scope}:salt:${callId}`);
}

function toKeyFingerprint(sendKeyBytes: Uint8Array, recvKeyBytes: Uint8Array): string {
  const merged = new Uint8Array(sendKeyBytes.length + recvKeyBytes.length);
  merged.set(sendKeyBytes, 0);
  merged.set(recvKeyBytes, sendKeyBytes.length);
  return toBase64Url(merged);
}

export async function deriveDirectCallFrameKeys(
  params: DeriveDirectCallFrameKeysParams
): Promise<DirectCallFrameKeyMaterial> {
  const sodium = await ensureSodium();

  const forwardSecure =
    params.localEphemeralPrivateKey !== undefined &&
    params.peerEphemeralPublicKey !== undefined;

  const dhPrivKey = forwardSecure
    ? params.localEphemeralPrivateKey!
    : params.localIdentityPrivateKey;
  const dhPubKey = forwardSecure
    ? params.peerEphemeralPublicKey!
    : params.peerIdentityPublicKey;

  const scope = forwardSecure
    ? FRAME_KEY_DERIVATION_SCOPE_V2
    : FRAME_KEY_DERIVATION_SCOPE_V1;

  const sharedSecret = sodium.crypto_scalarmult(dhPrivKey, dhPubKey);

  // Destroy ephemeral private key immediately — this is the forward-secrecy guarantee.
  if (forwardSecure) {
    params.localEphemeralPrivateKey!.fill(0);
  }

  try {
    const sessionSalt = await sha256(buildSessionSalt(scope, params.callId));
    const sendInfo = buildKeyInfo({
      scope,
      callId: params.callId,
      senderUserId: params.localUserId,
      senderDeviceId: params.localDeviceId,
      recipientUserId: params.peerUserId,
      recipientDeviceId: params.peerDeviceId,
    });
    const recvInfo = buildKeyInfo({
      scope,
      callId: params.callId,
      senderUserId: params.peerUserId,
      senderDeviceId: params.peerDeviceId,
      recipientUserId: params.localUserId,
      recipientDeviceId: params.localDeviceId,
    });

    const sendKeyBytes = await hkdfSha256(sharedSecret, sessionSalt, sendInfo, 32);
    const recvKeyBytes = await hkdfSha256(sharedSecret, sessionSalt, recvInfo, 32);
    return {
      sendKeyBytes,
      recvKeyBytes,
      keyFingerprint: toKeyFingerprint(sendKeyBytes, recvKeyBytes),
      forwardSecure,
    };
  } finally {
    sharedSecret.fill(0);
  }
}
