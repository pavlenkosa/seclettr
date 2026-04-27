import {
  useCallback,
  useEffect,
  type MutableRefObject,
} from "react";
import {
  type DirectCallVisualMediaSource,
} from "@/calls/direct/model/call-media-state";
import { canReceiveRemoteMediaOnTransceiver } from "@/calls/direct/model/call-transceiver-state";
import { type ActiveCall } from "@/calls/direct/model/direct-call-types";

interface UseDirectCallRemoteReceiverIngressOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>;
  remoteAudioStreamRef: MutableRefObject<MediaStream | null>;
  remoteVideoTrackRefreshTimerRef: MutableRefObject<number | null>;
  refreshRemoteVideoTracksFromPeerRef: MutableRefObject<
    (callIdOverride?: string, reason?: string) => void
  >;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  ensureDirectCallReceiverFrameCryptoBound: (
    callId: string,
    receiver: RTCRtpReceiver,
    kind: "audio" | "video"
  ) => void;
  ingestRemoteVideoTrack: (params: {
    callId: string;
    receiver: RTCRtpReceiver;
    transceiver?: RTCRtpTransceiver | null;
    resolvedSlotSource?: DirectCallVisualMediaSource;
  }) => void;
  resolveRemoteReceiverSlotSource: (
    transceiver?: RTCRtpTransceiver | null
  ) => DirectCallVisualMediaSource;
}

export function useDirectCallRemoteReceiverIngress({
  activeRef,
  peerConnectionRef,
  remoteAudioRef,
  remoteAudioStreamRef,
  remoteVideoTrackRefreshTimerRef,
  refreshRemoteVideoTracksFromPeerRef,
  debugCallMedia,
  isCurrentActiveCallContext,
  ensureDirectCallReceiverFrameCryptoBound,
  ingestRemoteVideoTrack,
  resolveRemoteReceiverSlotSource,
}: UseDirectCallRemoteReceiverIngressOptions) {
  const attachRemoteAudioStream = useCallback((stream: MediaStream) => {
    remoteAudioStreamRef.current = stream;
    if (remoteAudioRef.current) {
      if (remoteAudioRef.current.srcObject !== stream) {
        remoteAudioRef.current.srcObject = stream;
      }
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteAudioRef, remoteAudioStreamRef]);

  const ingestRemoteReceiverTrack = useCallback((
    callId: string,
    receiver: RTCRtpReceiver,
    transceiver?: RTCRtpTransceiver | null,
    resolvedSlotSource?: DirectCallVisualMediaSource
  ) => {
    const track = receiver.track;
    if (!track) {
      debugCallMedia("remote-track-missing", {
        callId,
        transceiverMid: transceiver?.mid ?? null,
      });
      return;
    }
    if (track.readyState !== "live") {
      debugCallMedia("remote-track-not-live", {
        callId,
        trackId: track.id,
        kind: track.kind,
        readyState: track.readyState,
        muted: track.muted,
        transceiverMid: transceiver?.mid ?? null,
      });
      return;
    }

    ensureDirectCallReceiverFrameCryptoBound(
      callId,
      receiver,
      track.kind === "audio" ? "audio" : "video"
    );

    if (track.kind === "audio") {
      const audioStream = remoteAudioStreamRef.current ?? new MediaStream();
      const hasTrack = audioStream.getTracks().some((existingTrack) => existingTrack.id === track.id);
      if (!hasTrack) {
        audioStream.addTrack(track);
      }
      attachRemoteAudioStream(audioStream);
      return;
    }

    if (!transceiver) {
      debugCallMedia("remote-track-without-transceiver", {
        callId,
        kind: track.kind,
        trackId: track.id,
      });
    }

    const slotSource = resolvedSlotSource ?? resolveRemoteReceiverSlotSource(transceiver);
    if (transceiver && !canReceiveRemoteMediaOnTransceiver(transceiver)) {
      debugCallMedia("remote-track-ignored-inactive-transceiver", {
        callId,
        trackId: track.id,
        source: slotSource,
        transceiverMid: transceiver?.mid ?? null,
        direction: transceiver.direction,
        currentDirection: transceiver.currentDirection ?? null,
      });
      return;
    }
    debugCallMedia("remote-track", {
      callId,
      kind: track.kind,
      trackId: track.id,
      muted: track.muted,
      readyState: track.readyState,
      transceiverMid: transceiver?.mid ?? null,
      transceiverDirection: transceiver?.direction ?? null,
      transceiverCurrentDirection: transceiver?.currentDirection ?? null,
      slot: slotSource,
    });
    ingestRemoteVideoTrack({
      callId,
      receiver,
      transceiver,
      resolvedSlotSource: slotSource,
    });
  }, [
    attachRemoteAudioStream,
    debugCallMedia,
    ensureDirectCallReceiverFrameCryptoBound,
    ingestRemoteVideoTrack,
    remoteAudioStreamRef,
    resolveRemoteReceiverSlotSource,
  ]);

  const refreshRemoteVideoTracksFromPeer = useCallback((
    callIdOverride?: string,
    reason = "manual"
  ) => {
    const callId = callIdOverride ?? activeRef.current?.callId;
    const pc = peerConnectionRef.current;
    if (!callId || !pc) {
      return;
    }

    const refreshObservedTracks = () => {
      if (!isCurrentActiveCallContext(callId, pc)) {
        return;
      }
      debugCallMedia("remote-track-refresh", {
        callId,
        reason,
      });
      for (const transceiver of pc.getTransceivers()) {
        const receiver = transceiver.receiver;
        const track = receiver?.track;
        if (!receiver || track?.kind !== "video") {
          continue;
        }
        const resolvedSlotSource = resolveRemoteReceiverSlotSource(transceiver);
        if (canReceiveRemoteMediaOnTransceiver(transceiver) && track.readyState === "live") {
          ingestRemoteReceiverTrack(callId, receiver, transceiver, resolvedSlotSource);
        }
      }
    };

    refreshObservedTracks();
    if (remoteVideoTrackRefreshTimerRef.current) {
      clearTimeout(remoteVideoTrackRefreshTimerRef.current);
    }
    remoteVideoTrackRefreshTimerRef.current = globalThis.window.setTimeout(() => {
      remoteVideoTrackRefreshTimerRef.current = null;
      refreshObservedTracks();
    }, 250);
  }, [
    activeRef,
    debugCallMedia,
    ingestRemoteReceiverTrack,
    isCurrentActiveCallContext,
    peerConnectionRef,
    remoteVideoTrackRefreshTimerRef,
    resolveRemoteReceiverSlotSource,
  ]);

  useEffect(() => {
    refreshRemoteVideoTracksFromPeerRef.current = refreshRemoteVideoTracksFromPeer;
  }, [refreshRemoteVideoTracksFromPeer, refreshRemoteVideoTracksFromPeerRef]);

  return {
    ingestRemoteReceiverTrack,
    refreshRemoteVideoTracksFromPeer,
  };
}
