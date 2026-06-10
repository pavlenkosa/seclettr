import { useCallback, useEffect, type MutableRefObject, type RefObject } from "react";
import type { DirectCallNegotiationRole } from "@/calls/direct/model/direct-call-lifecycle";
import type { CallMediaSource, LastIncomingMediaState } from "@/calls/direct/model/call-media-state";
import type { RemoteMediaSlot, RemoteMediaUiStatus } from "@/calls/direct/model/call-media-slots";
import { isRemoteMediaSlotRenderable } from "@/calls/direct/model/call-media-slots";
import {
  readDecodedFrameCount,
  snapshotTrack,
  snapshotVideoElement,
  writeCallMediaDebugEnabled,
} from "@/calls/shared/media/call-media-debug";
import type { ActiveCall, IncomingCall } from "@/calls/direct/model/direct-call-types";
import {
  DIRECT_CALL_RUNTIME_STATE_DEFINITIONS,
  canDirectCallRuntimeAction,
  resolveDirectCallRuntimeState,
} from "@/calls/direct/model/direct-call-runtime-state";
import { logger } from "@/lib/logger.js";

interface UseDirectCallDevDebugOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  remoteAudioStreamRef: MutableRefObject<MediaStream | null>;
  remoteCameraStreamRef: MutableRefObject<MediaStream | null>;
  remoteScreenStreamRef: MutableRefObject<MediaStream | null>;
  remoteCameraSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteScreenSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteReceiverSlotBindingsRef: MutableRefObject<Map<string, "camera" | "screen">>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  callMediaStateSeqRef: MutableRefObject<number>;
  localMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateSeqRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  lastIncomingMediaStateRef: MutableRefObject<Record<CallMediaSource, LastIncomingMediaState | null>>;
  directCallNegotiationRoleRef: MutableRefObject<DirectCallNegotiationRole>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  negotiationReadyRef: MutableRefObject<boolean>;
  remoteVideoReady: boolean;
  remoteScreenReady: boolean;
  remoteCameraUiStatus: RemoteMediaUiStatus;
  remoteScreenUiStatus: RemoteMediaUiStatus;
  remoteVideoRef: RefObject<HTMLVideoElement>;
  remoteScreenVideoRef: RefObject<HTMLVideoElement>;
  remoteCameraProbeRef: RefObject<HTMLVideoElement>;
  remoteScreenProbeRef: RefObject<HTMLVideoElement>;
  localVideoRef: RefObject<HTMLVideoElement>;
  callMediaDebugEnabledRef: MutableRefObject<boolean>;
}

interface DirectCallPeerStatsSnapshot {
  readonly outboundVideo: Array<Record<string, unknown>>;
  readonly inboundVideo: Array<Record<string, unknown>>;
  readonly transports: Array<Record<string, unknown>>;
  readonly selectedPair: Record<string, unknown> | null;
}

function buildDirectCallLifecycleSnapshot(
  pc: RTCPeerConnection | null,
  currentActive: ActiveCall | null,
  currentIncoming: IncomingCall | null
) {
  const runtimeState = resolveDirectCallRuntimeState({
    active: currentActive,
    incoming: currentIncoming,
    peerConnectionState: pc?.connectionState ?? null,
    iceConnectionState: pc?.iceConnectionState ?? null,
  });
  const lifecycleDefinition = DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[runtimeState];
  return {
    state: runtimeState,
    allowedActions: lifecycleDefinition.allowedActions,
    forbiddenActions: lifecycleDefinition.forbiddenActions,
    requiredCleanup: lifecycleDefinition.requiredCleanup,
    canRetryConnect: canDirectCallRuntimeAction(runtimeState, "retry_connect"),
    canToggleScreenShare: canDirectCallRuntimeAction(runtimeState, "toggle_screen_share"),
  };
}

