import { useRef } from "react";
import { type GroupCallFrameCryptoHandle } from "@/calls/shared/crypto/frame-crypto";
import { createEmptyDirectCallSenderFrameHandles } from "@/calls/direct/runtime/direct-call-frame-crypto-runtime";
import {
  type CallMediaSource,
  type LastIncomingMediaState,
} from "@/calls/direct/model/call-media-state";
import { readCallMediaDebugEnabled } from "@/calls/shared/media/call-media-debug";
import type { DirectCallNegotiationRole } from "@/calls/direct/model/direct-call-lifecycle";
import type { DirectCallMediaEncryptionOffer } from "@/calls/direct/model/call-media-encryption-negotiation";
import type {
  ActiveCall,
  DirectCallOutgoingIceBatchState,
  DirectCallFrameCryptoState,
  IncomingCall,
  RemoteInboundVideoProgress,
} from "@/calls/direct/model/direct-call-types";

export function useDirectCallMutableRefs() {
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
  const outgoingRingtoneRef = useRef<HTMLAudioElement | null>(null);
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
  const outgoingRingingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callChatKindRef = useRef<"plain" | "e2ee" | null>(null);
  const callMediaDebugEnabledRef = useRef(readCallMediaDebugEnabled());
  const syncOutgoingVisualMediaStateTrackBindingsRef = useRef<(callIdOverride?: string) => void>(() => {});
  const clearOutgoingMediaStateTrackBindingsRef = useRef<() => void>(() => {});
  const remoteVideoTrackRefreshTimerRef = useRef<number | null>(null);
  const refreshRemoteVideoTracksFromPeerRef = useRef<(callIdOverride?: string, reason?: string) => void>(() => {});

  return {
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
    peerConnectionRef,
    localStreamRef,
    cameraSenderRef,
    cameraTransceiverRef,
    screenShareTrackRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
    localScreenPreviewStreamRef,
    noticeTimerRef,
    incomingRingtoneRef,
    outgoingRingtoneRef,
    incomingRef,
    acceptingIncomingCallRef,
    activeRef,
    outboundMediaEncryptionOfferRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    outgoingIceBatchRef,
    directCallFrameCryptoStateRef,
    directCallSenderFrameHandlesRef,
    directCallReceiverFrameHandlesRef,
    frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
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
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    disconnectResetTimerRef,
    disconnectRecoveryAttemptedRef,
    directCallLifecycleTokenRef,
    outgoingRingingTimeoutRef,
    callChatKindRef,
    callMediaDebugEnabledRef,
    syncOutgoingVisualMediaStateTrackBindingsRef,
    clearOutgoingMediaStateTrackBindingsRef,
    remoteVideoTrackRefreshTimerRef,
    refreshRemoteVideoTracksFromPeerRef,
  };
}
