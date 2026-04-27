import type {
  CallSignalAuthProof,
  CallType,
  DirectCallMediaEncryptionMode,
  IncomingCallAnswerMessage,
  IncomingCallOfferMessage,
  IncomingCallRenegotiationAnswerMessage,
  IncomingCallRenegotiationOfferMessage,
} from "./call-auth-material";
import {
  buildAnswerMaterial,
  buildOfferMaterial,
  buildRenegotiationMaterial,
  hashSdp,
  isFreshSignedAt,
  signCallAuthMaterial,
  verifyAnyCallAuthMaterial,
} from "./call-auth-material";

export async function createOfferCallAuthProof(params: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  callType: CallType;
  sdp: string;
  signingPrivateKey: Uint8Array;
  mediaEncryption?: {
    preferredMode: DirectCallMediaEncryptionMode;
    supportedModes: readonly DirectCallMediaEncryptionMode[];
    ephemeralPublicKey?: string;
  };
}): Promise<CallSignalAuthProof> {
  const signedAt = new Date().toISOString();
  const sdpHash = await hashSdp(params.sdp);
  const signature = await signCallAuthMaterial(
    buildOfferMaterial({
      callId: params.callId,
      senderUserId: params.senderUserId,
      senderDeviceId: params.senderDeviceId,
      recipientUserId: params.recipientUserId,
      callType: params.callType,
      signedAt,
      sdpHash,
      mediaEncryptionPreferredMode: params.mediaEncryption?.preferredMode,
      mediaEncryptionSupportedModesCsv: params.mediaEncryption?.supportedModes.join(","),
      mediaEncryptionEphemeralPublicKey: params.mediaEncryption?.ephemeralPublicKey,
    }),
    params.signingPrivateKey
  );

  return {
    version: 1,
    senderUserId: params.senderUserId,
    senderDeviceId: params.senderDeviceId,
    recipientUserId: params.recipientUserId,
    signedAt,
    sdpHash,
    signature,
  };
}

export async function createAnswerCallAuthProof(params: {
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  sdp: string;
  signingPrivateKey: Uint8Array;
  mediaEncryption?: {
    selectedMode: DirectCallMediaEncryptionMode;
    supportedModes: readonly DirectCallMediaEncryptionMode[];
    ephemeralPublicKey?: string;
  };
}): Promise<CallSignalAuthProof> {
  const signedAt = new Date().toISOString();
  const sdpHash = await hashSdp(params.sdp);
  const signature = await signCallAuthMaterial(
    buildAnswerMaterial({
      callId: params.callId,
      senderUserId: params.senderUserId,
      senderDeviceId: params.senderDeviceId,
      recipientUserId: params.recipientUserId,
      signedAt,
      sdpHash,
      mediaEncryptionSelectedMode: params.mediaEncryption?.selectedMode,
      mediaEncryptionSupportedModesCsv: params.mediaEncryption?.supportedModes.join(","),
      mediaEncryptionEphemeralPublicKey: params.mediaEncryption?.ephemeralPublicKey,
    }),
    params.signingPrivateKey
  );

  return {
    version: 1,
    senderUserId: params.senderUserId,
    senderDeviceId: params.senderDeviceId,
    recipientUserId: params.recipientUserId,
    signedAt,
    sdpHash,
    signature,
  };
}

export async function verifyOfferCallAuthProof(
  message: IncomingCallOfferMessage,
  signingPublicKey: Uint8Array,
  options?: { nowMs?: number }
): Promise<boolean> {
  const auth = message.auth;
  if (!auth || !message.callerDeviceId || !message.targetUserId) {
    return false;
  }
  if (
    auth.senderUserId !== message.callerUserId ||
    auth.senderDeviceId !== message.callerDeviceId ||
    auth.recipientUserId !== message.targetUserId
  ) {
    return false;
  }
  if (!isFreshSignedAt(auth.signedAt, options?.nowMs)) {
    return false;
  }

  const sdpHash = await hashSdp(message.sdp);
  if (auth.sdpHash !== sdpHash) {
    return false;
  }

  const legacyMaterial = buildOfferMaterial({
    callId: message.callId,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    callType: message.callType,
    signedAt: auth.signedAt,
    sdpHash,
  });
  const mediaMaterial = buildOfferMaterial({
    callId: message.callId,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    callType: message.callType,
    signedAt: auth.signedAt,
    sdpHash,
    mediaEncryptionPreferredMode: message.mediaEncryption?.preferredMode,
    mediaEncryptionSupportedModesCsv: message.mediaEncryption?.supportedModes.join(","),
    mediaEncryptionEphemeralPublicKey: message.mediaEncryption?.ephemeralPublicKey,
  });

  return verifyAnyCallAuthMaterial(
    [mediaMaterial, legacyMaterial],
    auth.signature,
    signingPublicKey
  );
}