function buildInactiveDirectCallSnapshot(
  pc: RTCPeerConnection | null,
  currentActive: ActiveCall | null,
  currentIncoming: IncomingCall | null,
  lifecycle: Record<string, unknown>
): Record<string, unknown> {
  return {
    callActive: Boolean(currentActive),
    incomingCall: Boolean(currentIncoming),
    connectionState: pc?.connectionState ?? null,
    lifecycle,
    callId: currentActive?.callId ?? currentIncoming?.callId ?? null,
  };
}

function snapshotOutboundVideoStats(
  report: RTCOutboundRtpStreamStats
): Record<string, unknown> {
  return {
    id: report.id,
    ssrc: report.ssrc ?? null,
    packetsSent: report.packetsSent ?? 0,
    bytesSent: report.bytesSent ?? 0,
    framesEncoded: report.framesEncoded ?? null,
    keyFramesEncoded: report.keyFramesEncoded ?? null,
    frameWidth: report.frameWidth ?? null,
    frameHeight: report.frameHeight ?? null,
  };
}

function snapshotInboundVideoStats(
  report: RTCInboundRtpStreamStats
): Record<string, unknown> {
  return {
    id: report.id,
    ssrc: report.ssrc ?? null,
    packetsReceived: report.packetsReceived ?? 0,
    bytesReceived: report.bytesReceived ?? 0,
    packetsLost: report.packetsLost ?? 0,
    framesDecoded: report.framesDecoded ?? null,
    keyFramesDecoded: report.keyFramesDecoded ?? null,
    frameWidth: report.frameWidth ?? null,
    frameHeight: report.frameHeight ?? null,
  };
}

function snapshotTransportStats(report: RTCTransportStats): {
  readonly selectedPairId: string | null;
  readonly transport: Record<string, unknown>;
} {
  const selectedPairId = report.selectedCandidatePairId ?? null;
  return {
    selectedPairId,
    transport: {
      id: report.id,
      dtlsState: report.dtlsState ?? null,
      iceState: report.iceState ?? null,
      selectedCandidatePairId: selectedPairId,
    },
  };
}

function snapshotCandidatePairStats(
  stats: RTCStatsReport,
  selectedPairId: string | null
): Record<string, unknown> | null {
  if (!selectedPairId) return null;
  for (const report of stats.values()) {
    if (report.type !== "candidate-pair" || report.id !== selectedPairId) {
      continue;
    }
    const pair = report as RTCIceCandidatePairStats;
    return {
      id: pair.id,
      state: pair.state ?? null,
      nominated: pair.nominated ?? null,
      currentRoundTripTime: pair.currentRoundTripTime ?? null,
      totalRoundTripTime: pair.totalRoundTripTime ?? null,
      availableOutgoingBitrate: pair.availableOutgoingBitrate ?? null,
      localCandidateId: pair.localCandidateId ?? null,
      remoteCandidateId: pair.remoteCandidateId ?? null,
    };
  }
  return null;
}

function collectDirectCallPeerStats(stats: RTCStatsReport): DirectCallPeerStatsSnapshot {
  const outboundVideo: Array<Record<string, unknown>> = [];
  const inboundVideo: Array<Record<string, unknown>> = [];
  const transports: Array<Record<string, unknown>> = [];
  let selectedPairId: string | null = null;

  for (const report of stats.values()) {
    if (report.type === "transport") {
      const transportStats = snapshotTransportStats(report as RTCTransportStats);
      selectedPairId = transportStats.selectedPairId ?? selectedPairId;
      transports.push(transportStats.transport);
    }

    if (report.type === "outbound-rtp" && (report as RTCOutboundRtpStreamStats).kind === "video" && !report.isRemote) {
      outboundVideo.push(snapshotOutboundVideoStats(report as RTCOutboundRtpStreamStats));
    }

    if (report.type === "inbound-rtp" && (report as RTCInboundRtpStreamStats).kind === "video" && !report.isRemote) {
      inboundVideo.push(snapshotInboundVideoStats(report as RTCInboundRtpStreamStats));
    }
  }

  return {
    outboundVideo,
    inboundVideo,
    transports,
    selectedPair: snapshotCandidatePairStats(stats, selectedPairId),
  };
}

