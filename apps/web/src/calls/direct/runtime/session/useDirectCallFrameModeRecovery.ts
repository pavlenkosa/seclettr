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
  | "setActive"
  | "configureDirectCallFrameCrypto"
  | "pushNotice"
  | "t"
  | "frameModeRecoveryTimerRef"
  | "frameModeRecoveryAttemptedCallIdRef"
> {}

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
  remoteCameraSlot,
  remoteCameraStream,
  remoteScreenReady,
  remoteScreenSlot,
  remoteScreenStream,
  remoteVideoReady,
}: {
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
    })
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

    if (!shouldAttemptFrameModeRecovery({
      remoteCameraSlot,
      remoteCameraStream: remoteCameraStreamRef.current,
      remoteScreenReady,
      remoteScreenSlot,
      remoteScreenStream: remoteScreenStreamRef.current,
      remoteVideoReady,
    })) {
      return;
    }

    const callId = active.callId;
    const peerUserId = active.peerUserId;
    const peerDeviceId = active.peerDeviceId;
    frameModeRecoveryAttemptedCallIdRef.current = callId;
    frameModeRecoveryTimerRef.current = globalThis.window.setTimeout(() => {
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
    pushNotice,
    remoteCameraSlot,
    remoteCameraStreamRef,
    remoteScreenReady,
    remoteScreenSlot,
    remoteScreenStreamRef,
    remoteVideoReady,
    t,
  ]);
}
