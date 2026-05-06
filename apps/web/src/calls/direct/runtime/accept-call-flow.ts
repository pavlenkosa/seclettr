/**
 * Inbound call acceptance flow — extracted from useDirectCallSetupControlRuntime.
 *
 * runAcceptCallFlow is a pure async function; it has no React hook dependencies.
 * All side-effect surfaces are injected via AcceptCallFlowOptions.
 */

import {
  createSignedCallAnswerAuth,
  verifyIncomingCallOffer,
} from "@/calls/direct/runtime/crypto/call-auth-actions";
import { resolveInboundOfferPolicy } from "@/calls/direct/model/call-inbound-offer-policy";
import {
  DIRECT_CALL_SETUP_TIMEOUTS,
  withSetupStageTimeout,
} from "@/calls/direct/model/direct-call-setup-timeouts";
import { wsClient } from "@/lib/websocket";
import {
  negotiateDirectCallMediaEncryptionMode,
  resolvePreferredDirectCallMediaEncryptionMode,
  type DirectCallMediaEncryptionMode,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import { beginDirectCallLifecycleToken } from "@/calls/direct/model/direct-call-lifecycle";
import { toMediaErrorMessage } from "@/calls/direct/model/direct-call-ui-utils";
import {
  DIRECT_CALL_FEATURES,
  type IncomingCallOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import {
  type DirectCallSetupRuntimeOptions,
  resetNegotiationSessionState,
} from "./direct-call-setup-shared";
import {
  DirectCallLifecycleAbortError,
  isDirectCallLifecycleAbortError,
  createLifecycleGuard,
  stopMediaStream,
  addIceCandidatesSafely,
  takePendingIceCandidates,
} from "./call-setup-utils";

// ---------------------------------------------------------------------------
// Local helpers (accept-flow only)
// ---------------------------------------------------------------------------

const resolveInboundSelectedMediaEncryptionMode = (params: {
  mediaEncryptionOffer: Parameters<typeof negotiateDirectCallMediaEncryptionMode>[0];
  callSecurityMode: DirectCallSetupRuntimeOptions["callSecurityMode"];
  resolveLocalSupportedMediaEncryptionModes: DirectCallSetupRuntimeOptions["resolveLocalSupportedMediaEncryptionModes"];
}) => {
  const localSupportedMediaEncryptionModes = params.resolveLocalSupportedMediaEncryptionModes();
  const localPreferredMediaEncryptionMode = resolvePreferredDirectCallMediaEncryptionMode(
    params.callSecurityMode,
    localSupportedMediaEncryptionModes
  );
  const selectedMediaEncryptionMode = negotiateDirectCallMediaEncryptionMode(
    params.mediaEncryptionOffer,
    localSupportedMediaEncryptionModes,
    { localPreferredMode: localPreferredMediaEncryptionMode }
  );
  if (!selectedMediaEncryptionMode) {
    return null;
  }
  if (params.callSecurityMode === "strict" && selectedMediaEncryptionMode !== "frame-v1") {
    return null;
  }
  return {
    localSupportedMediaEncryptionModes,
    selectedMediaEncryptionMode,
  };
};

const rejectInboundSetup = (params: {
  finishCallSession: DirectCallSetupRuntimeOptions["finishCallSession"];
  callId: string;
  t: DirectCallSetupRuntimeOptions["t"];
  reasonKey?: string;
}) => {
  params.finishCallSession({
    reason: "setup-failed",
    authority: "reject",
    callId: params.callId,
    notice: { kind: "error", message: params.t(params.reasonKey ?? "call.error.unableStart") },
  });
};

const applyInboundOfferVerificationPolicy = (params: {
  offerVerification: Awaited<ReturnType<typeof verifyIncomingCallOffer>>;
  callSecurityMode: DirectCallSetupRuntimeOptions["callSecurityMode"];
  rejectInboundSetup: typeof rejectInboundSetup;
  finishCallSession: DirectCallSetupRuntimeOptions["finishCallSession"];
  callId: string;
  pushNotice: DirectCallSetupRuntimeOptions["pushNotice"];
  t: DirectCallSetupRuntimeOptions["t"];
}) => {
  const decision = resolveInboundOfferPolicy(
    params.offerVerification.state,
    params.callSecurityMode
  );
  if (!decision.allow) {
    params.rejectInboundSetup({
      finishCallSession: params.finishCallSession,
      callId: params.callId,
      t: params.t,
      reasonKey: decision.reasonKey,
    });
    return false;
  }
  if (decision.degraded) {
    params.pushNotice({ kind: "error", message: params.t("call.error.unableVerifyCode") });
  }
  return true;
};

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

// ---------------------------------------------------------------------------
// AcceptCallFlowOptions
// ---------------------------------------------------------------------------

export interface AcceptCallFlowOptions
  extends Pick<
    DirectCallSetupRuntimeOptions,
    // Session
    | "incomingRef"
    | "acceptingIncomingCallRef"
    | "directCallLifecycleTokenRef"
    | "outgoingRingingTimeoutRef"
    | "commitIncomingState"
    | "commitActiveState"
    | "setIsMinimized"
    // Negotiation
    | "directCallNegotiationRoleRef"
    | "supportsPeerRenegotiationV1Ref"
    | "renegotiationUnsupportedRef"
    | "negotiationReadyRef"
    | "makingOfferRef"
    | "ignoreOfferRef"
    | "isSettingRemoteAnswerPendingRef"
    | "renegotiationRevisionRef"
    | "lastAppliedRemoteRenegotiationRevisionRef"
    | "pendingLocalRenegotiationRevisionRef"
    // Transport
    | "peerConnectionRef"
    | "pendingIceCandidatesRef"
    | "incomingIceCandidatesRef"
    // Media
    | "createPeerConnection"
    | "ensureVideoSenders"
    | "requestLocalStream"
    | "attachLocalTracksToPeer"
    | "syncVisualTransceiverBindings"
    | "syncVisualTransceiverDirections"
    | "syncOutgoingVisualMediaStateTrackBindings"
    | "refreshRemoteVideoTracksFromPeer"
    // Crypto
    | "callSecurityMode"
    | "resolveLocalSupportedMediaEncryptionModes"
    | "configureDirectCallFrameCrypto"
    | "prepareLocalEphemeralKey"
    | "setPeerEphemeralPublicKey"
    | "applyCallSecurityState"
    // Callbacks
    | "clearNotice"
    | "pushNotice"
    | "debugCallMedia"
    | "finishCallSession"
    | "recordCallEvent"
    | "t"
  > {}

// ---------------------------------------------------------------------------
// runAcceptCallFlow
// ---------------------------------------------------------------------------

export async function runAcceptCallFlow(options: AcceptCallFlowOptions): Promise<void> {
  const {
    incomingRef,
    acceptingIncomingCallRef,
    directCallLifecycleTokenRef,
    outgoingRingingTimeoutRef,
    commitIncomingState,
    commitActiveState,
    setIsMinimized,
    directCallNegotiationRoleRef,
    supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef,
    negotiationReadyRef,
    makingOfferRef,
    ignoreOfferRef,
    isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef,
    peerConnectionRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    createPeerConnection,
    ensureVideoSenders,
    requestLocalStream,
    attachLocalTracksToPeer,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings,
    refreshRemoteVideoTracksFromPeer,
    callSecurityMode,
    resolveLocalSupportedMediaEncryptionModes,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    applyCallSecurityState,
    clearNotice,
    pushNotice,
    debugCallMedia,
    finishCallSession,
    recordCallEvent,
    t,
  } = options;

  const currentIncoming = incomingRef.current;
  if (!currentIncoming) {
    return;
  }
  if (outgoingRingingTimeoutRef.current !== null) {
    clearTimeout(outgoingRingingTimeoutRef.current);
    outgoingRingingTimeoutRef.current = null;
  }
  const lifecycleToken = beginDirectCallLifecycleToken(directCallLifecycleTokenRef.current);
  directCallLifecycleTokenRef.current = lifecycleToken;
  const ensureCurrentLifecycle = createLifecycleGuard({
    lifecycleToken,
    directCallLifecycleTokenRef,
  });

  const {
    callId,
    callerUserId,
    callerLabel,
    callType,
    offerSdp,
    mediaEncryptionOffer,
  } = currentIncoming;
  // Keep runtime ownership of the accepted call while the incoming UI state is hidden.
  // Late hangup/ICE can arrive before activeRef exists, and must still have a session target.
  acceptingIncomingCallRef.current = currentIncoming;
  commitIncomingState(null);

  try {
    resetNegotiationSessionState("inbound", currentIncoming.supportsRenegotiationV1, {
      directCallNegotiationRoleRef,
      supportsPeerRenegotiationV1Ref,
      renegotiationUnsupportedRef,
      negotiationReadyRef,
      makingOfferRef,
      ignoreOfferRef,
      isSettingRemoteAnswerPendingRef,
      renegotiationRevisionRef,
      lastAppliedRemoteRenegotiationRevisionRef,
      pendingLocalRenegotiationRevisionRef,
    });

    const incomingOfferSignal: IncomingCallOfferSignal = {
      type: "call.offer",
      callId,
      callerUserId: currentIncoming.callerUserId,
      callerDeviceId: currentIncoming.callerDeviceId ?? undefined,
      targetUserId: currentIncoming.targetUserId ?? undefined,
      sdp: currentIncoming.offerSdp,
      callType: currentIncoming.callType,
      mediaEncryption: {
        preferredMode: currentIncoming.mediaEncryptionOffer.preferredMode,
        supportedModes: [...currentIncoming.mediaEncryptionOffer.supportedModes],
        // Must round-trip the ephemeral public key so the auth-proof
        // verification material matches what the caller signed.
        ephemeralPublicKey: currentIncoming.mediaEncryptionOffer.ephemeralPublicKey,
      },
      features: currentIncoming.supportsRenegotiationV1 ? DIRECT_CALL_FEATURES : undefined,
      auth: currentIncoming.auth,
    };
    const offerVerification = await verifyIncomingCallOffer(incomingOfferSignal);
    const canProceedAfterOfferVerification = applyInboundOfferVerificationPolicy({
      offerVerification,
      callSecurityMode,
      rejectInboundSetup,
      finishCallSession,
      callId,
      pushNotice,
      t,
    });
    if (!canProceedAfterOfferVerification) {
      return;
    }

    const inboundMediaEncryptionSelection = resolveInboundSelectedMediaEncryptionMode({
      mediaEncryptionOffer,
      callSecurityMode,
      resolveLocalSupportedMediaEncryptionModes,
    });
    if (!inboundMediaEncryptionSelection) {
      rejectInboundSetup({ finishCallSession, callId, t });
      return;
    }
    const {
      localSupportedMediaEncryptionModes,
      selectedMediaEncryptionMode,
    } = inboundMediaEncryptionSelection;

    let resolvedMediaEncryptionMode: DirectCallMediaEncryptionMode = selectedMediaEncryptionMode;
    const mediaEncryptionAnswer: {
      selectedMode: DirectCallMediaEncryptionMode;
      supportedModes: readonly DirectCallMediaEncryptionMode[];
      ephemeralPublicKey?: string;
    } = {
      selectedMode: resolvedMediaEncryptionMode,
      supportedModes: localSupportedMediaEncryptionModes,
    };

    clearNotice();
    setIsMinimized(false);
    commitActiveState({
      callId,
      peerUserId: callerUserId,
      peerDeviceId: currentIncoming.callerDeviceId ?? null,
      peerLabel: callerLabel,
      callType,
      direction: "inbound",
      state: "connecting",
      muted: false,
      videoOff: callType !== "video",
      screenSharing: false,
      duration: 0,
      signalingVerified: offerVerification.state === "verified",
      e2eeActive: false,
      verificationCode: null,
      verificationHash: null,
      verificationError: null,
      mediaEncryptionMode: resolvedMediaEncryptionMode,
      peerSupportsRenegotiationV1: currentIncoming.supportsRenegotiationV1,
    });
    acceptingIncomingCallRef.current = null;

    const pc = await createPeerConnection(callId);
    ensureCurrentLifecycle(() => { pc.close(); });
    peerConnectionRef.current = pc;

    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    ensureCurrentLifecycle(() => { pc.close(); });
    ensureVideoSenders(pc);
    syncVisualTransceiverBindings();
    refreshRemoteVideoTracksFromPeer(callId, "initial-offer-remote-description");
    debugCallMedia("remote-description-set", {
      callId,
      kind: "initial-offer",
      supportsRenegotiationV1: currentIncoming.supportsRenegotiationV1,
    });

    const stream = await withSetupStageTimeout(
      requestLocalStream({ withVideo: callType === "video" }),
      DIRECT_CALL_SETUP_TIMEOUTS.localMediaMs,
      "local-media"
    );
    ensureCurrentLifecycle(() => {
      stopMediaStream(stream);
      pc.close();
    });
    await attachLocalTracksToPeer(pc, stream);
    ensureCurrentLifecycle(() => {
      stopMediaStream(stream);
      pc.close();
    });
    syncOutgoingVisualMediaStateTrackBindings(callId);
    refreshRemoteVideoTracksFromPeer(callId, "initial-answer-local-tracks");

    // Register the caller's ephemeral public key and generate ours before key
    // derivation so both are available inside configureDirectCallFrameCrypto.
    setPeerEphemeralPublicKey(callId, currentIncoming.mediaEncryptionOffer.ephemeralPublicKey);
    if (resolvedMediaEncryptionMode === "frame-v1") {
      try {
        mediaEncryptionAnswer.ephemeralPublicKey = await prepareLocalEphemeralKey(callId);
      } catch {
        // Non-fatal — frame crypto falls back to identity-key derivation.
      }
    }
    ensureCurrentLifecycle(() => {
      stopMediaStream(stream);
      pc.close();
    });

    const frameCryptoResolution = await resolveInboundFrameCryptoMode({
      callId,
      selectedMediaEncryptionMode,
      initialMediaEncryptionMode: resolvedMediaEncryptionMode,
      callSecurityMode,
      callerUserId,
      callerDeviceId: currentIncoming.callerDeviceId ?? null,
      configureDirectCallFrameCrypto,
      commitActiveState,
      pushNotice,
      t,
    });
    ensureCurrentLifecycle(() => {
      stopMediaStream(stream);
      pc.close();
    });
    resolvedMediaEncryptionMode = frameCryptoResolution.resolvedMediaEncryptionMode;
    mediaEncryptionAnswer.selectedMode = resolvedMediaEncryptionMode;
    if (!frameCryptoResolution.ok) {
      rejectInboundSetup({ finishCallSession, callId, t });
      return;
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

    syncVisualTransceiverDirections(callId);
    syncVisualTransceiverBindings();
    const answer = await pc.createAnswer();
    ensureCurrentLifecycle(() => {
      stopMediaStream(stream);
      pc.close();
    });
    await pc.setLocalDescription(answer);
    ensureCurrentLifecycle(() => {
      stopMediaStream(stream);
      pc.close();
    });
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
  } catch (error) {
    if (isDirectCallLifecycleAbortError(error)) {
      return;
    }
    finishCallSession({
      reason: "setup-failed",
      authority: "reject",
      callId,
      notice: { kind: "error", message: toMediaErrorMessage(error, "audio", t) },
      onBeforeReset: () => {
        recordCallEvent({
          userId: callerUserId,
          fallbackLabel: callerLabel,
          mode: callType,
          direction: "inbound",
          outcome: "declined",
        });
      },
    });
  }
}