function snapshotRemoteSlot(slot: RemoteMediaSlot): Record<string, unknown> {
  return {
    source: slot.source,
    trackId: slot.trackId,
    status: slot.status,
    lastFrameAt: slot.lastFrameAt,
    lastPacketAt: slot.lastPacketAt,
    mid: slot.mid,
    signaledActivity: slot.signaledActivity,
    renderable: isRemoteMediaSlotRenderable(slot),
  };
}

function snapshotTransceiver(transceiver: RTCRtpTransceiver | null): Record<string, unknown> | null {
  if (!transceiver) return null;
  return {
    mid: transceiver.mid,
    direction: transceiver.direction,
    currentDirection: transceiver.currentDirection ?? null,
  };
}

export function useDirectCallDevDebug({
  activeRef,
  incomingRef,
  peerConnectionRef,
  localStreamRef,
  remoteAudioStreamRef,
  remoteCameraStreamRef,
  remoteScreenStreamRef,
  remoteCameraSlotRef,
  remoteScreenSlotRef,
  remoteReceiverSlotBindingsRef,
  cameraSenderRef,
  screenShareSenderRef,
  cameraTransceiverRef,
  screenShareTransceiverRef,
  callMediaStateSeqRef,
  localMediaStateRevisionRef,
  remoteMediaStateSeqRef,
  remoteMediaStateRevisionRef,
  lastIncomingMediaStateRef,
  directCallNegotiationRoleRef,
  makingOfferRef,
  ignoreOfferRef,
  isSettingRemoteAnswerPendingRef,
  renegotiationRevisionRef,
  pendingLocalRenegotiationRevisionRef,
  pendingRenegotiationReasonRef,
  lastRenegotiationAttemptRef,
  supportsPeerRenegotiationV1Ref,
  renegotiationUnsupportedRef,
  lastSignalingErrorRef,
  negotiationReadyRef,
  remoteVideoReady,
  remoteScreenReady,
  remoteCameraUiStatus,
  remoteScreenUiStatus,
  remoteVideoRef,
  remoteScreenVideoRef,
  remoteCameraProbeRef,
  remoteScreenProbeRef,
  localVideoRef,
  callMediaDebugEnabledRef,
}: UseDirectCallDevDebugOptions): void {
  const buildDirectCallDebugSnapshot = useCallback(async (): Promise<Record<string, unknown> | null> => {
    if (!import.meta.env.DEV) return null;

    const pc = peerConnectionRef.current;
    const currentActive = activeRef.current;
    const currentIncoming = incomingRef.current;
    const lifecycle = buildDirectCallLifecycleSnapshot(pc, currentActive, currentIncoming);

    if (!pc || !currentActive) {
      return buildInactiveDirectCallSnapshot(pc, currentActive, currentIncoming, lifecycle);
    }

    const peerStats = collectDirectCallPeerStats(await pc.getStats());

    const transceivers = pc.getTransceivers().map((transceiver) => ({
      mid: transceiver.mid,
      direction: transceiver.direction,
      currentDirection: transceiver.currentDirection ?? null,
      senderTrack: snapshotTrack(transceiver.sender.track),
      receiverTrack: snapshotTrack(transceiver.receiver.track),
    }));

    return {
      callActive: Boolean(currentActive),
      incomingCall: Boolean(currentIncoming),
      timestamp: new Date().toISOString(),
      callId: currentActive.callId,
      peerUserId: currentActive.peerUserId,
      peerDeviceId: currentActive.peerDeviceId,
      mediaEncryptionMode: currentActive.mediaEncryptionMode,
      lifecycle,
      capabilities: {
        senderCreateEncodedStreams: typeof (RTCRtpSender.prototype as unknown as { createEncodedStreams?: unknown }).createEncodedStreams === "function",
        receiverCreateEncodedStreams: typeof (RTCRtpReceiver.prototype as unknown as { createEncodedStreams?: unknown }).createEncodedStreams === "function",
        senderTransform: "transform" in RTCRtpSender.prototype,
        receiverTransform: "transform" in RTCRtpReceiver.prototype,
        rtpScriptTransform: (globalThis as unknown as { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform !== undefined,
      },
      connectionState: pc.connectionState,
      signalingState: pc.signalingState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      transceivers,
      localTracks: localStreamRef.current?.getTracks().map((track) => snapshotTrack(track)) ?? [],
      remoteCameraTracks: remoteCameraStreamRef.current?.getTracks().map((track) => snapshotTrack(track)) ?? [],
      remoteScreenTracks: remoteScreenStreamRef.current?.getTracks().map((track) => snapshotTrack(track)) ?? [],
      remoteAudioTracks: remoteAudioStreamRef.current?.getTracks().map((track) => snapshotTrack(track)) ?? [],
      remoteSlots: {
        camera: snapshotRemoteSlot(remoteCameraSlotRef.current),
        screen: snapshotRemoteSlot(remoteScreenSlotRef.current),
      },
      receiverTrackBindings: [...remoteReceiverSlotBindingsRef.current.entries()].map(([mid, source]) => ({
        mid,
        source,
      })),
      senderSlotBindings: {
        camera: {
          mid: cameraTransceiverRef.current?.mid ?? null,
          trackId: cameraSenderRef.current?.track?.id ?? null,
        },
        screen: {
          mid: screenShareTransceiverRef.current?.mid ?? null,
          trackId: screenShareSenderRef.current?.track?.id ?? null,
        },
      },
      mediaStateSeq: {
        outboundSeq: callMediaStateSeqRef.current,
        localRevision: { ...localMediaStateRevisionRef.current },
        remoteSeq: { ...remoteMediaStateSeqRef.current },
        remoteRevision: { ...remoteMediaStateRevisionRef.current },
      },
      lastMediaStateBySource: lastIncomingMediaStateRef.current,
      negotiation: {
        politeRole: directCallNegotiationRoleRef.current,
        makingOffer: makingOfferRef.current,
        ignoreOffer: ignoreOfferRef.current,
        isSettingRemoteAnswerPending: isSettingRemoteAnswerPendingRef.current,
        renegotiationRevision: renegotiationRevisionRef.current,
        pendingLocalRenegotiationRevision: pendingLocalRenegotiationRevisionRef.current,
        pendingRenegotiationReason: pendingRenegotiationReasonRef.current,
        supportsRenegotiationV1: supportsPeerRenegotiationV1Ref.current,
        renegotiationUnsupportedConfirmed: renegotiationUnsupportedRef.current,
        negotiationReady: negotiationReadyRef.current,
        cameraTransceiver: snapshotTransceiver(cameraTransceiverRef.current),
        screenTransceiver: snapshotTransceiver(screenShareTransceiverRef.current),
      },
      diagnostics: {
        lastRenegotiationAttempt: lastRenegotiationAttemptRef.current,
        lastSignalingError: lastSignalingErrorRef.current,
      },
      uiState: {
        remoteVideoReady,
        remoteScreenReady,
        remoteCameraUiStatus,
        remoteScreenUiStatus,
        hasLiveRemoteCameraTrack: isRemoteMediaSlotRenderable(remoteCameraSlotRef.current),
        hasLiveRemoteScreenTrack: isRemoteMediaSlotRenderable(remoteScreenSlotRef.current),
      },
      videoElements: {
        remoteCamera: snapshotVideoElement(remoteVideoRef.current),
        remoteScreen: snapshotVideoElement(remoteScreenVideoRef.current),
        probeCamera: snapshotVideoElement(remoteCameraProbeRef.current),
        probeScreen: snapshotVideoElement(remoteScreenProbeRef.current),
        localCamera: snapshotVideoElement(localVideoRef.current),
      },
      stats: {
        outboundVideo: peerStats.outboundVideo,
        inboundVideo: peerStats.inboundVideo,
        transports: peerStats.transports,
        selectedPair: peerStats.selectedPair,
      },
      decodedFrames: {
        remoteCamera: remoteVideoRef.current ? readDecodedFrameCount(remoteVideoRef.current) : null,
        remoteScreen: remoteScreenVideoRef.current ? readDecodedFrameCount(remoteScreenVideoRef.current) : null,
        probeCamera: remoteCameraProbeRef.current ? readDecodedFrameCount(remoteCameraProbeRef.current) : null,
        probeScreen: remoteScreenProbeRef.current ? readDecodedFrameCount(remoteScreenProbeRef.current) : null,
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, import.meta.env.DEV ? [
    activeRef,
    incomingRef,
    callMediaStateSeqRef,
    cameraSenderRef,
    cameraTransceiverRef,
    directCallNegotiationRoleRef,
    ignoreOfferRef,
    isSettingRemoteAnswerPendingRef,
    lastIncomingMediaStateRef,
    localMediaStateRevisionRef,
    localStreamRef,
    localVideoRef,
    makingOfferRef,
    negotiationReadyRef,
    peerConnectionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingRenegotiationReasonRef,
    lastRenegotiationAttemptRef,
    remoteAudioStreamRef,
    remoteCameraProbeRef,
    remoteCameraSlotRef,
    remoteCameraStreamRef,
    remoteCameraUiStatus,
    remoteReceiverSlotBindingsRef,
    remoteMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteScreenProbeRef,
    remoteScreenReady,
    remoteScreenSlotRef,
    remoteScreenStreamRef,
    remoteScreenUiStatus,
    remoteVideoReady,
    remoteVideoRef,
    remoteScreenVideoRef,
    renegotiationRevisionRef,
    renegotiationUnsupportedRef,
    lastSignalingErrorRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
    supportsPeerRenegotiationV1Ref,
  ] : []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    window.__scGetCallDebugSnapshot = buildDirectCallDebugSnapshot;
    const dumpCallDebug = async () => {
      const snapshot = await buildDirectCallDebugSnapshot();
      if (!snapshot) {
        logger.warn("[CALL][debug] snapshot unavailable");
        return;
      }
      console.groupCollapsed("[CALL][debug] direct-call snapshot");
      logger.debug("[CALL][debug] direct-call snapshot", snapshot);
      console.groupEnd();
    };
    window.__scDumpCallDebug = dumpCallDebug;
    const setCallDebugEnabled = (enabled: boolean) => {
      callMediaDebugEnabledRef.current = enabled;
      writeCallMediaDebugEnabled(enabled);
      logger.info(`[CALL][debug] media logging ${enabled ? "enabled" : "disabled"}`);
    };
    window.__scSetCallDebugEnabled = setCallDebugEnabled;
    const isCallDebugEnabled = () => callMediaDebugEnabledRef.current;
    window.__scIsCallDebugEnabled = isCallDebugEnabled;

    return () => {
      if (window.__scGetCallDebugSnapshot === buildDirectCallDebugSnapshot) {
        delete window.__scGetCallDebugSnapshot;
      }
      if (window.__scDumpCallDebug === dumpCallDebug) {
        delete window.__scDumpCallDebug;
      }
      if (window.__scSetCallDebugEnabled === setCallDebugEnabled) {
        delete window.__scSetCallDebugEnabled;
      }
      if (window.__scIsCallDebugEnabled === isCallDebugEnabled) {
        delete window.__scIsCallDebugEnabled;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, import.meta.env.DEV ? [buildDirectCallDebugSnapshot, callMediaDebugEnabledRef] : []);
}
