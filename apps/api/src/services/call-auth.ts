import { createHash } from "node:crypto";
import { ensureSodium, fromBase64Url } from "@seclettr/crypto";
import type { CallMediaEncryptionMode, WsClientMessage } from "@seclettr/protocol";

const CALL_AUTH_SCOPE = "qm-call-auth-v1";
const CALL_AUTH_MAX_AGE_MS = 5 * 60 * 1000;
const CALL_AUTH_MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

type CallType = Extract<WsClientMessage, { type: "call.offer" }>["callType"];
type CallOfferMediaEncryption = NonNullable<
  Extract<WsClientMessage, { type: "call.offer" }>["mediaEncryption"]
>;
type CallAnswerMediaEncryption = NonNullable<
  Extract<WsClientMessage, { type: "call.answer" }>["mediaEncryption"]
>;

export type CallSignalAuthProof = NonNullable<
  Extract<WsClientMessage, { type: "call.offer" }>["auth"]
>;

function encodeCallAuthMaterial(payload: Record<string, string | number>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function hashCallSdp(sdp: string): string {
  return createHash("sha256").update(sdp).digest("base64url");
}

export function buildOfferCallAuthMaterial(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  callType: CallType;
  signedAt: string;
  sdpHash: string;
  mediaEncryptionPreferredMode?: CallMediaEncryptionMode;
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

export function buildAnswerCallAuthMaterial(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  signedAt: string;
  sdpHash: string;
  mediaEncryptionSelectedMode?: CallMediaEncryptionMode;
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

export function buildRenegotiationCallAuthMaterial(input: {
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

export type CallAuthVerificationReason =
  | "missing_auth"
  | "context_mismatch"
  | "invalid_signed_at"
  | "signed_at_in_future"
  | "signed_at_expired"
  | "sdp_hash_mismatch"
  | "missing_signing_public_key"
  | "invalid_signing_public_key"
  | "invalid_signature_encoding"
  | "signature_verification_failed";

export interface CallAuthVerificationResult {
  ok: boolean;
  reason?: CallAuthVerificationReason;
  computedSdpHash?: string;
}

function okResult(extra?: Partial<CallAuthVerificationResult>): CallAuthVerificationResult {
  return { ok: true, ...extra };
}

function failResult(
  reason: CallAuthVerificationReason,
  extra?: Partial<CallAuthVerificationResult>
): CallAuthVerificationResult {
  return { ok: false, reason, ...extra };
}

async function verifyCallAuthMaterial(
  material: Uint8Array,
  signatureB64: string,
  signingPublicKey: Uint8Array
): Promise<CallAuthVerificationReason | null> {
  const sodium = await ensureSodium();
  try {
    const verified = sodium.crypto_sign_verify_detached(
      fromBase64Url(signatureB64),
      material,
      signingPublicKey
    );
    return verified ? null : "signature_verification_failed";
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("signature")) {
      return "invalid_signature_encoding";
    }
    return "signature_verification_failed";
  }
}

function getSignedAtFailureReason(
  signedAt: string,
  nowMs = Date.now()
): CallAuthVerificationReason | null {
  const signedAtMs = Date.parse(signedAt);
  if (!Number.isFinite(signedAtMs)) {
    return "invalid_signed_at";
  }

  if (signedAtMs > nowMs + CALL_AUTH_MAX_FUTURE_SKEW_MS) {
    return "signed_at_in_future";
  }

  if (nowMs - signedAtMs > CALL_AUTH_MAX_AGE_MS) {
    return "signed_at_expired";
  }

  return null;
}

function normalizeSigningPublicKey(signingPublicKey: string | Uint8Array): Uint8Array {
  try {
    return typeof signingPublicKey === "string"
      ? fromBase64Url(signingPublicKey)
      : signingPublicKey;
  } catch {
    throw new Error("invalid_signing_public_key");
  }
}

export function describeCallAuthFailure(reason: CallAuthVerificationReason): string {
  switch (reason) {
    case "missing_auth":
      return "Missing call auth proof";
    case "context_mismatch":
      return "Invalid call auth context";
    case "invalid_signed_at":
      return "Call auth signedAt is invalid";
    case "signed_at_in_future":
      return "Call auth signedAt is too far in the future";
    case "signed_at_expired":
      return "Call auth proof expired";
    case "sdp_hash_mismatch":
      return "Call auth SDP hash mismatch";
    case "missing_signing_public_key":
      return "Device signing public key is missing on the server";
    case "invalid_signing_public_key":
      return "Device signing public key stored on the server is invalid";
    case "invalid_signature_encoding":
      return "Call auth signature is malformed";
    case "signature_verification_failed":
      return "Call auth signature verification failed";
  }
}

export async function verifyServerOfferCallAuthProofDetailed(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  callType: CallType;
  sdp: string;
  auth: CallSignalAuthProof | undefined;
  mediaEncryption?: CallOfferMediaEncryption;
}, signingPublicKey: string | Uint8Array, options?: {
  nowMs?: number;
}): Promise<CallAuthVerificationResult> {
  const auth = input.auth;
  if (!auth) return failResult("missing_auth");
  if (
    auth.senderUserId !== input.senderUserId ||
    auth.senderDeviceId !== input.senderDeviceId ||
    auth.recipientUserId !== input.recipientUserId
  ) {
    return failResult("context_mismatch");
  }
  const signedAtFailure = getSignedAtFailureReason(auth.signedAt, options?.nowMs);
  if (signedAtFailure) return failResult(signedAtFailure);

  const sdpHash = hashCallSdp(input.sdp);
  if (auth.sdpHash !== sdpHash) {
    return failResult("sdp_hash_mismatch", { computedSdpHash: sdpHash });
  }

  let normalizedKey: Uint8Array;
  try {
    normalizedKey = normalizeSigningPublicKey(signingPublicKey);
  } catch {
    return failResult("invalid_signing_public_key", { computedSdpHash: sdpHash });
  }
  const material = buildOfferCallAuthMaterial({
    callId: input.callId,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    callType: input.callType,
    signedAt: auth.signedAt,
    sdpHash,
    ...(input.mediaEncryption
      ? {
          mediaEncryptionPreferredMode: input.mediaEncryption.preferredMode,
          mediaEncryptionSupportedModesCsv: input.mediaEncryption.supportedModes.join(","),
          ...(input.mediaEncryption.ephemeralPublicKey === undefined
            ? {}
            : { mediaEncryptionEphemeralPublicKey: input.mediaEncryption.ephemeralPublicKey }),
        }
      : {}),
  });

  const failure = await verifyCallAuthMaterial(material, auth.signature, normalizedKey);
  return failure ? failResult(failure, { computedSdpHash: sdpHash }) : okResult({ computedSdpHash: sdpHash });
}

export async function verifyServerOfferCallAuthProof(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  callType: CallType;
  sdp: string;
  auth: CallSignalAuthProof | undefined;
  mediaEncryption?: CallOfferMediaEncryption;
}, signingPublicKey: string | Uint8Array, options?: {
  nowMs?: number;
}): Promise<boolean> {
  return (await verifyServerOfferCallAuthProofDetailed(input, signingPublicKey, options)).ok;
}

export async function verifyServerAnswerCallAuthProofDetailed(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  sdp: string;
  auth: CallSignalAuthProof | undefined;
  mediaEncryption?: CallAnswerMediaEncryption;
}, signingPublicKey: string | Uint8Array, options?: {
  nowMs?: number;
}): Promise<CallAuthVerificationResult> {
  const auth = input.auth;
  if (!auth) return failResult("missing_auth");
  if (
    auth.senderUserId !== input.senderUserId ||
    auth.senderDeviceId !== input.senderDeviceId ||
    auth.recipientUserId !== input.recipientUserId
  ) {
    return failResult("context_mismatch");
  }
  const signedAtFailure = getSignedAtFailureReason(auth.signedAt, options?.nowMs);
  if (signedAtFailure) return failResult(signedAtFailure);

  const sdpHash = hashCallSdp(input.sdp);
  if (auth.sdpHash !== sdpHash) {
    return failResult("sdp_hash_mismatch", { computedSdpHash: sdpHash });
  }

  let normalizedKey: Uint8Array;
  try {
    normalizedKey = normalizeSigningPublicKey(signingPublicKey);
  } catch {
    return failResult("invalid_signing_public_key", { computedSdpHash: sdpHash });
  }
  const material = buildAnswerCallAuthMaterial({
    callId: input.callId,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    signedAt: auth.signedAt,
    sdpHash,
    ...(input.mediaEncryption
      ? {
          mediaEncryptionSelectedMode: input.mediaEncryption.selectedMode,
          mediaEncryptionSupportedModesCsv: input.mediaEncryption.supportedModes.join(","),
          ...(input.mediaEncryption.ephemeralPublicKey === undefined
            ? {}
            : { mediaEncryptionEphemeralPublicKey: input.mediaEncryption.ephemeralPublicKey }),
        }
      : {}),
  });

  const failure = await verifyCallAuthMaterial(material, auth.signature, normalizedKey);
  return failure ? failResult(failure, { computedSdpHash: sdpHash }) : okResult({ computedSdpHash: sdpHash });
}

export async function verifyServerAnswerCallAuthProof(input: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  sdp: string;
  auth: CallSignalAuthProof | undefined;
  mediaEncryption?: CallAnswerMediaEncryption;
}, signingPublicKey: string | Uint8Array, options?: {
  nowMs?: number;
}): Promise<boolean> {
  return (await verifyServerAnswerCallAuthProofDetailed(input, signingPublicKey, options)).ok;
}

