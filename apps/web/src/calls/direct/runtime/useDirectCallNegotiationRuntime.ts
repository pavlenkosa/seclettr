/**
 * useDirectCallNegotiationRuntime — negotiation orchestrator for 1:1 calls.
 *
 * Composes the four negotiation sub-runtimes into a unified API:
 *   - createDirectCallInitialAnswerRuntime   → handleRemoteAnswer (initial offer/answer)
 *   - createDirectCallOutgoingNegotiationRuntime → sendRenegotiationOffer
 *   - useDirectCallPendingNegotiationRuntime → flushPendingRenegotiationOffer (ws reconnect)
 *   - useDirectCallRenegotiationHandlers     → handleIncomingRenegotiationOffer / Answer
 *
 * Also wires the negotiation dispatch layer (createNegotiationDispatch) that
 * buffers outbound offers/answers until the WebSocket is ready.
 *
 * The only refs owned here are the two pending dispatch refs
 * (pendingOutboundRenegotiationOfferRef / AnswerRef) — all other refs are
 * threaded in from useDirectCallControllerState via the controller.
 */
import {
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { CallSignalVerificationResult } from "@/calls/direct/runtime/crypto/call-auth-material";
import {
  type DirectCallMediaEncryptionMode,
  type DirectCallMediaEncryptionOffer,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import type { CallSecurityMode } from "@/ui-settings";
import { type DirectCallNegotiationRole } from "@/calls/direct/model/direct-call-lifecycle";
import type {
  ActiveCall,
  CallNotice,
} from "@/calls/direct/model/direct-call-types";
import {
  createNegotiationDispatch,
  type PendingRenegotiationAnswerDispatch,
  type PendingRenegotiationOfferDispatch,
} from "@/calls/direct/runtime/direct-call-negotiation-dispatch";
import { createDirectCallInitialAnswerRuntime } from "./useDirectCallInitialAnswerRuntime";
import { createDirectCallOutgoingNegotiationRuntime } from "./useDirectCallOutgoingNegotiationRuntime";
import { useDirectCallPendingNegotiationRuntime } from "./useDirectCallPendingNegotiationRuntime";
import { useDirectCallRenegotiationHandlers } from "./useDirectCallRenegotiationHandlers";
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

  const { sendRenegotiationOffer } = useMemo(
    () =>
      createDirectCallOutgoingNegotiationRuntime({
        activeRef,
        peerConnectionRef,
        renegotiationUnsupportedRef,
        pendingRenegotiationReasonRef,
        makingOfferRef,
        renegotiationRevisionRef,
        pendingLocalRenegotiationRevisionRef,
        negotiationReadyRef,
        lastSignalingErrorRef,
        debugCallMedia,
        recordLastRenegotiationAttempt,
        isCurrentActiveCallContext,
        syncVisualTransceiverDirections,
        syncOutgoingVisualMediaStateTrackBindings,
        dispatchPendingRenegotiationOffer,
      }),
    [
      activeRef,
      debugCallMedia,
      dispatchPendingRenegotiationOffer,
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
      syncOutgoingVisualMediaStateTrackBindings,
      syncVisualTransceiverDirections,
    ]
  );

  const { flushPendingRenegotiationOffer } =
    useDirectCallPendingNegotiationRuntime({
      activeRef,
      pendingOutboundRenegotiationOfferRef,
      pendingOutboundRenegotiationAnswerRef,
      pendingRenegotiationReasonRef,
      debugCallMedia,
      dispatchPendingRenegotiationOffer,
      dispatchPendingRenegotiationAnswer,
      sendRenegotiationOffer,
    });

  const { handleRemoteAnswer } = useMemo(
    () =>
      createDirectCallInitialAnswerRuntime({
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
      }),
    [
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
    ]
  );

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

  return {
    sendRenegotiationOffer,
    flushPendingRenegotiationOffer,
    handleIncomingRenegotiationAnswer,
    handleIncomingRenegotiationOffer,
    handleRemoteAnswer,
  };
}
