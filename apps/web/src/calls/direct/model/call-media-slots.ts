import type { CallMediaActivity } from "@seclettr/protocol";
import { REMOTE_TRACK_ACTIVE_WINDOW_MS } from "./direct-call-types";

export type RemoteMediaSource = "camera" | "screen";
export type RemoteMediaUiStatus = "inactive" | "starting" | "active";
export type RemoteMediaSlotStatus = "inactive" | "starting" | "live" | "stopping" | "ended";

export interface RemoteMediaSlot {
  source: RemoteMediaSource;
  trackId: string | null;
  stream: MediaStream | null;
  status: RemoteMediaSlotStatus;
  lastFrameAt: number;
  lastPacketAt: number;
  mid: string | null;
  signaledActivity: CallMediaActivity | null;
}

export function createEmptyRemoteMediaSlot(source: RemoteMediaSource): RemoteMediaSlot {
  return {
    source,
    trackId: null,
    stream: null,
    status: "inactive",
    lastFrameAt: 0,
    lastPacketAt: 0,
    mid: null,
    signaledActivity: null,
  };
}

export function getOppositeRemoteMediaSource(source: RemoteMediaSource): RemoteMediaSource {
  return source === "camera" ? "screen" : "camera";
}

function getRemoteMediaNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function isRemoteMediaSlotRenderable(
  slot: RemoteMediaSlot,
  now: number = getRemoteMediaNow(),
  activeWindowMs: number = REMOTE_TRACK_ACTIVE_WINDOW_MS
): boolean {
  if (!slot.stream) {
    return false;
  }

  if (slot.signaledActivity === "inactive") {
    return false;
  }

  // Advisory media-state signals can temporarily move a live track into
  // "starting"/"stopping". Rendering must stay source-of-truth by stream/track,
  // otherwise camera/screen flicker under racey signaling/order.
  if (slot.status === "inactive" || slot.status === "ended") {
    return false;
  }

  const hasActiveTrack = slot.stream.getVideoTracks().some((track) => (
    track.readyState === "live" &&
    track.enabled &&
    (
      !track.muted ||
      slot.status === "live" ||
      (slot.lastFrameAt > 0 && (now - slot.lastFrameAt) < activeWindowMs) ||
      (slot.lastPacketAt > 0 && (now - slot.lastPacketAt) < activeWindowMs)
    )
  ));
  if (!hasActiveTrack) {
    return false;
  }

  return true;
}

export function isRemoteTrackSignalingLive(
  track: Pick<MediaStreamTrack, "readyState" | "muted"> | null | undefined
): boolean {
  return track?.readyState === "live" && !track?.muted;
}

export function resolveRemoteMediaSlotRuntimeStatus(params: {
  currentStatus: RemoteMediaSlotStatus;
  trackSignalLive: boolean;
  hasPacketProgress: boolean;
  hasFrameProgress: boolean;
}): RemoteMediaSlotStatus {
  const hasConfirmedActivity =
    params.trackSignalLive ||
    params.hasPacketProgress ||
    params.hasFrameProgress;

  if (params.currentStatus === "stopping") {
    return hasConfirmedActivity ? "live" : "stopping";
  }

  // Keep already-live slots stable through short telemetry gaps to avoid
  // visible flicker / disappearance while RTP or decode counters jitter.
  if (params.currentStatus === "live") {
    return "live";
  }

  return hasConfirmedActivity ? "live" : "starting";
}

export function toRemoteMediaUiStatus(status: RemoteMediaSlotStatus): RemoteMediaUiStatus {
  if (status === "live") {
    return "active";
  }
  if (status === "starting" || status === "stopping") {
    return "starting";
  }
  return "inactive";
}

export function withRemoteMediaProgress(
  slot: RemoteMediaSlot,
  progress: Partial<Pick<RemoteMediaSlot, "lastFrameAt" | "lastPacketAt">>
): RemoteMediaSlot {
  return {
    ...slot,
    lastFrameAt: progress.lastFrameAt ?? slot.lastFrameAt,
    lastPacketAt: progress.lastPacketAt ?? slot.lastPacketAt,
  };
}
