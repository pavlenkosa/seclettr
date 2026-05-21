/**
 * useDirectCallFrameModeRecovery — frame encryption mode recovery after call setup.
 *
 * Monitors the established call for a mismatch between the negotiated encryption
 * mode and the actual frame-crypto state (e.g., frame-v1 was negotiated but the
 * crypto bridge failed to activate). On detection, attempts a graceful fallback
 * to transport encryption; if that also fails in strict mode, tears down the call.
 *
 * The recovery timer fires once per call ID — subsequent retries are suppressed
 * via frameModeRecoveryAttemptedCallIdRef to prevent loops.
 */
import { useEffect } from "react";
import type { RemoteMediaSlot } from "@/calls/direct/model/call-media-slots";
import type { CallMediaSource, LastIncomingMediaState } from "@/calls/direct/model/call-media-state";
import type { UseDirectCallSessionLifecycleOptions } from "./direct-call-session-lifecycle-shared";

interface UseDirectCallFrameModeRecoveryOptions extends Pick<
  UseDirectCallSessionLifecycleOptions,
  | "active"
  | "activeRef"
  | "callSecurityMode"
  | "remoteVideoReady"
  | "remoteScreenReady"
  | "remoteCameraSlot"
  | "remoteScreenSlot"
  | "remoteCameraStreamRef"
  | "remoteScreenStreamRef"
  | "remoteAudioRef"
  | "remoteAudioStreamRef"
  | "lastIncomingMediaStateRef"
  | "setActive"
  | "configureDirectCallFrameCrypto"
  | "pushNotice"
  | "t"
  | "frameModeRecoveryTimerRef"
  | "frameModeRecoveryAttemptedCallIdRef"
> {}

interface AudioPlaybackSnapshot {
  readonly currentTime: number;
}

async function runFrameModeRecoveryFallback({
  activeRef,
  callId,
  configureDirectCallFrameCrypto,
  peerDeviceId,
  peerUserId,
  pushNotice,
  setActive,
  t,
}: Pick<
  UseDirectCallFrameModeRecoveryOptions,
  | "activeRef"
  | "configureDirectCallFrameCrypto"
  | "pushNotice"
  | "setActive"
  | "t"
> & {
  readonly callId: string;
  readonly peerDeviceId: string;
  readonly peerUserId: string;
}) {
  const current = activeRef.current;
  if (current?.callId !== callId || current?.mediaEncryptionMode !== "frame-v1") {
    return;
  }
  const fallbackReady = await configureDirectCallFrameCrypto({
    callId,
    mediaEncryptionMode: "transport",
    peerUserId,
    peerDeviceId,
  });
  if (!fallbackReady) {
    return;
  }
  setActive((prev) => (
    prev?.callId === callId
      ? { ...prev, mediaEncryptionMode: "transport" }
      : prev
  ));
  pushNotice({ kind: "info", message: t("callSecurity.frameFallbackTransport") });
}

function hasLiveVideoTrack(stream: MediaStream | null): boolean {
  return Boolean(stream?.getVideoTracks().some((track) => (
    track.readyState === "live" &&
    track.enabled !== false
  )));
}

function hasLiveAudioTrack(stream: MediaStream | null): boolean {
  return Boolean(stream?.getAudioTracks().some((track) => (
    track.readyState === "live" &&
    track.enabled !== false
  )));
}

function captureAudioPlaybackSnapshot(
  audioElement: HTMLAudioElement | null,
  stream: MediaStream | null
): AudioPlaybackSnapshot | null {
  if (!audioElement || !stream || audioElement.srcObject !== stream) {
    return null;
  }

  return {
    currentTime: Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0,
  };
}

function isRemoteAudioExpected(
  lastIncomingMediaState: Record<CallMediaSource, LastIncomingMediaState | null>
): boolean {
  const micState = lastIncomingMediaState.mic;
  if (!micState) {
    return true;
  }

  return micState.state === "on";
}

function isAudioPlaybackStalled(params: {
  audioElement: HTMLAudioElement | null;
  stream: MediaStream | null;
  initialSnapshot: AudioPlaybackSnapshot | null;
}): boolean {
  if (!hasLiveAudioTrack(params.stream)) {
    return false;
  }

  const audioElement = params.audioElement;
  if (!audioElement || !params.stream || audioElement.srcObject !== params.stream) {
    return true;
  }

  if (audioElement.error || audioElement.ended) {
    return true;
  }

  const hasReadableData = audioElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  const baselineTime = params.initialSnapshot?.currentTime ?? 0;
  const madeTimelineProgress = audioElement.currentTime > baselineTime + 0.05;
  if (!hasReadableData) {
    return true;
  }

  return audioElement.paused && !madeTimelineProgress;
}

function isFrameModeRecoveryCandidate({
  remoteReady,
  slot,
  stream,
}: {
  readonly remoteReady: boolean;
  readonly slot: RemoteMediaSlot;
  readonly stream: MediaStream | null;
}): boolean {
  if (remoteReady) {
    return false;
  }
  if (!hasLiveVideoTrack(stream)) {
    return false;
  }
  if (slot.signaledActivity === "inactive") {
    return false;
  }
  if (slot.status === "inactive" || slot.status === "ended" || slot.status === "stopping") {
    return false;
  }

  // A receiver track alone is not proof that remote visual media is expected:
  // browsers can expose negotiated video tracks while the peer camera is off.
  // Recover only when signaling or RTP telemetry says visual media is active.
  if (slot.lastFrameAt > 0) {
    return false;
  }
  return slot.lastPacketAt > 0 || (
    slot.signaledActivity === "active" &&
    slot.status === "live"
  );
}

