import type { MutableRefObject } from "react";
import type { CallSignalVerificationResult } from "@/calls/direct/runtime/crypto/call-auth-material";
import { verifyIncomingCallAnswer } from "@/calls/direct/runtime/crypto/call-auth-actions";
import {
  validateDirectCallMediaEncryptionAnswer,
  resolveLegacyDirectCallMediaEncryptionOffer,
  type DirectCallMediaEncryptionMode,
  type DirectCallMediaEncryptionOffer,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import type { CallSecurityMode } from "@/ui-settings";
import type {
  ActiveCall,
  CallNotice,
  IncomingCallAnsweredSignal,
} from "@/calls/direct/model/direct-call-types";
import { logger } from "@/lib/logger.js";
import type {
  DirectCallPushNotice,
  DirectCallTranslate,
} from "./direct-call-runtime-types";

type InitialAnswerMediaEncryption = NonNullable<
  IncomingCallAnsweredSignal["mediaEncryption"]
>;

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

interface DirectCallInitialAnswerRuntimeOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  negotiationReadyRef: MutableRefObject<boolean>;
  outboundMediaEncryptionOfferRef: MutableRefObject<DirectCallMediaEncryptionOffer | null>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  callSecurityMode: CallSecurityMode;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  shouldIgnoreUnexpectedPeerSignal: (params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => boolean;
  isCurrentActiveCallContext: (
    callId: string,
    pc?: RTCPeerConnection | null
  ) => boolean;
  resetCallState: (opts?: { sendHangup?: boolean; notice?: CallNotice }) => void;
  resetCallStateIfCurrent: (
    callId: string,
    opts?: { sendHangup?: boolean; notice?: CallNotice },
    pc?: RTCPeerConnection | null
  ) => boolean;
  syncVisualTransceiverBindings: () => void;
  refreshRemoteVideoTracksFromPeer: (
    callIdOverride?: string,
    reason?: string
  ) => void;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: DirectCallMediaEncryptionMode;
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  setPeerEphemeralPublicKey: (
    callId: string,
    pubKeyBase64: string | null | undefined
  ) => void;
  applySignalVerificationResult: (
    callId: string,
    result: CallSignalVerificationResult
  ) => void;
  applyCallSecurityState: (
    callId: string,
    pc: RTCPeerConnection
  ) => Promise<void>;
  setActiveIfCurrent: (
    callId: string,
    update: (current: ActiveCall) => ActiveCall
  ) => void;
  pushNotice: DirectCallPushNotice;
  t: DirectCallTranslate;
  flushPendingRenegotiationOffer: (
    callId: string,
    trigger: string
  ) => Promise<void>;
}

export interface DirectCallInitialAnswerRuntime {
  handleRemoteAnswer: (message: IncomingCallAnsweredSignal) => Promise<void>;
}

function resolveInitialAnswerRuntimeContext({
  activeRef,
  peerConnectionRef,
}: Pick<
  DirectCallInitialAnswerRuntimeOptions,
  "activeRef" | "peerConnectionRef"
>): InitialAnswerRuntimeContext | null {
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
  const offerMediaEncryption =
    outboundOffer ?? resolveLegacyDirectCallMediaEncryptionOffer();
  const answerMediaEncryption = message.mediaEncryption ?? {
    selectedMode: "transport",
    supportedModes: ["transport"] as const,
  };
  const negotiatedMediaEncryptionMode = validateDirectCallMediaEncryptionAnswer(
    offerMediaEncryption,
    answerMediaEncryption
  );
  return {
    offerMediaEncryption,
    answerMediaEncryption,
    negotiatedMediaEncryptionMode,
  };
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
  DirectCallInitialAnswerRuntimeOptions,
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
  debugCallMedia("initial-answer-verification-result", {
    callId: message.callId,
    state: verification.state,
  });
  if (!isCurrentActiveCallContext(callId, pc)) {
    debugCallMedia("initial-answer-aborted-stale-after-verification", {
      callId: message.callId,
    });
    return false;
  }
  if (verification.state !== "invalid") {
    applySignalVerificationResult(callId, verification);
    return true;
  }
  if (callSecurityMode === "strict") {
    resetCallStateIfCurrent(
      callId,
      {
        sendHangup: true,
        notice: { kind: "error", message: t("call.error.unableVerifyCode") },
      },
      pc
    );
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
  DirectCallInitialAnswerRuntimeOptions,
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
  debugCallMedia("remote-description-applying", {
    callId,
    kind: "initial-answer",
  });
  await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
  if (!isCurrentActiveCallContext(callId, pc)) return false;

  syncVisualTransceiverBindings();
  refreshRemoteVideoTracksFromPeer(callId, "initial-answer");
  supportsPeerRenegotiationV1Ref.current = !!message.features?.renegotiationV1;
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
  DirectCallInitialAnswerRuntimeOptions,
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
  let resolvedMediaEncryptionMode = negotiatedMediaEncryptionMode;
  let frameCryptoReady = await configureDirectCallFrameCrypto({
    callId,
    mediaEncryptionMode: resolvedMediaEncryptionMode,
    peerUserId,
    peerDeviceId,
  });
  if (!isCurrentActiveCallContext(callId, pc)) return null;
  if (frameCryptoReady) return resolvedMediaEncryptionMode;

  if (
    negotiatedMediaEncryptionMode !== "frame-v1" ||
    callSecurityMode === "strict"
  ) {
    resetCallStateIfCurrent(
      callId,
      { sendHangup: true, notice: { kind: "error", message: t("call.error.unableStart") } },
      pc
    );
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
    resetCallStateIfCurrent(
      callId,
      { sendHangup: true, notice: { kind: "error", message: t("call.error.unableStart") } },
      pc
    );
    return null;
  }
  pushNotice({ kind: "info", message: t("callSecurity.frameFallbackTransport") });
  return resolvedMediaEncryptionMode;
}

/**
 * Owns the initial-answer negotiation phase only: sender filtering, media
 * encryption validation, verification, remote answer apply, queued ICE flush,
 * frame-crypto setup, and final active-call patch before renegotiation starts.
 */
export function createDirectCallInitialAnswerRuntime(
  options: DirectCallInitialAnswerRuntimeOptions
): DirectCallInitialAnswerRuntime {
  const {
    activeRef,
    peerConnectionRef,
    supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef,
    negotiationReadyRef,
    outboundMediaEncryptionOfferRef,
    pendingIceCandidatesRef,
    callSecurityMode,
    debugCallMedia,
    shouldIgnoreUnexpectedPeerSignal,
    isCurrentActiveCallContext,
    resetCallState,
    resetCallStateIfCurrent,
    syncVisualTransceiverBindings,
    refreshRemoteVideoTracksFromPeer,
    configureDirectCallFrameCrypto,
    setPeerEphemeralPublicKey,
    applySignalVerificationResult,
    applyCallSecurityState,
    setActiveIfCurrent,
    pushNotice,
    t,
    flushPendingRenegotiationOffer,
  } = options;

  async function handleRemoteAnswer(
    message: IncomingCallAnsweredSignal
  ): Promise<void> {
    const runtimeContext = resolveInitialAnswerRuntimeContext({
      activeRef,
      peerConnectionRef,
    });
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
      offeredMediaEncryption:
        outboundMediaEncryptionOfferRef.current?.preferredMode ??
        resolveLegacyDirectCallMediaEncryptionOffer().preferredMode,
      answeredMediaEncryption:
        message.mediaEncryption?.selectedMode ?? "transport",
    });
    if (
      shouldIgnoreUnexpectedPeerSignal({
        callId: message.callId,
        signalType: "call.answered",
        senderUserId: message.answererUserId ?? null,
        senderDeviceId: message.answererDeviceId ?? null,
      })
    ) {
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
    if (
      !negotiatedMediaEncryptionMode ||
      answerMediaEncryption.selectedMode !== negotiatedMediaEncryptionMode
    ) {
      debugCallMedia("initial-answer-rejected-media-encryption", {
        callId: message.callId,
        offeredPreferredMode: offerMediaEncryption.preferredMode,
        offeredSupportedModes: offerMediaEncryption.supportedModes,
        answeredSelectedMode: answerMediaEncryption.selectedMode,
        answeredSupportedModes: answerMediaEncryption.supportedModes,
        negotiatedMediaEncryptionMode,
      });
      resetCallState({
        sendHangup: true,
        notice: { kind: "error", message: t("call.error.unableStart") },
      });
      return;
    }
    if (
      callSecurityMode === "strict" &&
      negotiatedMediaEncryptionMode !== "frame-v1"
    ) {
      debugCallMedia("initial-answer-rejected-strict-mode", {
        callId: message.callId,
        negotiatedMediaEncryptionMode,
      });
      resetCallState({
        sendHangup: true,
        notice: { kind: "error", message: t("call.error.unableStart") },
      });
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

    const { peerUserId, peerDeviceId } = resolveInitialAnswerPeerIdentity(
      message,
      currentActive
    );
    if (!peerUserId) {
      resetCallStateIfCurrent(
        callId,
        {
          sendHangup: true,
          notice: { kind: "error", message: t("call.error.unableStart") },
        },
        pc
      );
      return;
    }
    setPeerEphemeralPublicKey(
      callId,
      message.mediaEncryption?.ephemeralPublicKey
    );

    const resolvedMediaEncryptionMode =
      await configureInitialAnswerFrameCrypto({
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
      peerSupportsRenegotiationV1: !!message.features?.renegotiationV1,
    }));
    if (!isCurrentActiveCallContext(callId, pc)) {
      return;
    }
    await flushPendingRenegotiationOffer(callId, "remote-answer");
  }

  return {
    handleRemoteAnswer,
  };
}
