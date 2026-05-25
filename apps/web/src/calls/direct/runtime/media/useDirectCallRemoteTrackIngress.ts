import { useCallback } from "react";
import {
  type DirectCallVisualMediaSource,
  type IncomingMediaStateHint,
  toIncomingMediaStateHint,
} from "@/calls/direct/model/call-media-state";
import {
  detectSourceSwitch,
  resolveRemoteReceiverSlotSource as resolveRemoteReceiverSlotSourceHelper,
} from "@/calls/direct/model/call-remote-slot-binding";
import {
  createEmptyRemoteMediaSlot,
  getOppositeRemoteMediaSource,
  isRemoteTrackSignalingLive,
  type RemoteMediaSlot,
  type RemoteMediaSource,
  type RemoteMediaSlotStatus,
} from "@/calls/direct/model/call-media-slots";
import type {
  DirectCallRemoteTrackIngressOptions,
  DirectCallRemoteTrackIngressResult,
} from "./direct-call-remote-media-runtime-shared";
import { bindTrackLifecycle } from "../direct-call-pc-utils";

function selectRemoteMediaSlot(
  source: DirectCallVisualMediaSource,
  cameraSlot: RemoteMediaSlot,
  screenSlot: RemoteMediaSlot
): RemoteMediaSlot {
  return source === "screen" ? screenSlot : cameraSlot;
}

function clearRemoteSlotForReassignment(params: {
  source: RemoteMediaSource;
  slot: RemoteMediaSlot;
  clearRemoteTrackLifecycleBinding: (trackId: string | null) => void;
  commitRemoteMediaSlot: (
    source: DirectCallVisualMediaSource,
    nextSlot: RemoteMediaSlot
  ) => void;
}): void {
  params.clearRemoteTrackLifecycleBinding(params.slot.trackId);
  params.commitRemoteMediaSlot(params.source, {
    ...createEmptyRemoteMediaSlot(params.source),
    status: "inactive",
    mid: params.slot.mid,
    signaledActivity: params.slot.signaledActivity,
  });
}

function resolveTargetStreamForRemoteTrack(
  currentSlot: RemoteMediaSlot,
  oppositeSlot: RemoteMediaSlot,
  track: MediaStreamTrack
): MediaStream {
  return currentSlot.stream ?? (
    oppositeSlot.trackId === track.id && oppositeSlot.stream
      ? oppositeSlot.stream
      : new MediaStream()
  );
}

function syncTargetStreamVideoTrack(
  targetStream: MediaStream,
  track: MediaStreamTrack
): void {
  for (const existingTrack of targetStream.getVideoTracks()) {
    if (existingTrack.id !== track.id) {
      targetStream.removeTrack(existingTrack);
    }
  }
  if (!targetStream.getVideoTracks().some((existingTrack) => existingTrack.id === track.id)) {
    targetStream.addTrack(track);
  }
}

function resolveInitialRemoteTrackStatus(
  track: MediaStreamTrack,
  hint: IncomingMediaStateHint
): RemoteMediaSlotStatus {
  if (isRemoteTrackSignalingLive(track)) return "live";
  if (track.readyState !== "live" || hint.signaledEnded) return "ended";
  if (hint.signaledStopping) return "stopping";
  return "starting";
}