function shouldAttemptFrameModeRecovery({
  lastIncomingMediaState,
  remoteAudioElement,
  remoteAudioSnapshot,
  remoteAudioStream,
  remoteCameraSlot,
  remoteCameraStream,
  remoteScreenReady,
  remoteScreenSlot,
  remoteScreenStream,
  remoteVideoReady,
}: {
  readonly lastIncomingMediaState: Record<CallMediaSource, LastIncomingMediaState | null>;
  readonly remoteAudioElement: HTMLAudioElement | null;
  readonly remoteAudioSnapshot: AudioPlaybackSnapshot | null;
  readonly remoteAudioStream: MediaStream | null;
  readonly remoteCameraSlot: RemoteMediaSlot;
  readonly remoteCameraStream: MediaStream | null;
  readonly remoteScreenReady: boolean;
  readonly remoteScreenSlot: RemoteMediaSlot;
  readonly remoteScreenStream: MediaStream | null;
  readonly remoteVideoReady: boolean;
}): boolean {
  return (
    isFrameModeRecoveryCandidate({
      remoteReady: remoteVideoReady,
      slot: remoteCameraSlot,
      stream: remoteCameraStream,
    }) ||
    isFrameModeRecoveryCandidate({
      remoteReady: remoteScreenReady,
      slot: remoteScreenSlot,
      stream: remoteScreenStream,
    }) ||
    (
      isRemoteAudioExpected(lastIncomingMediaState) &&
      isAudioPlaybackStalled({
        audioElement: remoteAudioElement,
        stream: remoteAudioStream,
        initialSnapshot: remoteAudioSnapshot,
      })
    )
  );
}

export function useDirectCallFrameModeRecovery({
  active,
  activeRef,
  callSecurityMode,
  remoteVideoReady,
  remoteScreenReady,
  remoteCameraSlot,
  remoteScreenSlot,
  remoteCameraStreamRef,
  remoteScreenStreamRef,
  remoteAudioRef,
  remoteAudioStreamRef,
  lastIncomingMediaStateRef,
  setActive,
  configureDirectCallFrameCrypto,
  pushNotice,
  t,
  frameModeRecoveryTimerRef,
  frameModeRecoveryAttemptedCallIdRef,
}: UseDirectCallFrameModeRecoveryOptions) {
  useEffect(() => {
    if (frameModeRecoveryTimerRef.current) {
      clearTimeout(frameModeRecoveryTimerRef.current);
      frameModeRecoveryTimerRef.current = null;
    }

    if (active?.state !== "active") {
      return;
    }
    if (callSecurityMode === "strict") {
      return;
    }
    if (active.mediaEncryptionMode !== "frame-v1") {
      return;
    }
    if (!active.peerUserId || !active.peerDeviceId) {
      return;
    }
    if (frameModeRecoveryAttemptedCallIdRef.current === active.callId) {
      return;
    }

    const callId = active.callId;
    const peerUserId = active.peerUserId;
    const peerDeviceId = active.peerDeviceId;
    const remoteAudioSnapshot = captureAudioPlaybackSnapshot(
      remoteAudioRef.current,
      remoteAudioStreamRef.current
    );
    frameModeRecoveryAttemptedCallIdRef.current = callId;
    frameModeRecoveryTimerRef.current = globalThis.window.setTimeout(() => {
      if (!shouldAttemptFrameModeRecovery({
        lastIncomingMediaState: lastIncomingMediaStateRef.current,
        remoteAudioElement: remoteAudioRef.current,
        remoteAudioSnapshot,
        remoteAudioStream: remoteAudioStreamRef.current,
        remoteCameraSlot,
        remoteCameraStream: remoteCameraStreamRef.current,
        remoteScreenReady,
        remoteScreenSlot,
        remoteScreenStream: remoteScreenStreamRef.current,
        remoteVideoReady,
      })) {
        return;
      }

      void runFrameModeRecoveryFallback({
        activeRef,
        callId,
        configureDirectCallFrameCrypto,
        peerDeviceId,
        peerUserId,
        pushNotice,
        setActive,
        t,
      });
    }, 3500);

    return () => {
      if (frameModeRecoveryTimerRef.current) {
        clearTimeout(frameModeRecoveryTimerRef.current);
        frameModeRecoveryTimerRef.current = null;
      }
    };
  }, [
    active,
    activeRef,
    callSecurityMode,
    setActive,
    configureDirectCallFrameCrypto,
    frameModeRecoveryAttemptedCallIdRef,
    frameModeRecoveryTimerRef,
    lastIncomingMediaStateRef,
    pushNotice,
    remoteAudioRef,
    remoteAudioStreamRef,
    remoteCameraSlot,
    remoteCameraStreamRef,
    remoteScreenReady,
    remoteScreenSlot,
    remoteScreenStreamRef,
    remoteVideoReady,
    t,
  ]);
}
