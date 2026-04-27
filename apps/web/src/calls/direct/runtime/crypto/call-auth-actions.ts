import type {
  CallSignalAuthProof,
  CallSignalVerificationResult,
  CallType,
  DirectCallMediaEncryptionMode,
  IncomingCallAnswerMessage,
  IncomingCallOfferMessage,
  IncomingCallRenegotiationAnswerMessage,
  IncomingCallRenegotiationOfferMessage,
} from "./call-auth-material";
import {
  createAnswerCallAuthProof,
  createOfferCallAuthProof,
  createRenegotiationCallAuthProof,
  verifyAnswerCallAuthProof,
  verifyOfferCallAuthProof,
  verifyRenegotiationCallAuthProof,
} from "./call-auth-proof";
import {
  loadAuthStoreState,
  loadCurrentCallAuthSigner,
  loadPeerSigningPublicKey,
} from "./call-auth-store";

// ─── Signing ─────────────────────────────────────────────────────────────────

export async function createSignedCallOfferAuth(params: {
  callId: string;
  recipientUserId: string;
  callType: CallType;
  sdp: string;
  mediaEncryption?: {
    preferredMode: DirectCallMediaEncryptionMode;
    supportedModes: readonly DirectCallMediaEncryptionMode[];
    ephemeralPublicKey?: string;
  };
}): Promise<CallSignalAuthProof | null> {
  const signer = await loadCurrentCallAuthSigner();
  if (!signer) {
    return null;
  }
  return createOfferCallAuthProof({
    callId: params.callId,
    senderUserId: signer.userId,
    senderDeviceId: signer.deviceId,
    recipientUserId: params.recipientUserId,
    callType: params.callType,
    sdp: params.sdp,
    mediaEncryption: params.mediaEncryption,
    signingPrivateKey: signer.signingPrivateKey,
  });
}

export async function createSignedCallAnswerAuth(params: {
  callId: string;
  recipientUserId: string;
  sdp: string;
  mediaEncryption?: {
    selectedMode: DirectCallMediaEncryptionMode;
    supportedModes: readonly DirectCallMediaEncryptionMode[];
    ephemeralPublicKey?: string;
  };
}): Promise<CallSignalAuthProof | null> {
  const signer = await loadCurrentCallAuthSigner();
  if (!signer) {
    return null;
  }
  return createAnswerCallAuthProof({
    callId: params.callId,
    senderUserId: signer.userId,
    senderDeviceId: signer.deviceId,
    recipientUserId: params.recipientUserId,
    sdp: params.sdp,
    mediaEncryption: params.mediaEncryption,
    signingPrivateKey: signer.signingPrivateKey,
  });
}

async function createSignedCallRenegotiationAuth(params: {
  kind: "renegotiate-offer" | "renegotiate-answer";
  callId: string;
  revision: number;
  recipientUserId: string;
  sdp: string;
}): Promise<CallSignalAuthProof | null> {
  const signer = await loadCurrentCallAuthSigner();
  if (!signer) {
    return null;
  }
  return createRenegotiationCallAuthProof({
    kind: params.kind,
    callId: params.callId,
    revision: params.revision,
    senderUserId: signer.userId,
    senderDeviceId: signer.deviceId,
    recipientUserId: params.recipientUserId,
    sdp: params.sdp,
    signingPrivateKey: signer.signingPrivateKey,
  });
}

export async function createSignedCallRenegotiationOfferAuth(params: {
  callId: string;
  revision: number;
  recipientUserId: string;
  sdp: string;
}): Promise<CallSignalAuthProof | null> {
  return createSignedCallRenegotiationAuth({
    kind: "renegotiate-offer",
    callId: params.callId,
    revision: params.revision,
    recipientUserId: params.recipientUserId,
    sdp: params.sdp,
  });
}

