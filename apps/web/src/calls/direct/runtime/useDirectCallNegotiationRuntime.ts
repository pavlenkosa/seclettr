import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { CallSignalVerificationResult } from "@/calls/direct/runtime/crypto/call-auth-material";
import {
  createSignedCallRenegotiationOfferAuth,
  verifyIncomingCallAnswer,
} from "@/calls/direct/runtime/crypto/call-auth-actions";
import {
  validateDirectCallMediaEncryptionAnswer,
  resolveLegacyDirectCallMediaEncryptionOffer,
  type DirectCallMediaEncryptionMode,
  type DirectCallMediaEncryptionOffer,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import type { CallSecurityMode } from "@/ui-settings";
import { type DirectCallNegotiationRole } from "@/calls/direct/model/direct-call-lifecycle";
import type {
  ActiveCall,
  CallNotice,
  IncomingCallAnsweredSignal,
} from "@/calls/direct/model/direct-call-types";
import {
  createNegotiationDispatch,
  type PendingRenegotiationAnswerDispatch,
  type PendingRenegotiationOfferDispatch,
} from "@/calls/direct/runtime/direct-call-negotiation-dispatch";
import { wsClient } from "@/lib/websocket";
import { useDirectCallRenegotiationHandlers } from "./useDirectCallRenegotiationHandlers";
import { logger } from "@/lib/logger.js";
import type { DirectCallTranslate, DirectCallPushNotice } from "./direct-call-runtime-types";

interface UseDirectCallNegotiationRuntimeOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  lastAppliedRemoteRenegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  directCallNegotiationRoleRef: MutableRefObject<DirectCallNegotiationRole>;
  negotiationReadyRef: MutableRefObject<boolean>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  outboundMediaEncryptionOfferRef: MutableRefObject<DirectCallMediaEncryptionOffer | null>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  callSecurityMode: CallSecurityMode;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  recordLastRenegotiationAttempt: (payload: Record<string, unknown>) => void;
  shouldIgnoreUnexpectedPeerSignal: (params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => boolean;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  resetCallState: (opts?: { sendHangup?: boolean; notice?: CallNotice }) => void;
  resetCallStateIfCurrent: (
    callId: string,
    opts?: { sendHangup?: boolean; notice?: CallNotice },
    pc?: RTCPeerConnection | null
  ) => boolean;
  syncVisualTransceiverBindings: () => void;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncOutgoingVisualMediaStateTrackBindings: (callIdOverride?: string) => void;
  refreshRemoteVideoTracksFromPeer: (callIdOverride?: string, reason?: string) => void;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: DirectCallMediaEncryptionMode;
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  setPeerEphemeralPublicKey: (callId: string, pubKeyBase64: string | null | undefined) => void;
  applySignalVerificationResult: (callId: string, result: CallSignalVerificationResult) => void;
  applyCallSecurityState: (callId: string, pc: RTCPeerConnection) => Promise<void>;
  setActiveIfCurrent: (
    callId: string,
    update: (current: ActiveCall) => ActiveCall
  ) => void;
  pushNotice: DirectCallPushNotice;
  t: DirectCallTranslate;
}

type InitialAnswerMediaEncryption = NonNullable<IncomingCallAnsweredSignal["mediaEncryption"]>;

interface InitialAnswerRuntimeContext {
  readonly pc: RTCPeerConnection;
  readonly currentActive: ActiveCall;
  readonly callId: string;
}

interface InitialAnswerMediaNegotiation {
  readonly offerMediaEncryption: DirectCallMediaEncryptionOffer;
  readonly answerMediaEncryption: InitialAnswerMediaEncryption;
  readonly negotiatedMediaEncryptionMode: DirectCallMediaEncryptionMode | null;
}

interface InitialAnswerPeerIdentity {
  readonly peerUserId: string | null;
  readonly peerDeviceId: string | null;
}

function resolveInitialAnswerRuntimeContext({
  activeRef,
  peerConnectionRef,
}: Pick<UseDirectCallNegotiationRuntimeOptions, "activeRef" | "peerConnectionRef">): InitialAnswerRuntimeContext | null {
  const pc = peerConnectionRef.current;
  const currentActive = activeRef.current;
  const callId = currentActive?.callId;
  if (!pc || !currentActive || !callId) return null;
  return { pc, currentActive, callId };
}

function resolveInitialAnswerMediaNegotiation(
  message: IncomingCallAnsweredSignal,
  outboundOffer: DirectCallMediaEncryptionOffer | null
): InitialAnswerMediaNegotiation {
  const offerMediaEncryption = outboundOffer ?? resolveLegacyDirectCallMediaEncryptionOffer();
  const answerMediaEncryption = message.mediaEncryption ?? {
    selectedMode: "transport",
    supportedModes: ["transport"] as const,
  };
  const negotiatedMediaEncryptionMode = validateDirectCallMediaEncryptionAnswer(
    offerMediaEncryption,
    answerMediaEncryption
  );
  return { offerMediaEncryption, answerMediaEncryption, negotiatedMediaEncryptionMode };
}

function resolveInitialAnswerPeerIdentity(
  message: IncomingCallAnsweredSignal,
  currentActive: ActiveCall
): InitialAnswerPeerIdentity {
  return {
    peerUserId: message.answererUserId ?? currentActive.peerUserId ?? null,
    peerDeviceId: message.answererDeviceId ?? currentActive.peerDeviceId ?? null,
  };
}

function isPeerConnectionConnected(pc: RTCPeerConnection): boolean {
  return (
    pc.connectionState === "connected" ||
    pc.iceConnectionState === "connected" ||
    pc.iceConnectionState === "completed"
  );
}

async function addQueuedInitialAnswerIceCandidates(
  pc: RTCPeerConnection,
  callId: string,
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>
): Promise<void> {
  const pending = pendingIceCandidatesRef.current.get(callId);
  if (!pending || pending.length === 0) return;

  pendingIceCandidatesRef.current.delete(callId);
  for (const candidate of pending) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      logger.warn("[CALL] failed to add queued ICE candidate", error);
    }
  }
}