export async function verifyAnswerCallAuthProof(
  message: IncomingCallAnswerMessage,
  signingPublicKey: Uint8Array,
  options?: { nowMs?: number }
): Promise<boolean> {
  const auth = message.auth;
  if (!auth || !message.answererUserId || !message.answererDeviceId || !message.targetUserId) {
    return false;
  }
  if (
    auth.senderUserId !== message.answererUserId ||
    auth.senderDeviceId !== message.answererDeviceId ||
    auth.recipientUserId !== message.targetUserId
  ) {
    return false;
  }
  if (!isFreshSignedAt(auth.signedAt, options?.nowMs)) {
    return false;
  }

  const sdpHash = await hashSdp(message.sdp);
  if (auth.sdpHash !== sdpHash) {
    return false;
  }

  const legacyMaterial = buildAnswerMaterial({
    callId: message.callId,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    signedAt: auth.signedAt,
    sdpHash,
  });
  const mediaMaterial = buildAnswerMaterial({
    callId: message.callId,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    signedAt: auth.signedAt,
    sdpHash,
    mediaEncryptionSelectedMode: message.mediaEncryption?.selectedMode,
    mediaEncryptionSupportedModesCsv: message.mediaEncryption?.supportedModes.join(","),
    mediaEncryptionEphemeralPublicKey: message.mediaEncryption?.ephemeralPublicKey,
  });

  return verifyAnyCallAuthMaterial(
    [mediaMaterial, legacyMaterial],
    auth.signature,
    signingPublicKey
  );
}

export async function createRenegotiationCallAuthProof(params: {
  kind: "renegotiate-offer" | "renegotiate-answer";
  callId: string;
  revision: number;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  sdp: string;
  signingPrivateKey: Uint8Array;
}): Promise<CallSignalAuthProof> {
  const signedAt = new Date().toISOString();
  const sdpHash = await hashSdp(params.sdp);
  const signature = await signCallAuthMaterial(
    buildRenegotiationMaterial({
      kind: params.kind,
      callId: params.callId,
      revision: params.revision,
      senderUserId: params.senderUserId,
      senderDeviceId: params.senderDeviceId,
      recipientUserId: params.recipientUserId,
      signedAt,
      sdpHash,
    }),
    params.signingPrivateKey
  );

  return {
    version: 1,
    senderUserId: params.senderUserId,
    senderDeviceId: params.senderDeviceId,
    recipientUserId: params.recipientUserId,
    signedAt,
    sdpHash,
    signature,
  };
}

export async function verifyRenegotiationCallAuthProof(
  message: IncomingCallRenegotiationOfferMessage | IncomingCallRenegotiationAnswerMessage,
  expectedRecipientUserId: string,
  kind: "renegotiate-offer" | "renegotiate-answer",
  signingPublicKey: Uint8Array,
  options?: { nowMs?: number }
): Promise<boolean> {
  const auth = message.auth;
  if (!auth) {
    return false;
  }
  if (
    auth.senderUserId !== message.senderUserId ||
    auth.senderDeviceId !== message.senderDeviceId ||
    auth.recipientUserId !== expectedRecipientUserId
  ) {
    return false;
  }
  if (!isFreshSignedAt(auth.signedAt, options?.nowMs)) {
    return false;
  }

  const sdpHash = await hashSdp(message.sdp);
  if (auth.sdpHash !== sdpHash) {
    return false;
  }

  const revisionMaterial = buildRenegotiationMaterial({
    kind,
    callId: message.callId,
    revision: message.revision,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    signedAt: auth.signedAt,
    sdpHash,
  });
  const legacyMaterial = buildRenegotiationMaterial({
    kind,
    callId: message.callId,
    senderUserId: auth.senderUserId,
    senderDeviceId: auth.senderDeviceId,
    recipientUserId: auth.recipientUserId,
    signedAt: auth.signedAt,
    sdpHash,
  });

  return verifyAnyCallAuthMaterial(
    [revisionMaterial, legacyMaterial],
    auth.signature,
    signingPublicKey
  );
}
