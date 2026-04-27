import {
  ensureSodium,
  fromBase64Url,
  toBase64Url,
} from "@seclettr/crypto";
import type {
  CallMediaEncryptionAnswer,
  CallMediaEncryptionMode,
  CallMediaEncryptionOffer,
  WsClientMessage,
  WsServerMessage,
} from "@seclettr/protocol";

export type CallType = "audio" | "video";
export type DirectCallMediaEncryptionMode = CallMediaEncryptionMode;
export type CallOfferMediaEncryption = CallMediaEncryptionOffer;
export type CallAnswerMediaEncryption = CallMediaEncryptionAnswer;
export type IncomingCallOfferMessage = Extract<WsServerMessage, { type: "call.offer" }> & {
  mediaEncryption?: CallOfferMediaEncryption;
};
export type IncomingCallAnswerMessage = Extract<WsServerMessage, { type: "call.answered" }> & {
  mediaEncryption?: CallAnswerMediaEncryption;
};
export type IncomingCallRenegotiationOfferMessage = Extract<
  WsServerMessage,
  { type: "call.renegotiate.offer" }
>;
export type IncomingCallRenegotiationAnswerMessage = Extract<
  WsServerMessage,
  { type: "call.renegotiate.answer" }
>;

export type CallSignalAuthProof = NonNullable<Extract<WsClientMessage, { type: "call.offer" }>["auth"]>;

export type StoredDeviceCallAuthKeys = {
  dhPrivateKey: string;
  dhPublicKey?: string;
  signingPrivateKey: string;
  signingPublicKey?: string;
  signedPreKeyPriv: string;
  signedPreKeyPub?: string;
  signedPreKeySig?: string;
  signedPreKeyId: number;
};

export type CachedPeerDevicePublicKeys = {
  signingPublicKey: Uint8Array | null;
  identityPublicKey: Uint8Array | null;
};

export type CurrentDeviceCallAuthSigner = {
  userId: string;
  deviceId: string;
  signingPrivateKey: Uint8Array;
  identityKeyPublic: string;
  signingKeyPublic: string;
  signedPreKey: {
    id: number;
    publicKey: string;
    signature: string;
  };
};

export type CallSignalVerificationState = "verified" | "unverified" | "invalid";

export interface CallSignalVerificationResult {
  state: CallSignalVerificationState;
}

const CALL_AUTH_SCOPE = "qm-call-auth-v1";
const CALL_AUTH_MAX_AGE_MS = 5 * 60 * 1000;
const CALL_AUTH_MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

function encodeCallAuthMaterial(payload: Record<string, string | number>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export async function hashSdp(sdp: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sdp));
  return toBase64Url(new Uint8Array(digest));
}

export function buildOfferMaterial(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  callType: CallType;
  signedAt: string;
  sdpHash: string;
  mediaEncryptionPreferredMode?: DirectCallMediaEncryptionMode;
  mediaEncryptionSupportedModesCsv?: string;
  mediaEncryptionEphemeralPublicKey?: string;
}): Uint8Array {
  const payload: Record<string, string | number> = {
    scope: CALL_AUTH_SCOPE,
    kind: "offer",
    callId: input.callId,
    senderUserId: input.senderUserId,
    senderDeviceId: input.senderDeviceId,
    recipientUserId: input.recipientUserId,
    callType: input.callType,
    signedAt: input.signedAt,
    sdpHash: input.sdpHash,
  };
  if (input.mediaEncryptionPreferredMode) {
    payload["mediaEncryptionPreferredMode"] = input.mediaEncryptionPreferredMode;
  }
  if (input.mediaEncryptionSupportedModesCsv) {
    payload["mediaEncryptionSupportedModesCsv"] = input.mediaEncryptionSupportedModesCsv;
  }
  if (input.mediaEncryptionEphemeralPublicKey) {
    payload["mediaEncryptionEphemeralPublicKey"] = input.mediaEncryptionEphemeralPublicKey;
  }
  return encodeCallAuthMaterial(payload);
}

export function buildAnswerMaterial(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  signedAt: string;
  sdpHash: string;
  mediaEncryptionSelectedMode?: DirectCallMediaEncryptionMode;
  mediaEncryptionSupportedModesCsv?: string;
  mediaEncryptionEphemeralPublicKey?: string;
}): Uint8Array {
  const payload: Record<string, string | number> = {
    scope: CALL_AUTH_SCOPE,
    kind: "answer",
    callId: input.callId,
    senderUserId: input.senderUserId,
    senderDeviceId: input.senderDeviceId,
    recipientUserId: input.recipientUserId,
    signedAt: input.signedAt,
    sdpHash: input.sdpHash,
  };
  if (input.mediaEncryptionSelectedMode) {
    payload["mediaEncryptionSelectedMode"] = input.mediaEncryptionSelectedMode;
  }
  if (input.mediaEncryptionSupportedModesCsv) {
    payload["mediaEncryptionSupportedModesCsv"] = input.mediaEncryptionSupportedModesCsv;
  }
  if (input.mediaEncryptionEphemeralPublicKey) {
    payload["mediaEncryptionEphemeralPublicKey"] = input.mediaEncryptionEphemeralPublicKey;
  }
  return encodeCallAuthMaterial(payload);
}

export function buildRenegotiationMaterial(input: {
  kind: "renegotiate-offer" | "renegotiate-answer";
  callId: string;
  revision?: number;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  signedAt: string;
  sdpHash: string;
}): Uint8Array {
  const payload: Record<string, string | number> = {
    scope: CALL_AUTH_SCOPE,
    kind: input.kind,
    callId: input.callId,
    senderUserId: input.senderUserId,
    senderDeviceId: input.senderDeviceId,
    recipientUserId: input.recipientUserId,
    signedAt: input.signedAt,
    sdpHash: input.sdpHash,
  };
  if (typeof input.revision === "number") {
    payload["revision"] = input.revision;
  }
  return encodeCallAuthMaterial(payload);
}

export async function signCallAuthMaterial(
  material: Uint8Array,
  signingPrivateKey: Uint8Array
): Promise<string> {
  const sodium = await ensureSodium();
  return toBase64Url(sodium.crypto_sign_detached(material, signingPrivateKey));
}

async function verifyCallAuthMaterial(
  material: Uint8Array,
  signatureB64: string,
  signingPublicKey: Uint8Array
): Promise<boolean> {
  const sodium = await ensureSodium();
  return sodium.crypto_sign_verify_detached(
    fromBase64Url(signatureB64),
    material,
    signingPublicKey
  );
}

export async function verifyAnyCallAuthMaterial(
  materials: Uint8Array[],
  signatureB64: string,
  signingPublicKey: Uint8Array
): Promise<boolean> {
  for (const material of materials) {
    if (await verifyCallAuthMaterial(material, signatureB64, signingPublicKey)) {
      return true;
    }
  }
  return false;
}

export function isFreshSignedAt(
  signedAt: string,
  nowMs = Date.now()
): boolean {
  const signedAtMs = Date.parse(signedAt);
  if (!Number.isFinite(signedAtMs)) {
    return false;
  }
  if (signedAtMs > nowMs + CALL_AUTH_MAX_FUTURE_SKEW_MS) {
    return false;
  }
  if (nowMs - signedAtMs > CALL_AUTH_MAX_AGE_MS) {
    return false;
  }
  return true;
}
