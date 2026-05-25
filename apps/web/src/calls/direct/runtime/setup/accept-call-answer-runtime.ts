/**
 * accept-call-answer-runtime owns the post-bootstrap inbound accept tail:
 * frame-crypto preparation/fallback, ICE drain, local answer creation, and
 * signed answer dispatch.
 *
 * It does not own offer verification or peer/media bootstrap.
 */

import { createSignedCallAnswerAuth } from "@/calls/direct/runtime/crypto/call-auth-actions";
import { wsClient } from "@/lib/websocket";
import { DIRECT_CALL_FEATURES } from "@/calls/direct/model/direct-call-types";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import type { DirectCallSetupRuntimeOptions } from "./direct-call-setup-shared";
import { addIceCandidatesSafely, takePendingIceCandidates } from "./call-setup-utils";

type EnsureCurrentLifecycle = (teardown: () => void) => void;

const resolveInboundFrameCryptoMode = async (params: {
  callId: string;
  selectedMediaEncryptionMode: DirectCallMediaEncryptionMode;
  initialMediaEncryptionMode: DirectCallMediaEncryptionMode;
  callSecurityMode: DirectCallSetupRuntimeOptions["callSecurityMode"];
  callerUserId: string;
  callerDeviceId: string | null;
  configureDirectCallFrameCrypto: DirectCallSetupRuntimeOptions["configureDirectCallFrameCrypto"];
  commitActiveState: DirectCallSetupRuntimeOptions["commitActiveState"];
  pushNotice: DirectCallSetupRuntimeOptions["pushNotice"];
  t: DirectCallSetupRuntimeOptions["t"];
}) => {
  let resolvedMediaEncryptionMode = params.initialMediaEncryptionMode;
  let frameCryptoReady = await params.configureDirectCallFrameCrypto({
    callId: params.callId,
    mediaEncryptionMode: resolvedMediaEncryptionMode,
    peerUserId: params.callerUserId,
    peerDeviceId: params.callerDeviceId,
  });
  if (frameCryptoReady) {
    return { ok: true, resolvedMediaEncryptionMode };
  }
  if (params.selectedMediaEncryptionMode !== "frame-v1") {
    return { ok: false, resolvedMediaEncryptionMode };
  }
  if (params.callSecurityMode === "strict") {
    return { ok: false, resolvedMediaEncryptionMode };
  }

  resolvedMediaEncryptionMode = "transport";
  frameCryptoReady = await params.configureDirectCallFrameCrypto({
    callId: params.callId,
    mediaEncryptionMode: resolvedMediaEncryptionMode,
    peerUserId: params.callerUserId,
    peerDeviceId: params.callerDeviceId,
  });
  if (!frameCryptoReady) {
    return { ok: false, resolvedMediaEncryptionMode };
  }

  params.commitActiveState((prev) => (
    prev?.callId === params.callId
      ? { ...prev, mediaEncryptionMode: resolvedMediaEncryptionMode }
      : prev
  ));
  params.pushNotice({ kind: "info", message: params.t("callSecurity.frameFallbackTransport") });
  return { ok: true, resolvedMediaEncryptionMode };
};

export interface FinalizeAcceptedIncomingCallAnswerOptions {
  callId: string;
  callerUserId: string;
  callerDeviceId: string | null;
  selectedMediaEncryptionMode: DirectCallMediaEncryptionMode;
  resolvedMediaEncryptionMode: DirectCallMediaEncryptionMode;
  localSupportedMediaEncryptionModes: readonly DirectCallMediaEncryptionMode[];
  mediaEncryptionOfferEphemeralPublicKey: string | undefined;
  callSecurityMode: DirectCallSetupRuntimeOptions["callSecurityMode"];
  pc: RTCPeerConnection;
  pendingIceCandidatesRef: DirectCallSetupRuntimeOptions["pendingIceCandidatesRef"];
  incomingIceCandidatesRef: DirectCallSetupRuntimeOptions["incomingIceCandidatesRef"];
  configureDirectCallFrameCrypto: DirectCallSetupRuntimeOptions["configureDirectCallFrameCrypto"];
  commitActiveState: DirectCallSetupRuntimeOptions["commitActiveState"];
  pushNotice: DirectCallSetupRuntimeOptions["pushNotice"];
  t: DirectCallSetupRuntimeOptions["t"];
  setPeerEphemeralPublicKey: DirectCallSetupRuntimeOptions["setPeerEphemeralPublicKey"];
  prepareLocalEphemeralKey: DirectCallSetupRuntimeOptions["prepareLocalEphemeralKey"];
  syncVisualTransceiverBindings: DirectCallSetupRuntimeOptions["syncVisualTransceiverBindings"];
  syncOutgoingVisualMediaStateTrackBindings: DirectCallSetupRuntimeOptions["syncOutgoingVisualMediaStateTrackBindings"];
  refreshRemoteVideoTracksFromPeer: DirectCallSetupRuntimeOptions["refreshRemoteVideoTracksFromPeer"];
  debugCallMedia: DirectCallSetupRuntimeOptions["debugCallMedia"];
  applyCallSecurityState: DirectCallSetupRuntimeOptions["applyCallSecurityState"];
  negotiationReadyRef: DirectCallSetupRuntimeOptions["negotiationReadyRef"];
  ensureCurrentLifecycle: EnsureCurrentLifecycle;
}