export async function verifyServerRenegotiationCallAuthProofDetailed(input: {
  kind: "renegotiate-offer" | "renegotiate-answer";
  callId: string;
  revision: number;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  sdp: string;
  auth: CallSignalAuthProof | undefined;
}, signingPublicKey: string | Uint8Array, options?: {
  nowMs?: number;
}): Promise<CallAuthVerificationResult> {
  const auth = input.auth;
  if (!auth) return failResult("missing_auth");
  if (
    auth.senderUserId !== input.senderUserId ||
    auth.senderDeviceId !== input.senderDeviceId ||
    auth.recipientUserId !== input.recipientUserId
  ) {
    return failResult("context_mismatch");
  }
  const signedAtFailure = getSignedAtFailureReason(auth.signedAt, options?.nowMs);
  if (signedAtFailure) return failResult(signedAtFailure);

  const sdpHash = hashCallSdp(input.sdp);
  if (auth.sdpHash !== sdpHash) {
    return failResult("sdp_hash_mismatch", { computedSdpHash: sdpHash });
  }

  let normalizedKey: Uint8Array;
  try {
    normalizedKey = normalizeSigningPublicKey(signingPublicKey);
  } catch {
    return failResult("invalid_signing_public_key", { computedSdpHash: sdpHash });
  }

  const material = buildRenegotiationCallAuthMaterial({
    kind: input.kind,
    callId: input.callId,
    revision: input.revision,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    signedAt: auth.signedAt,
    sdpHash,
  });

  const failure = await verifyCallAuthMaterial(material, auth.signature, normalizedKey);
  return failure ? failResult(failure, { computedSdpHash: sdpHash }) : okResult({ computedSdpHash: sdpHash });
}

export async function verifyServerRenegotiationCallAuthProof(input: {
  kind: "renegotiate-offer" | "renegotiate-answer";
  callId: string;
  revision: number;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  sdp: string;
  auth: CallSignalAuthProof | undefined;
}, signingPublicKey: string | Uint8Array, options?: {
  nowMs?: number;
}): Promise<boolean> {
  return (await verifyServerRenegotiationCallAuthProofDetailed(input, signingPublicKey, options)).ok;
}