export async function createSignedCallRenegotiationAnswerAuth(params: {
  callId: string;
  revision: number;
  recipientUserId: string;
  sdp: string;
}): Promise<CallSignalAuthProof | null> {
  return createSignedCallRenegotiationAuth({
    kind: "renegotiate-answer",
    callId: params.callId,
    revision: params.revision,
    recipientUserId: params.recipientUserId,
    sdp: params.sdp,
  });
}

// ─── Verification ─────────────────────────────────────────────────────────────

export async function verifyIncomingCallOffer(
  message: IncomingCallOfferMessage
): Promise<CallSignalVerificationResult> {
  const currentUserId = (await loadAuthStoreState()).userId;
  if (currentUserId && message.targetUserId && message.targetUserId !== currentUserId) {
    return { state: "invalid" };
  }
  if (!message.callerDeviceId || !message.targetUserId || !message.auth) {
    return { state: "unverified" };
  }
  try {
    const signingPublicKey = await loadPeerSigningPublicKey(
      message.callerUserId,
      message.callerDeviceId
    );
    if (!signingPublicKey) {
      return { state: "invalid" };
    }
    const valid = await verifyOfferCallAuthProof(message, signingPublicKey);
    return { state: valid ? "verified" : "invalid" };
  } catch {
    return { state: "unverified" };
  }
}

export async function verifyIncomingCallAnswer(
  message: IncomingCallAnswerMessage
): Promise<CallSignalVerificationResult> {
  const currentUserId = (await loadAuthStoreState()).userId;
  if (currentUserId && message.targetUserId && message.targetUserId !== currentUserId) {
    return { state: "invalid" };
  }
  if (!message.answererUserId || !message.answererDeviceId || !message.targetUserId || !message.auth) {
    return { state: "unverified" };
  }
  try {
    const signingPublicKey = await loadPeerSigningPublicKey(
      message.answererUserId,
      message.answererDeviceId
    );
    if (!signingPublicKey) {
      return { state: "invalid" };
    }
    const valid = await verifyAnswerCallAuthProof(message, signingPublicKey);
    return { state: valid ? "verified" : "invalid" };
  } catch {
    return { state: "unverified" };
  }
}

async function verifyIncomingCallRenegotiationMessage(
  message: IncomingCallRenegotiationOfferMessage | IncomingCallRenegotiationAnswerMessage,
  expectedRecipientUserId: string | null | undefined,
  kind: "renegotiate-offer" | "renegotiate-answer"
): Promise<CallSignalVerificationResult> {
  const currentUserId = (await loadAuthStoreState()).userId;
  if (currentUserId && expectedRecipientUserId && expectedRecipientUserId !== currentUserId) {
    return { state: "invalid" };
  }
  if (!expectedRecipientUserId || !message.auth) {
    return { state: "unverified" };
  }
  try {
    const signingPublicKey = await loadPeerSigningPublicKey(
      message.senderUserId,
      message.senderDeviceId
    );
    if (!signingPublicKey) {
      return { state: "invalid" };
    }
    const valid = await verifyRenegotiationCallAuthProof(
      message,
      expectedRecipientUserId,
      kind,
      signingPublicKey
    );
    return { state: valid ? "verified" : "invalid" };
  } catch {
    return { state: "unverified" };
  }
}

export async function verifyIncomingCallRenegotiationOffer(
  message: IncomingCallRenegotiationOfferMessage,
  expectedRecipientUserId: string | null | undefined
): Promise<CallSignalVerificationResult> {
  return verifyIncomingCallRenegotiationMessage(
    message,
    expectedRecipientUserId,
    "renegotiate-offer"
  );
}

export async function verifyIncomingCallRenegotiationAnswer(
  message: IncomingCallRenegotiationAnswerMessage,
  expectedRecipientUserId: string | null | undefined
): Promise<CallSignalVerificationResult> {
  return verifyIncomingCallRenegotiationMessage(
    message,
    expectedRecipientUserId,
    "renegotiate-answer"
  );
}
