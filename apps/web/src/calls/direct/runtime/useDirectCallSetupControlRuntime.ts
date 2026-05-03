import { useCallback } from "react";
import { api } from "@/lib/api";
import {
  createSignedCallOfferAuth,
  createSignedCallAnswerAuth,
  verifyIncomingCallOffer,
} from "@/calls/direct/runtime/crypto/call-auth-actions";
import { resolveInboundOfferPolicy } from "@/calls/direct/model/call-inbound-offer-policy";
import {
  DIRECT_CALL_SETUP_TIMEOUTS,
  DirectCallSetupTimeoutError,
  withSetupStageTimeout,
} from "@/calls/direct/model/direct-call-setup-timeouts";
import { wsClient } from "@/lib/websocket";
import {
  buildDirectCallMediaEncryptionOffer,
  negotiateDirectCallMediaEncryptionMode,
  resolvePreferredDirectCallMediaEncryptionMode,
  resolveLegacyDirectCallMediaEncryptionOffer,
  type DirectCallMediaEncryptionMode,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import {
  beginDirectCallLifecycleToken,
  isCurrentDirectCallLifecycleToken,
  resolveDirectCallDurationSeconds,
} from "@/calls/direct/model/direct-call-lifecycle";
import { toMediaErrorMessage } from "@/calls/direct/model/direct-call-ui-utils";
import {
  DIRECT_CALL_FEATURES,
  type ActiveCall,
  type CallType,
  type IncomingCallOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import { logger } from "@/lib/logger.js";
import {
  type DirectCallSetupRuntimeOptions,
  resetNegotiationSessionState,
} from "./direct-call-setup-shared";

/** Outgoing calls that go unanswered are automatically cancelled after this interval. */
const OUTGOING_CALL_RINGING_TIMEOUT_MS = 60_000;

class DirectCallLifecycleAbortError extends Error {
  constructor() {
    super("Direct call lifecycle token is stale");
  }
}

const stopMediaStream = (stream: MediaStream | null | undefined) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
};

const abortIfStaleLifecycle = (
  isCurrent: boolean,
  onAbort?: () => void
) => {
  if (isCurrent) {
    return;
  }
  onAbort?.();
  throw new DirectCallLifecycleAbortError();
};

const isDirectCallLifecycleAbortError = (error: unknown): error is DirectCallLifecycleAbortError =>
  error instanceof DirectCallLifecycleAbortError;

const isDirectCallSetupTimeoutError = (error: unknown): error is DirectCallSetupTimeoutError =>
  error instanceof DirectCallSetupTimeoutError;

const createLifecycleGuard = (params: {
  lifecycleToken: number;
  directCallLifecycleTokenRef: DirectCallSetupRuntimeOptions["directCallLifecycleTokenRef"];
}) => (onAbort?: () => void) => {
  abortIfStaleLifecycle(
    isCurrentDirectCallLifecycleToken(
      params.directCallLifecycleTokenRef.current,
      params.lifecycleToken
    ),
    onAbort
  );
};

const buildStartCallError = (t: DirectCallSetupRuntimeOptions["t"]) =>
  new Error(t("call.error.unableStart"));

const resolveOutboundMediaEncryptionOffer = (params: {
  callId: string;
  callSecurityMode: DirectCallSetupRuntimeOptions["callSecurityMode"];
  resolveLocalSupportedMediaEncryptionModes: DirectCallSetupRuntimeOptions["resolveLocalSupportedMediaEncryptionModes"];
  primeDirectCallSenderFrameCrypto: DirectCallSetupRuntimeOptions["primeDirectCallSenderFrameCrypto"];
  closeDirectCallFrameCrypto: DirectCallSetupRuntimeOptions["closeDirectCallFrameCrypto"];
  pushNotice: DirectCallSetupRuntimeOptions["pushNotice"];
  t: DirectCallSetupRuntimeOptions["t"];
}) => {
  const localSupportedMediaEncryptionModes = params.resolveLocalSupportedMediaEncryptionModes();
  if (
    params.callSecurityMode === "strict"
    && !localSupportedMediaEncryptionModes.includes("frame-v1")
  ) {
    throw buildStartCallError(params.t);
  }
  let mediaEncryptionOffer = buildDirectCallMediaEncryptionOffer(
    params.callSecurityMode,
    localSupportedMediaEncryptionModes
  );
  if (!mediaEncryptionOffer.supportedModes.includes("frame-v1")) {
    return mediaEncryptionOffer;
  }
  const framePipelineReady = params.primeDirectCallSenderFrameCrypto(params.callId);
  if (framePipelineReady) {
    return mediaEncryptionOffer;
  }
  params.closeDirectCallFrameCrypto();
  if (params.callSecurityMode === "strict") {
    throw buildStartCallError(params.t);
  }
  mediaEncryptionOffer = resolveLegacyDirectCallMediaEncryptionOffer();
  params.pushNotice({ kind: "info", message: params.t("callSecurity.frameFallbackTransport") });
  return mediaEncryptionOffer;
};

const scheduleOutgoingRingingTimeout = (params: {
  lifecycleToken: number;
  directCallLifecycleTokenRef: DirectCallSetupRuntimeOptions["directCallLifecycleTokenRef"];
  activeRef: DirectCallSetupRuntimeOptions["activeRef"];
  callId: string;
  finishCallSession: DirectCallSetupRuntimeOptions["finishCallSession"];
  recordCallEvent: DirectCallSetupRuntimeOptions["recordCallEvent"];
  resolvePeerLabel: DirectCallSetupRuntimeOptions["resolvePeerLabel"];
  peerUserId: string;
  peerLabel?: string;
  callType: CallType;
  t: DirectCallSetupRuntimeOptions["t"];
}) => {
  setTimeout(() => {
    if (!isCurrentDirectCallLifecycleToken(params.directCallLifecycleTokenRef.current, params.lifecycleToken)) return;
    if (params.activeRef.current?.callId !== params.callId || params.activeRef.current.state !== "ringing") return;
    params.finishCallSession({
      reason: "ringing-timeout",
      authority: "hangup",
      callId: params.callId,
      notice: { kind: "info", message: params.t("call.notice.noAnswer") },
      onBeforeReset: () => {
        params.recordCallEvent({
          userId: params.peerUserId,
          fallbackLabel: params.resolvePeerLabel(params.peerUserId, params.peerLabel),
          mode: params.callType,
          direction: "outbound",
          outcome: "ended",
          durationSec: 0,
        });
      },
    });
  }, OUTGOING_CALL_RINGING_TIMEOUT_MS);
};

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

const addIceCandidatesSafely = async (
  pc: RTCPeerConnection,
  candidates: RTCIceCandidateInit[],
  logPrefix: string
) => {
  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      logger.warn(logPrefix, error);
    }
  }
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