async function applyInitialAnswerVerification({
  applySignalVerificationResult,
  callId,
  callSecurityMode,
  debugCallMedia,
  isCurrentActiveCallContext,
  message,
  pc,
  pushNotice,
  resetCallStateIfCurrent,
  t,
}: Pick<
  UseDirectCallNegotiationRuntimeOptions,
  | "applySignalVerificationResult"
  | "callSecurityMode"
  | "debugCallMedia"
  | "isCurrentActiveCallContext"
  | "pushNotice"
  | "resetCallStateIfCurrent"
  | "t"
> & {
  readonly callId: string;
  readonly message: IncomingCallAnsweredSignal;
  readonly pc: RTCPeerConnection;
}): Promise<boolean> {
  debugCallMedia("initial-answer-verification-start", {
    callId: message.callId,
    answererUserId: message.answererUserId ?? null,
    answererDeviceId: message.answererDeviceId ?? null,
  });
  const verification = await verifyIncomingCallAnswer(message);
  debugCallMedia("initial-answer-verification-result", { callId: message.callId, state: verification.state });
  if (!isCurrentActiveCallContext(callId, pc)) {
    debugCallMedia("initial-answer-aborted-stale-after-verification", { callId: message.callId });
    return false;
  }
  if (verification.state !== "invalid") {
    applySignalVerificationResult(callId, verification);
    return true;
  }
  if (callSecurityMode === "strict") {
    resetCallStateIfCurrent(callId, { sendHangup: true, notice: { kind: "error", message: t("call.error.unableVerifyCode") } }, pc);
    return false;
  }
  applySignalVerificationResult(callId, { state: "unverified" });
  pushNotice({ kind: "error", message: t("call.error.unableVerifyCode") });
  return true;
}