export function useDirectCallRemoteTrackIngress({
  peerConnectionRef,
  cameraTransceiverRef,
  screenShareTransceiverRef,
  lastIncomingMediaStateRef,
  debugCallMedia,
  remoteCameraSlotRef,
  remoteScreenSlotRef,
  remoteReceiverSlotBindingsRef,
  remoteReceiverTransceiverBindingsRef,
  remoteTrackLifecycleCleanupRef,
  pendingReplacementTrackRef,
  commitRemoteMediaSlot,
  updateRemoteMediaSlot,
}: DirectCallRemoteTrackIngressOptions): DirectCallRemoteTrackIngressResult {
  const clearRemoteTrackLifecycleBinding = useCallback((trackId: string | null) => {
    if (!trackId) {
      return;
    }

    const cleanup = remoteTrackLifecycleCleanupRef.current.get(trackId);
    if (cleanup) {
      cleanup();
      remoteTrackLifecycleCleanupRef.current.delete(trackId);
    }

    for (const [source, pendingId] of pendingReplacementTrackRef.current.entries()) {
      if (pendingId === trackId) {
        pendingReplacementTrackRef.current.delete(source);
      }
    }
  }, [pendingReplacementTrackRef, remoteTrackLifecycleCleanupRef]);

  const clearRemoteMediaSlot = useCallback((
    source: "camera" | "screen",
    status: RemoteMediaSlotStatus = "inactive",
    expectedTrackId?: string | null
  ) => {
    const slotRef = source === "camera" ? remoteCameraSlotRef : remoteScreenSlotRef;
    const currentSlot = slotRef.current;

    if (expectedTrackId && currentSlot.trackId !== expectedTrackId) {
      debugCallMedia("slot-clear-skip-mismatch", {
        source,
        expectedTrackId,
        actualTrackId: currentSlot.trackId,
      });
      return;
    }

    clearRemoteTrackLifecycleBinding(currentSlot.trackId);

    if (currentSlot.stream) {
      const pendingReplacement = pendingReplacementTrackRef.current.get(source);
      if (!pendingReplacement) {
        for (const track of currentSlot.stream.getVideoTracks()) {
          currentSlot.stream.removeTrack(track);
        }
      }
    }

    commitRemoteMediaSlot(source, {
      ...createEmptyRemoteMediaSlot(source),
      status,
      mid: currentSlot.mid,
      signaledActivity: currentSlot.signaledActivity,
    });

    debugCallMedia("slot-cleared", {
      source,
      expectedTrackId: expectedTrackId ?? null,
      status,
      hadPendingReplacement: pendingReplacementTrackRef.current.has(source),
    });
  }, [
    clearRemoteTrackLifecycleBinding,
    commitRemoteMediaSlot,
    debugCallMedia,
    pendingReplacementTrackRef,
    remoteCameraSlotRef,
    remoteScreenSlotRef,
  ]);

  const resolveRemoteReceiverSlotSource = useCallback((transceiver: RTCRtpTransceiver | null | undefined): "camera" | "screen" => {
    const mid = transceiver?.mid;
    const negotiatedVideoMids = peerConnectionRef.current
      ? peerConnectionRef.current
        .getTransceivers()
        .filter((candidate) => (
          candidate.mid !== null &&
          (
            candidate.receiver.track.kind === "video" ||
            candidate.sender.track?.kind === "video"
          )
        ))
        .map((candidate) => candidate.mid as string)
        .sort((left, right) => {
          const leftNumeric = Number(left);
          const rightNumeric = Number(right);
          if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric)) {
            return leftNumeric - rightNumeric;
          }
          return left.localeCompare(right);
        })
      : [];

    const resolved = resolveRemoteReceiverSlotSourceHelper({
      isCameraTransceiver: Boolean(
        transceiver &&
        cameraTransceiverRef.current &&
        transceiver === cameraTransceiverRef.current
      ),
      isScreenTransceiver: Boolean(
        transceiver &&
        screenShareTransceiverRef.current &&
        transceiver === screenShareTransceiverRef.current
      ),
      existingTransceiverBinding: transceiver
        ? remoteReceiverTransceiverBindingsRef.current.get(transceiver) ?? null
        : null,
      transceiverMid: mid,
      remoteCameraSignaledMid: lastIncomingMediaStateRef.current.camera?.mid ?? null,
      remoteScreenSignaledMid: lastIncomingMediaStateRef.current.screen?.mid ?? null,
      existingMidBinding: mid ? remoteReceiverSlotBindingsRef.current.get(mid) ?? null : null,
      negotiatedVideoMids,
    });

    if (transceiver) {
      remoteReceiverTransceiverBindingsRef.current.set(transceiver, resolved.source);
    }
    if (resolved.bindMid) {
      remoteReceiverSlotBindingsRef.current.set(resolved.bindMid, resolved.source);
    }
    return resolved.source;
  }, [
    cameraTransceiverRef,
    lastIncomingMediaStateRef,
    peerConnectionRef,
    remoteReceiverSlotBindingsRef,
    remoteReceiverTransceiverBindingsRef,
    screenShareTransceiverRef,
  ]);

  const bindRemoteVideoTrackLifecycle = useCallback((
    source: "camera" | "screen",
    track: MediaStreamTrack
  ) => {
    clearRemoteTrackLifecycleBinding(track.id);
    pendingReplacementTrackRef.current.delete(source);

    const syncStatus = (status: RemoteMediaSlotStatus) => {
      updateRemoteMediaSlot(source, (slot) => (
        slot.trackId === track.id
          ? { ...slot, status }
          : slot
      ));
    };

    const handleMute = () => {
      const lastIncomingState = lastIncomingMediaStateRef.current[source];
      if (lastIncomingState?.state === "ended" || lastIncomingState?.state === "off") {
        syncStatus("stopping");
        return;
      }
      syncStatus(track.readyState === "live" ? "starting" : "ended");
    };

    const handleUnmute = () => {
      updateRemoteMediaSlot(source, (slot) => (
        slot.trackId === track.id
          ? {
              ...slot,
              status: "live",
              signaledActivity:
                lastIncomingMediaStateRef.current[source]?.activity ?? slot.signaledActivity,
              lastPacketAt: performance.now(),
            }
          : slot
      ));
    };

    const handleEnded = () => {
      updateRemoteMediaSlot(source, (slot) => (
        slot.trackId === track.id
          ? { ...slot, status: "ended" }
          : slot
      ));
    };

    remoteTrackLifecycleCleanupRef.current.set(
      track.id,
      bindTrackLifecycle(track, { onMute: handleMute, onUnmute: handleUnmute, onEnded: handleEnded })
    );

    if (isRemoteTrackSignalingLive(track)) {
      handleUnmute();
    } else if (track.readyState !== "live") {
      handleEnded();
    }
  }, [
    clearRemoteTrackLifecycleBinding,
    lastIncomingMediaStateRef,
    pendingReplacementTrackRef,
    remoteTrackLifecycleCleanupRef,
    updateRemoteMediaSlot,
  ]);

  const ingestRemoteVideoTrack = useCallback((params: {
    callId: string;
    receiver: RTCRtpReceiver;
    transceiver?: RTCRtpTransceiver | null;
    resolvedSlotSource?: "camera" | "screen";
  }) => {
    const track = params.receiver.track;
    if (track?.readyState !== "live") {
      debugCallMedia("ingest-skip-not-live", {
        callId: params.callId,
        trackId: track?.id ?? null,
        readyState: track?.readyState ?? null,
      });
      return;
    }

    const slotSource = params.resolvedSlotSource ?? resolveRemoteReceiverSlotSource(params.transceiver);
    const oppositeSource = getOppositeRemoteMediaSource(slotSource);
    const currentSlot = selectRemoteMediaSlot(
      slotSource,
      remoteCameraSlotRef.current,
      remoteScreenSlotRef.current
    );
    const oppositeSlot = selectRemoteMediaSlot(
      oppositeSource,
      remoteCameraSlotRef.current,
      remoteScreenSlotRef.current
    );

    const existingBinding = currentSlot.trackId
      ? remoteReceiverSlotBindingsRef.current.get(currentSlot.trackId) ?? null
      : null;
    const isSourceSwitch = currentSlot.trackId && detectSourceSwitch({
      existingBinding: existingBinding ?? null,
      newBinding: slotSource,
      sameMid: params.transceiver?.mid === currentSlot.mid,
    });

    if (oppositeSlot.trackId === track.id) {
      clearRemoteSlotForReassignment({
        source: oppositeSource,
        slot: oppositeSlot,
        clearRemoteTrackLifecycleBinding,
        commitRemoteMediaSlot,
      });
      debugCallMedia("slot-reassigned", {
        callId: params.callId,
        trackId: track.id,
        from: oppositeSource,
        to: slotSource,
        transceiverMid: params.transceiver?.mid ?? null,
        wasSourceSwitch: isSourceSwitch,
      });
    }

    if (currentSlot.trackId && currentSlot.trackId !== track.id) {
      clearRemoteTrackLifecycleBinding(currentSlot.trackId);
    }

    const targetStream = resolveTargetStreamForRemoteTrack(
      currentSlot,
      oppositeSlot,
      track
    );
    if (oppositeSlot.trackId === track.id && oppositeSlot.stream === targetStream) {
      clearRemoteSlotForReassignment({
        source: oppositeSource,
        slot: oppositeSlot,
        clearRemoteTrackLifecycleBinding,
        commitRemoteMediaSlot,
      });
    }

    syncTargetStreamVideoTrack(targetStream, track);

    bindRemoteVideoTrackLifecycle(slotSource, track);

    const incomingHint = lastIncomingMediaStateRef.current[slotSource];
    const hint: IncomingMediaStateHint = incomingHint
      ? toIncomingMediaStateHint({
          state: incomingHint.state as "on" | "off" | "ended",
          activity: incomingHint.activity,
          reason: incomingHint.reason,
          mid: incomingHint.mid,
        })
      : { signaledStopping: false, signaledEnded: false, activity: "active", reason: null, mid: null };

    const initialStatus = resolveInitialRemoteTrackStatus(track, hint);

    commitRemoteMediaSlot(slotSource, {
      source: slotSource,
      trackId: track.id,
      stream: targetStream,
      status: initialStatus,
      lastFrameAt: currentSlot.trackId === track.id ? currentSlot.lastFrameAt : 0,
      lastPacketAt: currentSlot.trackId === track.id ? currentSlot.lastPacketAt : 0,
      mid: params.transceiver?.mid ?? null,
      signaledActivity: hint.activity,
    });

    debugCallMedia("slot-bound", {
      callId: params.callId,
      source: slotSource,
      trackId: track.id,
      mid: params.transceiver?.mid ?? null,
      muted: track.muted,
      readyState: track.readyState,
      initialStatus,
      wasSourceSwitch: isSourceSwitch,
    });
  }, [
    bindRemoteVideoTrackLifecycle,
    clearRemoteTrackLifecycleBinding,
    commitRemoteMediaSlot,
    debugCallMedia,
    lastIncomingMediaStateRef,
    remoteCameraSlotRef,
    remoteReceiverSlotBindingsRef,
    remoteScreenSlotRef,
    resolveRemoteReceiverSlotSource,
  ]);

  return {
    clearRemoteTrackLifecycleBinding,
    clearRemoteMediaSlot,
    resolveRemoteReceiverSlotSource,
    bindRemoteVideoTrackLifecycle,
    ingestRemoteVideoTrack,
  };
}