const takePendingIceCandidates = (
  callId: string,
  pendingIceCandidatesRef: DirectCallSetupRuntimeOptions["pendingIceCandidatesRef"]
): RTCIceCandidateInit[] => {
  const pending = pendingIceCandidatesRef.current.get(callId) ?? [];
  pendingIceCandidatesRef.current.delete(callId);
  return pending;
};

export function useDirectCallSetupControlRuntime(options: DirectCallSetupRuntimeOptions) {
  const {
    // --- DirectCallSetupSessionContext ---
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    directCallLifecycleTokenRef,
    commitIncomingState,
    commitActiveState,
    setIsMinimized,
    // --- DirectCallSetupNegotiationContext ---
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
    outboundMediaEncryptionOfferRef,
    // --- DirectCallSetupTransportContext ---
    peerConnectionRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    // --- DirectCallSetupMediaContext ---
    createPeerConnection,
    ensureVideoSenders,
    requestLocalStream,
    attachLocalTracksToPeer,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings,
    refreshRemoteVideoTracksFromPeer,
    // --- DirectCallSetupCryptoContext ---
    callSecurityMode,
    resolveLocalSupportedMediaEncryptionModes,
    primeDirectCallSenderFrameCrypto,
    closeDirectCallFrameCrypto,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    applyCallSecurityState,
    // --- DirectCallSetupCallbackContext ---
    clearNotice,
    ensureConversationUsername,
    resolvePeerLabel,
    pushNotice,
    debugCallMedia,
    finishCallSession,
    recordCallEvent,
    t,
  } = options;

  const startCall = useCallback(async (peerUserId: string, callType: CallType, peerLabel?: string) => {
    if (activeRef.current || incomingRef.current) {
      return;
    }
    let callId: string | null = null;
    const lifecycleToken = beginDirectCallLifecycleToken(directCallLifecycleTokenRef.current);
    directCallLifecycleTokenRef.current = lifecycleToken;
    const ensureCurrentLifecycle = createLifecycleGuard({
      lifecycleToken,
      directCallLifecycleTokenRef,
    });

    try {
      clearNotice();
      const created = await withSetupStageTimeout(
        api.post<{ callId: string }>("/calls", { calleeUserId: peerUserId, callType }),
        DIRECT_CALL_SETUP_TIMEOUTS.apiCreateCallMs,
        "api-create-call"
      );
      ensureCurrentLifecycle();
      callId = created.callId;
      resetNegotiationSessionState("outbound", false, {
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

      const pc = await createPeerConnection(callId);
      ensureCurrentLifecycle(() => { pc.close(); });
      peerConnectionRef.current = pc;
      ensureVideoSenders(pc);

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
      refreshRemoteVideoTracksFromPeer(callId, "initial-offer-local-tracks");

      const mediaEncryptionOffer = resolveOutboundMediaEncryptionOffer({
        callId,
        callSecurityMode,
        resolveLocalSupportedMediaEncryptionModes,
        primeDirectCallSenderFrameCrypto,
        closeDirectCallFrameCrypto,
        pushNotice,
        t,
      });

      syncVisualTransceiverDirections(callId);
      syncVisualTransceiverBindings();
      const offer = await pc.createOffer();
      ensureCurrentLifecycle(() => {
        stopMediaStream(stream);
        pc.close();
      });
      await pc.setLocalDescription(offer);
      ensureCurrentLifecycle(() => {
        stopMediaStream(stream);
        pc.close();
      });
      syncOutgoingVisualMediaStateTrackBindings(callId);
      refreshRemoteVideoTracksFromPeer(callId, "initial-offer-local-description");
      debugCallMedia("local-description-set", { callId, kind: "initial-offer", type: offer.type });
      if (!offer.sdp) {
        throw new Error(t("call.error.unableStart"));
      }
      outboundMediaEncryptionOfferRef.current = mediaEncryptionOffer;

      // Generate a fresh ephemeral X25519 key pair for this call. The public key
      // is signed together with the offer SDP so MITM substitution breaks the proof.
      let ephemeralPublicKey: string | undefined;
      if (mediaEncryptionOffer.supportedModes.includes("frame-v1")) {
        try {
          ephemeralPublicKey = await prepareLocalEphemeralKey(callId);
        } catch {
          // Non-fatal — frame crypto will fall back to identity-key derivation.
        }
      }
      ensureCurrentLifecycle();

      const offerWithEphemeral: typeof mediaEncryptionOffer = ephemeralPublicKey
        ? { ...mediaEncryptionOffer, ephemeralPublicKey }
        : mediaEncryptionOffer;

      const offerAuth = await createSignedCallOfferAuth({
        callId,
        recipientUserId: peerUserId,
        callType,
        sdp: offer.sdp,
        mediaEncryption: offerWithEphemeral,
      });
      ensureCurrentLifecycle(() => {
        debugCallMedia("initial-offer-aborted-stale", { callId });
      });

      const nextActiveState: ActiveCall = {
        callId,
        peerUserId,
        peerDeviceId: null,
        peerLabel: resolvePeerLabel(peerUserId, peerLabel),
        callType,
        direction: "outbound",
        state: "ringing",
        muted: false,
        videoOff: callType !== "video",
        screenSharing: false,
        duration: 0,
        signalingVerified: false,
        e2eeActive: false,
        verificationCode: null,
        verificationHash: null,
        verificationError: null,
        mediaEncryptionMode: mediaEncryptionOffer.preferredMode,
        peerSupportsRenegotiationV1: false,
      };
      commitActiveState(nextActiveState);

      scheduleOutgoingRingingTimeout({
        lifecycleToken,
        directCallLifecycleTokenRef,
        activeRef,
        callId,
        finishCallSession,
        recordCallEvent,
        resolvePeerLabel,
        peerUserId,
        peerLabel,
        callType,
        t,
      });

      const offerDispatch = wsClient.send({
        type: "call.offer",
        callId,
        targetUserId: peerUserId,
        sdp: offer.sdp,
        callType,
        mediaEncryption: offerWithEphemeral,
        features: DIRECT_CALL_FEATURES,
        auth: offerAuth ?? undefined,
      });
      if (offerDispatch.status !== "sent") {
        debugCallMedia("initial-offer-delivery-failed", { callId, status: offerDispatch.status });
        throw new Error(t("call.error.unableStart"));
      }

      setIsMinimized(false);
      ensureConversationUsername(peerUserId, peerLabel).then((resolvedLabel) => {
        if (!resolvedLabel) return;
        if (!isCurrentDirectCallLifecycleToken(directCallLifecycleTokenRef.current, lifecycleToken)) return;
        commitActiveState((prev) => (
          prev?.callId === callId ? { ...prev, peerLabel: resolvedLabel } : prev
        ));
      }).catch(() => {});
    } catch (error) {
      if (isDirectCallLifecycleAbortError(error)) {
        return;
      }
      finishCallSession({
        reason: "setup-failed",
        authority: callId ? "hangup" : null,
        callId,
        notice: { kind: "error", message: toMediaErrorMessage(error, "audio", t) },
      });
      throw error;
    }
  }, [
    activeRef,
    attachLocalTracksToPeer,
    callSecurityMode,
    clearNotice,
    closeDirectCallFrameCrypto,
    commitActiveState,
    createPeerConnection,
    debugCallMedia,
    directCallLifecycleTokenRef,
    directCallNegotiationRoleRef,
    ensureConversationUsername,
    ensureVideoSenders,
    ignoreOfferRef,
    incomingRef,
    isSettingRemoteAnswerPendingRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    makingOfferRef,
    negotiationReadyRef,
    outboundMediaEncryptionOfferRef,
    peerConnectionRef,
    pendingLocalRenegotiationRevisionRef,
    primeDirectCallSenderFrameCrypto,
    pushNotice,
    recordCallEvent,
    refreshRemoteVideoTracksFromPeer,
    renegotiationRevisionRef,
    renegotiationUnsupportedRef,
    requestLocalStream,
    resolveLocalSupportedMediaEncryptionModes,
    prepareLocalEphemeralKey,
    resolvePeerLabel,
    setIsMinimized,
    supportsPeerRenegotiationV1Ref,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
    finishCallSession,
  ]);

  const acceptCall = useCallback(async () => {
    const currentIncoming = incomingRef.current;
    if (!currentIncoming) {
      return;
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
  }, [
    applyCallSecurityState,
    attachLocalTracksToPeer,
    acceptingIncomingCallRef,
    callSecurityMode,
    clearNotice,
    commitActiveState,
    commitIncomingState,
    configureDirectCallFrameCrypto,
    createPeerConnection,
    debugCallMedia,
    directCallLifecycleTokenRef,
    directCallNegotiationRoleRef,
    ensureVideoSenders,
    ignoreOfferRef,
    incomingIceCandidatesRef,
    incomingRef,
    isSettingRemoteAnswerPendingRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    makingOfferRef,
    negotiationReadyRef,
    peerConnectionRef,
    pendingIceCandidatesRef,
    pendingLocalRenegotiationRevisionRef,
    pushNotice,
    recordCallEvent,
    refreshRemoteVideoTracksFromPeer,
    renegotiationRevisionRef,
    renegotiationUnsupportedRef,
    requestLocalStream,
    resolveLocalSupportedMediaEncryptionModes,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    setIsMinimized,
    supportsPeerRenegotiationV1Ref,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
    finishCallSession,
  ]);

  const rejectCall = useCallback(() => {
    const currentIncoming = incomingRef.current;
    if (!currentIncoming) {
      return;
    }
    finishCallSession({
      reason: "local-reject",
      authority: "reject",
      callId: currentIncoming.callId,
      notice: { kind: "info", message: t("call.notice.declined") },
      onBeforeReset: () => {
        recordCallEvent({
          userId: currentIncoming.callerUserId,
          fallbackLabel: currentIncoming.callerLabel,
          mode: currentIncoming.callType,
          direction: "inbound",
          outcome: "declined",
        });
      },
    });
  }, [
    incomingRef,
    recordCallEvent,
    t,
    finishCallSession,
  ]);

  const hangup = useCallback(() => {
    const currentActive = activeRef.current;
    finishCallSession({
      reason: "local-hangup",
      authority: "hangup",
      notice: { kind: "info", message: t("call.notice.ended") },
      onBeforeReset: () => {
        if (!currentActive) {
          return;
        }
        recordCallEvent({
          userId: currentActive.peerUserId,
          fallbackLabel: currentActive.peerLabel,
          mode: currentActive.callType,
          direction: currentActive.direction,
          outcome: "ended",
          durationSec: resolveDirectCallDurationSeconds(currentActive),
        });
      },
    });
  }, [activeRef, recordCallEvent, t, finishCallSession]);

  return {
    startCall,
    acceptCall,
    rejectCall,
    hangup,
  };
}