async function applyInitialRemoteDescription({
  callId,
  debugCallMedia,
  isCurrentActiveCallContext,
  message,
  negotiationReadyRef,
  pc,
  pendingIceCandidatesRef,
  refreshRemoteVideoTracksFromPeer,
  renegotiationUnsupportedRef,
  supportsPeerRenegotiationV1Ref,
  syncVisualTransceiverBindings,
}: Pick<
  UseDirectCallNegotiationRuntimeOptions,
  | "debugCallMedia"
  | "isCurrentActiveCallContext"
  | "negotiationReadyRef"
  | "pendingIceCandidatesRef"
  | "refreshRemoteVideoTracksFromPeer"
  | "renegotiationUnsupportedRef"
  | "supportsPeerRenegotiationV1Ref"
  | "syncVisualTransceiverBindings"
> & {
  readonly callId: string;
  readonly message: IncomingCallAnsweredSignal;
  readonly pc: RTCPeerConnection;
}): Promise<boolean> {
  debugCallMedia("remote-description-applying", { callId, kind: "initial-answer" });
  await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
  if (!isCurrentActiveCallContext(callId, pc)) return false;

  syncVisualTransceiverBindings();
  refreshRemoteVideoTracksFromPeer(callId, "initial-answer");
  supportsPeerRenegotiationV1Ref.current = !!(message.features?.renegotiationV1);
  renegotiationUnsupportedRef.current = false;
  negotiationReadyRef.current = true;
  debugCallMedia("remote-description-set", {
    callId,
    kind: "initial-answer",
    supportsRenegotiationV1: supportsPeerRenegotiationV1Ref.current,
  });
  await addQueuedInitialAnswerIceCandidates(pc, callId, pendingIceCandidatesRef);
  return true;
}

async function configureInitialAnswerFrameCrypto({
  callId,
  callSecurityMode,
  configureDirectCallFrameCrypto,
  isCurrentActiveCallContext,
  negotiatedMediaEncryptionMode,
  pc,
  peerDeviceId,
  peerUserId,
  pushNotice,
  resetCallStateIfCurrent,
  t,
}: Pick<
  UseDirectCallNegotiationRuntimeOptions,
  | "callSecurityMode"
  | "configureDirectCallFrameCrypto"
  | "isCurrentActiveCallContext"
  | "pushNotice"
  | "resetCallStateIfCurrent"
  | "t"
> & {
  readonly callId: string;
  readonly negotiatedMediaEncryptionMode: DirectCallMediaEncryptionMode;
  readonly pc: RTCPeerConnection;
  readonly peerDeviceId: string | null;
  readonly peerUserId: string;
}): Promise<DirectCallMediaEncryptionMode | null> {
  let resolvedMediaEncryptionMode: DirectCallMediaEncryptionMode = negotiatedMediaEncryptionMode;
  let frameCryptoReady = await configureDirectCallFrameCrypto({
    callId,
    mediaEncryptionMode: resolvedMediaEncryptionMode,
    peerUserId,
    peerDeviceId,
  });
  if (!isCurrentActiveCallContext(callId, pc)) return null;
  if (frameCryptoReady) return resolvedMediaEncryptionMode;

  if (negotiatedMediaEncryptionMode !== "frame-v1" || callSecurityMode === "strict") {
    resetCallStateIfCurrent(callId, { sendHangup: true, notice: { kind: "error", message: t("call.error.unableStart") } }, pc);
    return null;
  }

  resolvedMediaEncryptionMode = "transport";
  frameCryptoReady = await configureDirectCallFrameCrypto({
    callId,
    mediaEncryptionMode: resolvedMediaEncryptionMode,
    peerUserId,
    peerDeviceId,
  });
  if (!isCurrentActiveCallContext(callId, pc)) return null;
  if (!frameCryptoReady) {
    resetCallStateIfCurrent(callId, { sendHangup: true, notice: { kind: "error", message: t("call.error.unableStart") } }, pc);
    return null;
  }
  pushNotice({ kind: "info", message: t("callSecurity.frameFallbackTransport") });
  return resolvedMediaEncryptionMode;
}