export interface FinalizeAcceptedIncomingCallAnswerResult {
  ok: boolean;
  resolvedMediaEncryptionMode: DirectCallMediaEncryptionMode;
}

export async function finalizeAcceptedIncomingCallAnswer({
  callId,
  callerUserId,
  callerDeviceId,
  selectedMediaEncryptionMode,
  resolvedMediaEncryptionMode,
  localSupportedMediaEncryptionModes,
  mediaEncryptionOfferEphemeralPublicKey,
  callSecurityMode,
  pc,
  pendingIceCandidatesRef,
  incomingIceCandidatesRef,
  configureDirectCallFrameCrypto,
  commitActiveState,
  pushNotice,
  t,
  setPeerEphemeralPublicKey,
  prepareLocalEphemeralKey,
  syncVisualTransceiverBindings,
  syncOutgoingVisualMediaStateTrackBindings,
  refreshRemoteVideoTracksFromPeer,
  debugCallMedia,
  applyCallSecurityState,
  negotiationReadyRef,
  ensureCurrentLifecycle,
}: FinalizeAcceptedIncomingCallAnswerOptions): Promise<FinalizeAcceptedIncomingCallAnswerResult> {
  let finalResolvedMediaEncryptionMode = resolvedMediaEncryptionMode;
  const mediaEncryptionAnswer: {
    selectedMode: DirectCallMediaEncryptionMode;
    supportedModes: readonly DirectCallMediaEncryptionMode[];
    ephemeralPublicKey?: string;
  } = {
    selectedMode: finalResolvedMediaEncryptionMode,
    supportedModes: localSupportedMediaEncryptionModes,
  };

  setPeerEphemeralPublicKey(callId, mediaEncryptionOfferEphemeralPublicKey);
  if (finalResolvedMediaEncryptionMode === "frame-v1") {
    try {
      mediaEncryptionAnswer.ephemeralPublicKey = await prepareLocalEphemeralKey(callId);
    } catch {
      // Non-fatal — frame crypto falls back to identity-key derivation.
    }
  }

  const frameCryptoResolution = await resolveInboundFrameCryptoMode({
    callId,
    selectedMediaEncryptionMode,
    initialMediaEncryptionMode: finalResolvedMediaEncryptionMode,
    callSecurityMode,
    callerUserId,
    callerDeviceId,
    configureDirectCallFrameCrypto,
    commitActiveState,
    pushNotice,
    t,
  });
  finalResolvedMediaEncryptionMode = frameCryptoResolution.resolvedMediaEncryptionMode;
  mediaEncryptionAnswer.selectedMode = finalResolvedMediaEncryptionMode;
  if (!frameCryptoResolution.ok) {
    return { ok: false, resolvedMediaEncryptionMode: finalResolvedMediaEncryptionMode };
  }

  const queuedIncomingIce = incomingIceCandidatesRef.current.get(callId) ?? [];
  incomingIceCandidatesRef.current.delete(callId);
  await addIceCandidatesSafely(
    pc,
    queuedIncomingIce,
    "[CALL] failed to add pre-answer ICE candidate"
  );
  const pending = takePendingIceCandidates(callId, pendingIceCandidatesRef);
  await addIceCandidatesSafely(
    pc,
    pending,
    "[CALL] failed to add queued ICE candidate"
  );

  syncVisualTransceiverBindings();
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  syncOutgoingVisualMediaStateTrackBindings(callId);
  refreshRemoteVideoTracksFromPeer(callId, "initial-answer-local-description");
  debugCallMedia("local-description-set", { callId, kind: "initial-answer", type: answer.type });
  await applyCallSecurityState(callId, pc);
  const answerAuth = await createSignedCallAnswerAuth({
    callId,
    recipientUserId: callerUserId,
    sdp: answer.sdp!,
    mediaEncryption: mediaEncryptionAnswer,
  });
  ensureCurrentLifecycle(() => {
    debugCallMedia("initial-answer-aborted-stale", { callId });
  });
  const answerDispatch = wsClient.send({
    type: "call.answer",
    callId,
    sdp: answer.sdp!,
    mediaEncryption: mediaEncryptionAnswer,
    features: DIRECT_CALL_FEATURES,
    auth: answerAuth ?? undefined,
  });
  if (answerDispatch.status !== "sent") {
    debugCallMedia("initial-answer-delivery-failed", { callId, status: answerDispatch.status });
    throw new Error(t("call.error.unableStart"));
  }

  negotiationReadyRef.current = true;
  return { ok: true, resolvedMediaEncryptionMode: finalResolvedMediaEncryptionMode };
}
