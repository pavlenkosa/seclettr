/**
 * Outbound call setup flow — extracted from useDirectCallSetup.
 *
 * runStartCallFlow is a pure async function; it has no React hook dependencies.
 * All side-effect surfaces are injected via StartCallFlowOptions.
 */

import { api } from "@/lib/api";
import { logger } from "@/lib/logger.js";
import { createSignedCallOfferAuth } from "@/calls/direct/runtime/crypto/call-auth-actions";
import {
  DIRECT_CALL_SETUP_TIMEOUTS,
  withSetupStageTimeout,
} from "@/calls/direct/model/direct-call-setup-timeouts";
import { wsClient } from "@/lib/websocket";
import {
  buildDirectCallMediaEncryptionOffer,
  resolveLegacyDirectCallMediaEncryptionOffer,
  type DirectCallMediaEncryptionOffer,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import {
  beginDirectCallLifecycleToken,
  isCurrentDirectCallLifecycleToken,
} from "@/calls/direct/model/direct-call-lifecycle";
import { toMediaErrorMessage } from "@/calls/direct/model/direct-call-ui-utils";
import {
  DIRECT_CALL_FEATURES,
  type ActiveCall,
  type CallType,
} from "@/calls/direct/model/direct-call-types";
import {
  type DirectCallSetupRuntimeOptions,
  resetNegotiationSessionState,
} from "./direct-call-setup-shared";
import {
  isDirectCallLifecycleAbortError,
  createLifecycleGuard,
  stopMediaStream,
} from "./call-setup-utils";

/** Outgoing calls that go unanswered are automatically cancelled after this interval. */
const OUTGOING_CALL_RINGING_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Local helpers (start-flow only)
// ---------------------------------------------------------------------------

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
}): DirectCallMediaEncryptionOffer => {
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
  outgoingRingingTimeoutRef: DirectCallSetupRuntimeOptions["outgoingRingingTimeoutRef"];
  activeRef: DirectCallSetupRuntimeOptions["activeRef"];
  callId: string;
  finishCallSession: DirectCallSetupRuntimeOptions["finishCallSession"];
  recordCallEvent: DirectCallSetupRuntimeOptions["recordCallEvent"];
  callChatKindRef: DirectCallSetupRuntimeOptions["callChatKindRef"];
  resolvePeerLabel: DirectCallSetupRuntimeOptions["resolvePeerLabel"];
  peerUserId: string;
  peerLabel?: string;
  callType: CallType;
  t: DirectCallSetupRuntimeOptions["t"];
}) => {
  params.outgoingRingingTimeoutRef.current = setTimeout(() => {
    params.outgoingRingingTimeoutRef.current = null;
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
          chatKind: params.callChatKindRef.current ?? undefined,
        });
      },
    });
  }, OUTGOING_CALL_RINGING_TIMEOUT_MS);
};

// ---------------------------------------------------------------------------
// StartCallFlowOptions
// ---------------------------------------------------------------------------

export interface StartCallFlowOptions
  extends Pick<
    DirectCallSetupRuntimeOptions,
    // Session
    | "activeRef"
    | "incomingRef"
    | "directCallLifecycleTokenRef"
    | "outgoingRingingTimeoutRef"
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
    | "outboundMediaEncryptionOfferRef"
    // Transport
    | "peerConnectionRef"
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
    | "primeDirectCallSenderFrameCrypto"
    | "closeDirectCallFrameCrypto"
    | "prepareLocalEphemeralKey"
    // Callbacks
    | "clearNotice"
    | "ensureConversationUsername"
    | "resolvePeerLabel"
    | "pushNotice"
    | "callChatKindRef"
    | "debugCallMedia"
    | "finishCallSession"
    | "recordCallEvent"
    | "t"
  > {
  chatKind?: "plain" | "e2ee";
}

// ---------------------------------------------------------------------------
// runStartCallFlow
// ---------------------------------------------------------------------------

export async function runStartCallFlow(
  peerUserId: string,
  callType: CallType,
  peerLabel: string | undefined,
  options: StartCallFlowOptions
): Promise<void> {
  const {
    activeRef,
    incomingRef,
    directCallLifecycleTokenRef,
    outgoingRingingTimeoutRef,
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
    outboundMediaEncryptionOfferRef,
    peerConnectionRef,
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
    primeDirectCallSenderFrameCrypto,
    closeDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    clearNotice,
    ensureConversationUsername,
    resolvePeerLabel,
    pushNotice,
    callChatKindRef,
    chatKind,
    debugCallMedia,
    finishCallSession,
    recordCallEvent,
    t,
  } = options;

  if (activeRef.current || incomingRef.current) {
    return;
  }
  if (outgoingRingingTimeoutRef.current !== null) {
    clearTimeout(outgoingRingingTimeoutRef.current);
    outgoingRingingTimeoutRef.current = null;
  }
  callChatKindRef.current = chatKind ?? null;
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
      debugCallMedia("initial-offer-aborted-stale", { callId: callId! });
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
      outgoingRingingTimeoutRef,
      activeRef,
      callId,
      finishCallSession,
      recordCallEvent,
      callChatKindRef,
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
      chatKind: callChatKindRef.current ?? undefined,
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
    }).catch((err) => {
      logger.warn("[CALL] failed to resolve peer label for outgoing call", err);
    });
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
}
