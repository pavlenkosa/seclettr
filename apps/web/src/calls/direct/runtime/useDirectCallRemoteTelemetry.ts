import { useEffect, type MutableRefObject } from "react";
import { readDecodedFrameCount } from "@/calls/shared/media/call-media-debug";
import { REMOTE_MIN_FRAME_DIMENSION, REMOTE_TRACK_ACTIVE_WINDOW_MS } from "@/calls/direct/model/direct-call-types";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import type { RemoteMediaSlot } from "@/calls/direct/model/call-media-slots";

type PlaybackRef = MutableRefObject<{
  lastTime: number;
  lastFrameCount: number;
  lastProgressAt: number;
}>;

interface VideoRtpStatsSummary {
  sentPackets: number;
  sentBytes: number;
  receivedPackets: number;
  receivedBytes: number;
}

function summarizeVideoRtpStats(stats: RTCStatsReport): VideoRtpStatsSummary {
  const summary: VideoRtpStatsSummary = {
    sentPackets: 0,
    sentBytes: 0,
    receivedPackets: 0,
    receivedBytes: 0,
  };

  for (const report of stats.values()) {
    if (report.type === "outbound-rtp" && report.kind === "video" && !report.isRemote) {
      summary.sentPackets += Number(report.packetsSent ?? 0);
      summary.sentBytes += Number(report.bytesSent ?? 0);
    }
    if (report.type === "inbound-rtp" && report.kind === "video" && !report.isRemote) {
      summary.receivedPackets += Number(report.packetsReceived ?? 0);
      summary.receivedBytes += Number(report.bytesReceived ?? 0);
    }
  }

  return summary;
}

interface UseDirectCallRemoteTelemetryOptions {
  activeCallId: string | null;
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  remoteInboundVideoProgressRef: MutableRefObject<Map<string, {
    frames: number;
    bytes: number;
    packets: number;
    lastProgressAt: number;
    hasTelemetry: boolean;
  }>>;
  remoteCameraSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteScreenSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteCameraProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteCameraPlaybackRef: PlaybackRef;
  remoteScreenPlaybackRef: PlaybackRef;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  updateSlotProgress: (
    source: "camera" | "screen",
    nextProgress: { lastFrameAt: number; lastPacketAt: number }
  ) => void;
}

