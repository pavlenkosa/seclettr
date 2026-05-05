import {
  useCallback,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { logger } from "@/lib/logger.js";
import { type GroupCallFrameCryptoHandle } from "@/calls/shared/crypto/frame-crypto";
import { createEmptyDirectCallSenderFrameHandles } from "@/calls/direct/runtime/direct-call-frame-crypto-runtime";

import {
  isCurrentDirectCallContext,
  resolveExpectedDirectCallSignalSender,
  updateDirectCallIfCurrent,
} from "@/calls/direct/model/call-signal-guard";
import {
  type CallMediaSource,
  type LastIncomingMediaState,
} from "@/calls/direct/model/call-media-state";
import { readCallMediaDebugEnabled } from "@/calls/shared/media/call-media-debug";
import { useDirectCallSurfaceDragging } from "./useDirectCallSurfaceDragging";
import type { DirectCallNegotiationRole } from "@/calls/direct/model/direct-call-lifecycle";
import type { DirectCallMediaEncryptionOffer } from "@/calls/direct/model/call-media-encryption-negotiation";
import type {
  ActiveCall,
  CallNotice,
  DirectCallOutgoingIceBatchState,
  DirectCallFrameCryptoState,
  IncomingCall,
  RemoteInboundVideoProgress,
} from "@/calls/direct/model/direct-call-types";

declare global {
  interface Window {
    __scGetCallDebugSnapshot?: () => Promise<Record<string, unknown> | null>;
    __scDumpCallDebug?: () => Promise<void>;
    __scSetCallDebugEnabled?: (enabled: boolean) => void;
    __scIsCallDebugEnabled?: () => boolean;
  }
}

export function useDirectCallControllerState() {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [notice, setNotice] = useState<CallNotice | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSecurityCardOpen, setIsSecurityCardOpen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenPreviewRef = useRef<HTMLVideoElement>(null);
  const remoteCameraPlaybackRef = useRef<{ lastTime: number; lastFrameCount: number; lastProgressAt: number }>({
    lastTime: 0,
    lastFrameCount: 0,
    lastProgressAt: 0,
  });
  const remoteScreenPlaybackRef = useRef<{ lastTime: number; lastFrameCount: number; lastProgressAt: number }>({
    lastTime: 0,
    lastFrameCount: 0,
    lastProgressAt: 0,
  });
  const remoteInboundVideoProgressRef = useRef<Map<string, RemoteInboundVideoProgress>>(new Map());
  const callMediaStateSeqRef = useRef(0);
  const localMediaStateRevisionRef = useRef<Record<CallMediaSource, number>>({
    camera: 0,
    screen: 0,
    mic: 0,
  });
  const remoteMediaStateSeqRef = useRef<Record<CallMediaSource, number>>({
    camera: 0,
    screen: 0,
    mic: 0,
  });
  const remoteMediaStateRevisionRef = useRef<Record<CallMediaSource, number>>({
    camera: 0,
    screen: 0,
    mic: 0,
  });
  const lastIncomingMediaStateRef = useRef<Record<CallMediaSource, LastIncomingMediaState | null>>({
    camera: null,
    screen: null,
    mic: null,
  });
  const localPreviewShellRef = useRef<HTMLDivElement>(null);
  const localScreenPreviewShellRef = useRef<HTMLDivElement>(null);
  const minimizedDockRef = useRef<HTMLDialogElement>(null);
  const incomingOverlayRef = useRef<HTMLDivElement>(null);
  const activeOverlayRef = useRef<HTMLDialogElement>(null);
  const incomingAcceptButtonRef = useRef<HTMLButtonElement>(null);
  const incomingMinimizedAcceptButtonRef = useRef<HTMLButtonElement>(null);
  const incomingMinimizedSummaryRef = useRef<HTMLButtonElement>(null);
  const activeMinimizedSummaryRef = useRef<HTMLButtonElement>(null);
  const activeHangupButtonRef = useRef<HTMLButtonElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraSenderRef = useRef<RTCRtpSender | null>(null);
  const cameraTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const screenShareTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenShareSenderRef = useRef<RTCRtpSender | null>(null);
  const screenShareTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const localScreenPreviewStreamRef = useRef<MediaStream | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const incomingRingtoneRef = useRef<HTMLAudioElement | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const acceptingIncomingCallRef = useRef<IncomingCall | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const outboundMediaEncryptionOfferRef = useRef<DirectCallMediaEncryptionOffer | null>(null);
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const incomingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const outgoingIceBatchRef = useRef<DirectCallOutgoingIceBatchState>({
    callId: null,
    candidates: [],
    timer: null,
  });
  const directCallFrameCryptoStateRef = useRef<DirectCallFrameCryptoState | null>(null);
  const directCallSenderFrameHandlesRef = useRef(createEmptyDirectCallSenderFrameHandles());
  const directCallReceiverFrameHandlesRef = useRef<Map<RTCRtpReceiver, GroupCallFrameCryptoHandle>>(new Map());
  const frameModeRecoveryTimerRef = useRef<number | null>(null);
  const frameModeRecoveryAttemptedCallIdRef = useRef<string | null>(null);
  const directCallNegotiationRoleRef = useRef<DirectCallNegotiationRole>("impolite");
  const supportsPeerRenegotiationV1Ref = useRef(false);
  const sendRenegotiationOfferRef = useRef<((callId: string, reason: string) => Promise<void>) | null>(null);
  const flushPendingRenegotiationOfferRef = useRef<((callId: string, trigger: string) => Promise<void>) | null>(null);
  const negotiationReadyRef = useRef(false);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const isSettingRemoteAnswerPendingRef = useRef(false);
  const renegotiationRevisionRef = useRef(0);
  const lastAppliedRemoteRenegotiationRevisionRef = useRef(0);
  const pendingLocalRenegotiationRevisionRef = useRef<number | null>(null);
  const pendingRenegotiationReasonRef = useRef<string | null>(null);
  const renegotiationUnsupportedRef = useRef(false);
  const lastRenegotiationAttemptRef = useRef<Record<string, unknown> | null>(null);
  const lastSignalingErrorRef = useRef<Record<string, unknown> | null>(null);
  const disconnectResetTimerRef = useRef<number | null>(null);
  const disconnectRecoveryAttemptedRef = useRef(false);
  const directCallLifecycleTokenRef = useRef(0);
  const callMediaDebugEnabledRef = useRef(readCallMediaDebugEnabled());
  const syncOutgoingVisualMediaStateTrackBindingsRef = useRef<(callIdOverride?: string) => void>(() => {});
  const clearOutgoingMediaStateTrackBindingsRef = useRef<() => void>(() => {});
  const remoteVideoTrackRefreshTimerRef = useRef<number | null>(null);
  const refreshRemoteVideoTracksFromPeerRef = useRef<(callIdOverride?: string, reason?: string) => void>(() => {});

  const dragging = useDirectCallSurfaceDragging({
    isMinimized,
    minimizedDockRef,
    localPreviewShellRef,
    localScreenPreviewShellRef,
  });

  const commitIncomingState = useCallback((next: SetStateAction<IncomingCall | null>) => {
    const resolved = typeof next === "function"
      ? (next as (prev: IncomingCall | null) => IncomingCall | null)(incomingRef.current)
      : next;
    incomingRef.current = resolved;
    setIncoming(resolved);
  }, []);

  const commitActiveState = useCallback((next: SetStateAction<ActiveCall | null>) => {
    const resolved = typeof next === "function"
      ? (next as (prev: ActiveCall | null) => ActiveCall | null)(activeRef.current)
      : next;
    activeRef.current = resolved;
    setActive(resolved);
  }, []);

  const debugCallMedia = useCallback((event: string, payload: Record<string, unknown>) => {
    if (!import.meta.env.DEV || !callMediaDebugEnabledRef.current) {
      return;
    }
    logger.debug(`[CALL][${event}]`, payload);
  }, []);

  const recordLastRenegotiationAttempt = useCallback((payload: Record<string, unknown>) => {
    lastRenegotiationAttemptRef.current = {
      ...payload,
      at: new Date().toISOString(),
    };
  }, []);

  const shouldIgnoreUnexpectedPeerSignal = useCallback((params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => {
    const currentActive = activeRef.current;
    const expectation = resolveExpectedDirectCallSignalSender({
      active: currentActive,
      callId: params.callId,
      senderUserId: params.senderUserId,
      senderDeviceId: params.senderDeviceId,
    });
    if (expectation.ok || expectation.reason === "call_mismatch") {
      return false;
    }

    const errorPayload = {
      code: "UNEXPECTED_SIGNAL_SENDER",
      callId: params.callId,
      signalType: params.signalType,
      revision: params.revision ?? null,
      source: params.source ?? null,
      senderUserId: params.senderUserId ?? null,
      senderDeviceId: params.senderDeviceId ?? null,
      expectedPeerUserId: currentActive?.peerUserId ?? null,
      expectedPeerDeviceId: currentActive?.peerDeviceId ?? null,
      reason: expectation.reason,
    };
    lastSignalingErrorRef.current = {
      ...errorPayload,
      at: new Date().toISOString(),
    };
    debugCallMedia("unexpected-peer-signal-ignored", errorPayload);
    return true;
  }, [debugCallMedia]);

  const isCurrentActiveCallContext = useCallback((callId: string, pc?: RTCPeerConnection | null) => {
    return isCurrentDirectCallContext({
      activeCallId: activeRef.current?.callId,
      expectedCallId: callId,
      currentConnection: peerConnectionRef.current,
      expectedConnection: pc,
    });
  }, []);

  const setActiveIfCurrent = useCallback((
    callId: string,
    update: (current: ActiveCall) => ActiveCall
  ) => {
    commitActiveState((prev) => updateDirectCallIfCurrent(prev, callId, update));
  }, [commitActiveState]);

  // Keep mutable controller state grouped by real ownership domains.
  // The composition root still wires the same runtime hooks, but each hook can
  // now consume explicit state owners instead of one undifferentiated ref bag.
  const sessionState = {
    incoming,
    active,
    incomingRef,
    acceptingIncomingCallRef,
    activeRef,
    commitIncomingState,
    commitActiveState,
    isCurrentActiveCallContext,
    setActiveIfCurrent,
    directCallLifecycleTokenRef,
  };

  const presentationState = {
    notice,
    isMinimized,
    isSecurityCardOpen,
    setNotice,
    setIsMinimized,
    setIsSecurityCardOpen,
    localPreviewShellRef,
    localScreenPreviewShellRef,
    minimizedDockRef,
    incomingOverlayRef,
    activeOverlayRef,
    incomingAcceptButtonRef,
    incomingMinimizedAcceptButtonRef,
    incomingMinimizedSummaryRef,
    activeMinimizedSummaryRef,
    activeHangupButtonRef,
    noticeTimerRef,
    incomingRingtoneRef,
    ...dragging,
  };

  const mediaState = {
    localVideoRef,
    localScreenPreviewRef,
    remoteCameraPlaybackRef,
    remoteScreenPlaybackRef,
    remoteInboundVideoProgressRef,
    callMediaStateSeqRef,
    localMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteMediaStateRevisionRef,
    lastIncomingMediaStateRef,
    localStreamRef,
    cameraSenderRef,
    cameraTransceiverRef,
    screenShareTrackRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
    localScreenPreviewStreamRef,
    directCallFrameCryptoStateRef,
    directCallSenderFrameHandlesRef,
    directCallReceiverFrameHandlesRef,
    frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
    syncOutgoingVisualMediaStateTrackBindingsRef,
    clearOutgoingMediaStateTrackBindingsRef,
    remoteVideoTrackRefreshTimerRef,
    refreshRemoteVideoTracksFromPeerRef,
  };

  const transportState = {
    peerConnectionRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    outgoingIceBatchRef,
    disconnectResetTimerRef,
    disconnectRecoveryAttemptedRef,
  };

  const negotiationState = {
    outboundMediaEncryptionOfferRef,
    directCallNegotiationRoleRef,
    supportsPeerRenegotiationV1Ref,
    sendRenegotiationOfferRef,
    flushPendingRenegotiationOfferRef,
    negotiationReadyRef,
    makingOfferRef,
    ignoreOfferRef,
    isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingRenegotiationReasonRef,
    renegotiationUnsupportedRef,
  };

  const diagnosticsState = {
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    callMediaDebugEnabledRef,
    debugCallMedia,
    recordLastRenegotiationAttempt,
    shouldIgnoreUnexpectedPeerSignal,
  };

  return {
    sessionState,
    presentationState,
    mediaState,
    transportState,
    negotiationState,
    diagnosticsState,
  };
}