export function useDirectCallNegotiationRuntime({
  activeRef,
  peerConnectionRef,
  supportsPeerRenegotiationV1Ref,
  renegotiationUnsupportedRef,
  pendingRenegotiationReasonRef,
  makingOfferRef,
  ignoreOfferRef,
  isSettingRemoteAnswerPendingRef,
  renegotiationRevisionRef,
  lastAppliedRemoteRenegotiationRevisionRef,
  pendingLocalRenegotiationRevisionRef,
  directCallNegotiationRoleRef,
  negotiationReadyRef,
  lastRenegotiationAttemptRef,
  lastSignalingErrorRef,
  outboundMediaEncryptionOfferRef,
  pendingIceCandidatesRef,
  setActive,
  callSecurityMode,
  debugCallMedia,
  recordLastRenegotiationAttempt,
  shouldIgnoreUnexpectedPeerSignal,
  isCurrentActiveCallContext,
  resetCallState,
  resetCallStateIfCurrent,
  syncVisualTransceiverBindings,
  syncVisualTransceiverDirections,
  syncOutgoingVisualMediaStateTrackBindings,
  refreshRemoteVideoTracksFromPeer,
  configureDirectCallFrameCrypto,
  setPeerEphemeralPublicKey,
  applySignalVerificationResult,
  applyCallSecurityState,
  setActiveIfCurrent,
  pushNotice,
  t,
}: UseDirectCallNegotiationRuntimeOptions) {
  const pendingOutboundRenegotiationOfferRef = useRef<PendingRenegotiationOfferDispatch | null>(null);
  const pendingOutboundRenegotiationAnswerRef = useRef<PendingRenegotiationAnswerDispatch | null>(null);
  const { dispatchPendingRenegotiationOffer, dispatchPendingRenegotiationAnswer } = useMemo(
    () => createNegotiationDispatch({
      callbacks: {
        isCurrentActiveCallContext,
        pendingRenegotiationReasonRef,
        lastSignalingErrorRef,
        debugCallMedia,
        recordLastRenegotiationAttempt,
      },
      state: {
        pendingOutboundRenegotiationOfferRef,
        pendingOutboundRenegotiationAnswerRef,
        peerConnectionRef,
      },
    }),
    [
      debugCallMedia,
      isCurrentActiveCallContext,
      lastSignalingErrorRef,
      peerConnectionRef,
      pendingRenegotiationReasonRef,
      recordLastRenegotiationAttempt,
    ]
  );

  const sendRenegotiationOffer = useCallback(async (callId: string, reason: string) => {
    const pc = peerConnectionRef.current;
    const currentActive = activeRef.current;
    if (!pc || currentActive?.callId !== callId) return;
    if (renegotiationUnsupportedRef.current) return;

    const deferOffer = (blockedBy: string) => {
      pendingRenegotiationReasonRef.current = reason;
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "deferred",
        blockedBy,
        signalingState: pc.signalingState,
      });
      debugCallMedia("renegotiation-offer-deferred", {
        callId,
        reason,
        blockedBy,
        negotiationReady: negotiationReadyRef.current,
        peerUserId: currentActive.peerUserId,
        peerDeviceId: currentActive.peerDeviceId,
        signalingState: pc.signalingState,
        makingOffer: makingOfferRef.current,
      });
    };

    if (!negotiationReadyRef.current) {
      deferOffer("negotiation-not-ready");
      return;
    }
    if (!currentActive.peerUserId) {
      deferOffer("peer-target-unresolved");
      return;
    }
    if (makingOfferRef.current) {
      deferOffer("making-offer");
      return;
    }
    if (pc.signalingState !== "stable") {
      deferOffer("signaling-not-stable");
      return;
    }

    makingOfferRef.current = true;
    try {
      pendingRenegotiationReasonRef.current = null;
      syncVisualTransceiverDirections(callId);
      const nextRevision = renegotiationRevisionRef.current + 1;
      lastSignalingErrorRef.current = null;
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "creating",
        revision: nextRevision,
        signalingState: pc.signalingState,
      });
      debugCallMedia("renegotiation-offer-created", {
        callId,
        reason,
        revision: nextRevision,
        signalingState: pc.signalingState,
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      syncOutgoingVisualMediaStateTrackBindings(callId);
      renegotiationRevisionRef.current = nextRevision;
      pendingLocalRenegotiationRevisionRef.current = nextRevision;
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "local-description-set",
        revision: nextRevision,
        descriptionType: pc.localDescription?.type ?? offer.type,
      });
      debugCallMedia("local-description-set", {
        callId,
        kind: "renegotiation-offer",
        revision: nextRevision,
        type: pc.localDescription?.type ?? offer.type,
      });
      if (!offer.sdp) {
        recordLastRenegotiationAttempt({
          callId,
          kind: "offer",
          reason,
          stage: "failed",
          error: "empty-sdp",
          revision: nextRevision,
        });
        logger.warn("[CALL] renegotiation offer aborted: createOffer returned empty SDP", { callId, revision: nextRevision });
        pendingLocalRenegotiationRevisionRef.current = null;
        return;
      }
      const auth = await createSignedCallRenegotiationOfferAuth({
        callId,
        revision: nextRevision,
        recipientUserId: currentActive.peerUserId,
        sdp: offer.sdp,
      });
      if (!auth) {
        recordLastRenegotiationAttempt({
          callId,
          kind: "offer",
          reason,
          stage: "failed",
          error: "signing-failed",
          revision: nextRevision,
        });
        logger.warn("[CALL] renegotiation offer aborted: failed to sign auth proof", { callId, revision: nextRevision });
        pendingLocalRenegotiationRevisionRef.current = null;
        return;
      }
      if (!isCurrentActiveCallContext(callId, pc)) {
        recordLastRenegotiationAttempt({
          callId,
          kind: "offer",
          reason,
          stage: "aborted-stale",
          revision: nextRevision,
        });
        debugCallMedia("renegotiation-offer-aborted-stale", {
          callId,
          reason,
          revision: nextRevision,
        });
        pendingLocalRenegotiationRevisionRef.current = null;
        return;
      }
      const pendingOffer: PendingRenegotiationOfferDispatch = {
        callId,
        reason,
        revision: nextRevision,
        message: {
          type: "call.renegotiate.offer",
          callId,
          revision: nextRevision,
          sdp: offer.sdp,
          auth,
        },
      };
      dispatchPendingRenegotiationOffer(pendingOffer, "created");
    } catch (error) {
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn("[CALL] failed to send renegotiation offer", error);
    } finally {
      makingOfferRef.current = false;
    }
  }, [
    activeRef,
    debugCallMedia,
    isCurrentActiveCallContext,
    lastSignalingErrorRef,
    makingOfferRef,
    negotiationReadyRef,
    peerConnectionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingRenegotiationReasonRef,
    recordLastRenegotiationAttempt,
    renegotiationRevisionRef,
    renegotiationUnsupportedRef,
    dispatchPendingRenegotiationOffer,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverDirections,
  ]);

  const flushPendingRenegotiationOffer = useCallback(async (callId: string, trigger: string) => {
    const pendingOffer = pendingOutboundRenegotiationOfferRef.current;
    if (pendingOffer?.callId === callId) {
      debugCallMedia("renegotiation-offer-resend", {
        callId,
        trigger,
        revision: pendingOffer.revision,
        reason: pendingOffer.reason,
      });
      dispatchPendingRenegotiationOffer(pendingOffer, trigger);
      return;
    }
    const pendingReason = pendingRenegotiationReasonRef.current;
    if (!pendingReason) return;
    debugCallMedia("renegotiation-offer-flush", { callId, trigger, pendingReason });
    await sendRenegotiationOffer(callId, pendingReason);
  }, [
    debugCallMedia,
    dispatchPendingRenegotiationOffer,
    pendingOutboundRenegotiationOfferRef,
    pendingRenegotiationReasonRef,
    sendRenegotiationOffer,
  ]);

  const flushPendingRenegotiationAnswer = useCallback((callId: string, trigger: string) => {
    const pendingAnswer = pendingOutboundRenegotiationAnswerRef.current;
    if (pendingAnswer?.callId !== callId) return;
    debugCallMedia("renegotiation-answer-resend", {
      callId,
      trigger,
      revision: pendingAnswer.revision,
    });
    dispatchPendingRenegotiationAnswer(pendingAnswer, trigger);
  }, [
    debugCallMedia,
    dispatchPendingRenegotiationAnswer,
    pendingOutboundRenegotiationAnswerRef,
  ]);

  useEffect(() => wsClient.onConnectionChange((connected) => {
    if (!connected) return;
    const currentActive = activeRef.current;
    if (!currentActive?.callId) return;
    flushPendingRenegotiationAnswer(currentActive.callId, "ws-reconnected");
    flushPendingRenegotiationOffer(currentActive.callId, "ws-reconnected");
  }), [
    activeRef,
    flushPendingRenegotiationAnswer,
    flushPendingRenegotiationOffer,
  ]);

  const {
    handleIncomingRenegotiationAnswer,
    handleIncomingRenegotiationOffer,
  } = useDirectCallRenegotiationHandlers({
    activeRef,
    applyCallSecurityState,
    applySignalVerificationResult,
    callSecurityMode,
    debugCallMedia,
    isCurrentActiveCallContext,
    isSettingRemoteAnswerPendingRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    peerConnectionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingOutboundRenegotiationOfferRef,
    pendingRenegotiationReasonRef,
    pushNotice,
    recordLastRenegotiationAttempt,
    resetCallStateIfCurrent,
    setActive,
    shouldIgnoreUnexpectedPeerSignal,
    supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef,
    makingOfferRef,
    ignoreOfferRef,
    directCallNegotiationRoleRef,
    dispatchPendingRenegotiationAnswer,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
    refreshRemoteVideoTracksFromPeer,
  });

  const handleRemoteAnswer = useCallback(async (
    message: IncomingCallAnsweredSignal
  ) => {
    const runtimeContext = resolveInitialAnswerRuntimeContext({ activeRef, peerConnectionRef });
    if (!runtimeContext) {
      debugCallMedia("initial-answer-ignored-missing-runtime", {
        callId: message.callId,
        activeCallId: activeRef.current?.callId ?? null,
        hasPeerConnection: Boolean(peerConnectionRef.current),
      });
      return;
    }
    const { pc, currentActive, callId } = runtimeContext;

    debugCallMedia("initial-answer-handle-start", {
      callId: message.callId,
      activeCallId: callId,
      answererUserId: message.answererUserId ?? null,
      answererDeviceId: message.answererDeviceId ?? null,
      offeredMediaEncryption: outboundMediaEncryptionOfferRef.current?.preferredMode
        ?? resolveLegacyDirectCallMediaEncryptionOffer().preferredMode,
      answeredMediaEncryption: message.mediaEncryption?.selectedMode ?? "transport",
    });
    if (shouldIgnoreUnexpectedPeerSignal({
      callId: message.callId,
      signalType: "call.answered",
      senderUserId: message.answererUserId ?? null,
      senderDeviceId: message.answererDeviceId ?? null,
    })) {
      debugCallMedia("initial-answer-ignored-unexpected-sender", {
        callId: message.callId,
        answererUserId: message.answererUserId ?? null,
        answererDeviceId: message.answererDeviceId ?? null,
        expectedPeerUserId: currentActive.peerUserId ?? null,
        expectedPeerDeviceId: currentActive.peerDeviceId ?? null,
      });
      return;
    }
    if (pc.remoteDescription?.type === "answer") {
      // Duplicate initial answers can arrive after reconnect or retry paths.
      // Once the answer is already applied, replaying it only risks state errors.
      debugCallMedia("initial-answer-ignored-duplicate", {
        callId: message.callId,
        answererUserId: message.answererUserId ?? null,
        answererDeviceId: message.answererDeviceId ?? null,
      });
      return;
    }
    const {
      answerMediaEncryption,
      negotiatedMediaEncryptionMode,
      offerMediaEncryption,
    } = resolveInitialAnswerMediaNegotiation(
      message,
      outboundMediaEncryptionOfferRef.current
    );
    if (!negotiatedMediaEncryptionMode || answerMediaEncryption.selectedMode !== negotiatedMediaEncryptionMode) {
      debugCallMedia("initial-answer-rejected-media-encryption", {
        callId: message.callId,
        offeredPreferredMode: offerMediaEncryption.preferredMode,
        offeredSupportedModes: offerMediaEncryption.supportedModes,
        answeredSelectedMode: answerMediaEncryption.selectedMode,
        answeredSupportedModes: answerMediaEncryption.supportedModes,
        negotiatedMediaEncryptionMode,
      });
      resetCallState({ sendHangup: true, notice: { kind: "error", message: t("call.error.unableStart") } });
      return;
    }
    if (callSecurityMode === "strict" && negotiatedMediaEncryptionMode !== "frame-v1") {
      debugCallMedia("initial-answer-rejected-strict-mode", { callId: message.callId, negotiatedMediaEncryptionMode });
      resetCallState({ sendHangup: true, notice: { kind: "error", message: t("call.error.unableStart") } });
      return;
    }
    const verificationApplied = await applyInitialAnswerVerification({
      applySignalVerificationResult,
      callId,
      callSecurityMode,
      debugCallMedia,
      isCurrentActiveCallContext,
      message,
      pc,
      pushNotice,
      resetCallStateIfCurrent,
      t,
    });
    if (!verificationApplied) {
      return;
    }

    const remoteDescriptionApplied = await applyInitialRemoteDescription({
      callId,
      debugCallMedia,
      isCurrentActiveCallContext,
      message,
      negotiationReadyRef,
      pc,
      pendingIceCandidatesRef,
      refreshRemoteVideoTracksFromPeer,
      renegotiationUnsupportedRef,
      supportsPeerRenegotiationV1Ref,
      syncVisualTransceiverBindings,
    });
    if (!remoteDescriptionApplied) {
      return;
    }

    const { peerUserId, peerDeviceId } = resolveInitialAnswerPeerIdentity(message, currentActive);
    if (!peerUserId) {
      resetCallStateIfCurrent(callId, { sendHangup: true, notice: { kind: "error", message: t("call.error.unableStart") } }, pc);
      return;
    }
    // Register the callee's ephemeral public key so configureDirectCallFrameCrypto
    // can perform forward-secure key derivation for this call.
    setPeerEphemeralPublicKey(callId, message.mediaEncryption?.ephemeralPublicKey);

    const resolvedMediaEncryptionMode = await configureInitialAnswerFrameCrypto({
      callId,
      callSecurityMode,
      configureDirectCallFrameCrypto,
      isCurrentActiveCallContext,
      negotiatedMediaEncryptionMode,
      pc,
      peerDeviceId,
      peerUserId,
      pushNotice,
      resetCallStateIfCurrent,
      t,
    });
    if (!resolvedMediaEncryptionMode) {
      return;
    }

    await applyCallSecurityState(callId, pc);
    if (!isCurrentActiveCallContext(callId, pc)) {
      return;
    }
    setActiveIfCurrent(callId, (prev) => ({
      ...prev,
      state:
        prev.state === "active" || isPeerConnectionConnected(pc)
          ? "active"
          : "connecting",
      mediaEncryptionMode: resolvedMediaEncryptionMode,
      peerDeviceId,
      peerSupportsRenegotiationV1: !!(message.features?.renegotiationV1),
    }));
    if (!isCurrentActiveCallContext(callId, pc)) {
      return;
    }
    await flushPendingRenegotiationOffer(callId, "remote-answer");
  }, [
    activeRef,
    applyCallSecurityState,
    applySignalVerificationResult,
    callSecurityMode,
    configureDirectCallFrameCrypto,
    setPeerEphemeralPublicKey,
    debugCallMedia,
    flushPendingRenegotiationOffer,
    isCurrentActiveCallContext,
    negotiationReadyRef,
    outboundMediaEncryptionOfferRef,
    peerConnectionRef,
    pendingIceCandidatesRef,
    pushNotice,
    refreshRemoteVideoTracksFromPeer,
    renegotiationUnsupportedRef,
    resetCallState,
    resetCallStateIfCurrent,
    setActiveIfCurrent,
    shouldIgnoreUnexpectedPeerSignal,
    supportsPeerRenegotiationV1Ref,
    syncVisualTransceiverBindings,
    t,
  ]);

  return {
    sendRenegotiationOffer,
    flushPendingRenegotiationOffer,
    handleIncomingRenegotiationAnswer,
    handleIncomingRenegotiationOffer,
    handleRemoteAnswer,
  };
}