export function useDirectCallRemoteTelemetry({
  activeCallId,
  activeRef,
  peerConnectionRef,
  localStreamRef,
  cameraSenderRef,
  screenShareSenderRef,
  remoteInboundVideoProgressRef,
  remoteCameraSlotRef,
  remoteScreenSlotRef,
  remoteCameraProbeRef,
  remoteScreenProbeRef,
  remoteCameraPlaybackRef,
  remoteScreenPlaybackRef,
  debugCallMedia,
  updateSlotProgress,
}: UseDirectCallRemoteTelemetryOptions) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!activeCallId) return;
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const timer = setInterval(() => {
      const localVideoTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
      const cameraSenderTrack = cameraSenderRef.current?.track ?? null;
      const screenSenderTrack = screenShareSenderRef.current?.track ?? null;
      debugCallMedia("local-media", {
        callId: activeCallId,
        activeState: activeRef.current?.state ?? null,
        videoOff: activeRef.current?.videoOff ?? null,
        screenSharing: activeRef.current?.screenSharing ?? null,
        localVideoTrack: localVideoTrack
          ? {
              id: localVideoTrack.id,
              readyState: localVideoTrack.readyState,
              enabled: localVideoTrack.enabled,
              muted: localVideoTrack.muted,
            }
          : null,
        cameraSenderTrack: cameraSenderTrack
          ? {
              id: cameraSenderTrack.id,
              readyState: cameraSenderTrack.readyState,
              enabled: cameraSenderTrack.enabled,
              muted: cameraSenderTrack.muted,
            }
          : null,
        screenSenderTrack: screenSenderTrack
          ? {
              id: screenSenderTrack.id,
              readyState: screenSenderTrack.readyState,
              enabled: screenSenderTrack.enabled,
              muted: screenSenderTrack.muted,
            }
          : null,
        transceivers: pc.getTransceivers().map((transceiver) => ({
          mid: transceiver.mid,
          direction: transceiver.direction,
          currentDirection: transceiver.currentDirection ?? null,
          senderKind: transceiver.sender.track?.kind ?? null,
          senderTrackId: transceiver.sender.track?.id ?? null,
          receiverKind: transceiver.receiver.track?.kind ?? null,
          receiverTrackId: transceiver.receiver.track?.id ?? null,
          receiverTrackMuted: transceiver.receiver.track?.muted ?? null,
          receiverTrackReadyState: transceiver.receiver.track?.readyState ?? null,
        })),
      });

      if (pc.signalingState === "closed") return;
      pc.getStats().then((stats) => {
        const {
          sentPackets,
          sentBytes,
          receivedPackets,
          receivedBytes,
        } = summarizeVideoRtpStats(stats);

        debugCallMedia("video-stats", {
          callId: activeCallId,
          sentPackets,
          sentBytes,
          receivedPackets,
          receivedBytes,
        });
      }).catch(() => {});
    }, 2000);

    return () => clearInterval(timer);
  }, [activeCallId, activeRef, cameraSenderRef, debugCallMedia, localStreamRef, peerConnectionRef, screenShareSenderRef]);

  useEffect(() => {
    if (!activeCallId) return;
    const pc = peerConnectionRef.current;
    if (!pc) return;

    let cancelled = false;

    const syncRemoteVideoTelemetry = async () => {
      if (cancelled) return;
      if (pc.signalingState === "closed") return;
      // No stats to gather until at least one remote slot has an active track.
      if (!remoteCameraSlotRef.current.trackId && !remoteScreenSlotRef.current.trackId) return;
      const stats = await pc.getStats();
      const inboundProgressByTrackId = remoteInboundVideoProgressRef.current;
      const telemetryNow = performance.now();
      const inboundScoreByTrackId = new Map<string, { bytes: number; frames: number; packets: number }>();
      for (const report of stats.values()) {
        if (report.type !== "inbound-rtp") continue;
        const inbound = report as RTCInboundRtpStreamStats;
        if (inbound.kind !== "video" || report.isRemote) continue;
        const trackId = inbound.trackIdentifier;
        if (!trackId) continue;
        const current = inboundScoreByTrackId.get(trackId) ?? { bytes: 0, frames: 0, packets: 0 };
        current.bytes = Math.max(current.bytes, inbound.bytesReceived ?? 0);
        current.frames = Math.max(current.frames, inbound.framesDecoded ?? 0);
        current.packets = Math.max(current.packets, inbound.packetsReceived ?? 0);
        inboundScoreByTrackId.set(trackId, current);
      }

      for (const [trackId, score] of inboundScoreByTrackId.entries()) {
        const previous = inboundProgressByTrackId.get(trackId);
        const hasProgressed = !previous ||
          score.frames > previous.frames ||
          score.bytes > previous.bytes ||
          score.packets > previous.packets;
        inboundProgressByTrackId.set(trackId, {
          frames: score.frames,
          bytes: score.bytes,
          packets: score.packets,
          lastProgressAt: hasProgressed
            ? telemetryNow
            : (previous?.lastProgressAt ?? 0),
          hasTelemetry: true,
        });
      }

      const syncSlotTelemetry = (
        slot: RemoteMediaSlot,
        source: "camera" | "screen",
        probeElement: HTMLVideoElement | null,
        playbackRef: PlaybackRef
      ) => {
        if (!slot.trackId || !slot.stream) {
          return;
        }

        const track = slot.stream.getVideoTracks()[0] ?? null;
        if (track?.id !== slot.trackId) {
          return;
        }

        const telemetry = inboundProgressByTrackId.get(slot.trackId);
        const hasPacketProgress = Boolean(
          telemetry?.hasTelemetry &&
          telemetry.lastProgressAt > 0 &&
          (telemetryNow - telemetry.lastProgressAt) < REMOTE_TRACK_ACTIVE_WINDOW_MS
        );

        let nextLastFrameAt = slot.lastFrameAt;
        if (probeElement?.srcObject === slot.stream) {
          const hasDecodedFrame = (
            probeElement.videoWidth >= REMOTE_MIN_FRAME_DIMENSION &&
            probeElement.videoHeight >= REMOTE_MIN_FRAME_DIMENSION &&
            probeElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          );
          const decodedFrameCount = hasDecodedFrame ? readDecodedFrameCount(probeElement) : null;
          const currentTime = probeElement.currentTime;
          const hasFrameProgress = Boolean(
            hasDecodedFrame && (
              (decodedFrameCount !== null && decodedFrameCount > playbackRef.current.lastFrameCount) ||
              currentTime > playbackRef.current.lastTime + 0.01
            )
          );
          if (hasFrameProgress) {
            playbackRef.current.lastFrameCount = Math.max(playbackRef.current.lastFrameCount, decodedFrameCount ?? 0);
            playbackRef.current.lastTime = currentTime;
            playbackRef.current.lastProgressAt = telemetryNow;
            nextLastFrameAt = telemetryNow;
          }
        }

        const nextLastPacketAt = hasPacketProgress
          ? Math.max(slot.lastPacketAt, telemetry?.lastProgressAt ?? telemetryNow)
          : slot.lastPacketAt;

        updateSlotProgress(source, {
          lastFrameAt: nextLastFrameAt,
          lastPacketAt: nextLastPacketAt,
        });
      };

      syncSlotTelemetry(
        remoteCameraSlotRef.current,
        "camera",
        remoteCameraProbeRef.current,
        remoteCameraPlaybackRef
      );
      syncSlotTelemetry(
        remoteScreenSlotRef.current,
        "screen",
        remoteScreenProbeRef.current,
        remoteScreenPlaybackRef
      );
    };

    syncRemoteVideoTelemetry().catch(() => undefined);
    const timer = setInterval(() => {
      syncRemoteVideoTelemetry().catch(() => undefined);
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    activeCallId,
    peerConnectionRef,
    remoteCameraPlaybackRef,
    remoteCameraProbeRef,
    remoteCameraSlotRef,
    remoteInboundVideoProgressRef,
    remoteScreenPlaybackRef,
    remoteScreenProbeRef,
    remoteScreenSlotRef,
    updateSlotProgress,
  ]);
}
