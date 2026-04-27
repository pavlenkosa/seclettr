import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import { wsClient } from "@/lib/websocket";
import {
  isSameOutgoingCallMediaState,
  resolveOutgoingCallMediaState,
  type CallMediaSource,
  type CallMediaState,
  type CallMediaStateReason,
  type OutgoingCallMediaStateSnapshot,
} from "@/calls/direct/model/call-media-state";
import type {
  DirectCallMediaControlsOptions,
  DirectCallOutgoingMediaStateControls,
} from "./direct-call-media-controls-shared";
import { bindTrackLifecycle } from "./direct-call-pc-utils";

interface UseDirectCallOutgoingMediaStateOptions extends Pick<
  DirectCallMediaControlsOptions,
  | "activeRef"
  | "localStreamRef"
  | "cameraTransceiverRef"
  | "cameraSenderRef"
  | "screenShareTrackRef"
  | "screenShareSenderRef"
  | "screenShareTransceiverRef"
  | "callMediaStateSeqRef"
  | "localMediaStateRevisionRef"
  | "debugCallMedia"
> {}

export function useDirectCallOutgoingMediaState({
  activeRef,
  localStreamRef,
  cameraTransceiverRef,
  cameraSenderRef,
  screenShareTrackRef,
  screenShareSenderRef,
  screenShareTransceiverRef,
  callMediaStateSeqRef,
  localMediaStateRevisionRef,
  debugCallMedia,
}: UseDirectCallOutgoingMediaStateOptions): DirectCallOutgoingMediaStateControls {
  const outgoingVisualMediaStateCleanupRef = useRef<Record<"camera" | "screen", (() => void) | null>>({
    camera: null,
    screen: null,
  });
  const outgoingVisualMediaTrackIdRef = useRef<Record<"camera" | "screen", string | null>>({
    camera: null,
    screen: null,
  });
  const lastPublishedOutgoingMediaStateRef = useRef<Record<CallMediaSource, OutgoingCallMediaStateSnapshot | null>>({
    camera: null,
    screen: null,
    mic: null,
  });

  const resolveOutgoingMediaStateMid = useCallback((source: CallMediaSource): string | null => {
    if (source === "camera") {
      return cameraTransceiverRef.current?.mid ?? null;
    }
    if (source === "screen") {
      return screenShareTransceiverRef.current?.mid ?? null;
    }
    return null;
  }, [cameraTransceiverRef, screenShareTransceiverRef]);

  const resolveOutgoingMediaTrack = useCallback((source: CallMediaSource): MediaStreamTrack | null => {
    if (source === "camera") {
      return (
        cameraSenderRef.current?.track ??
        localStreamRef.current?.getVideoTracks()[0] ??
        null
      );
    }
    if (source === "screen") {
      return screenShareSenderRef.current?.track ?? screenShareTrackRef.current ?? null;
    }
    return localStreamRef.current?.getAudioTracks()[0] ?? null;
  }, [
    cameraSenderRef,
    localStreamRef,
    screenShareSenderRef,
    screenShareTrackRef,
  ]);

  const clearPublishedOutgoingMediaState = useCallback((source?: CallMediaSource) => {
    if (source) {
      lastPublishedOutgoingMediaStateRef.current[source] = null;
      return;
    }
    lastPublishedOutgoingMediaStateRef.current = {
      camera: null,
      screen: null,
      mic: null,
    };
  }, []);

  const clearOutgoingVisualMediaStateTrackBinding = useCallback((source: "camera" | "screen") => {
    outgoingVisualMediaStateCleanupRef.current[source]?.();
    outgoingVisualMediaStateCleanupRef.current[source] = null;
    outgoingVisualMediaTrackIdRef.current[source] = null;
  }, []);

  const clearOutgoingMediaStateTrackBindings = useCallback(() => {
    clearOutgoingVisualMediaStateTrackBinding("camera");
    clearOutgoingVisualMediaStateTrackBinding("screen");
    clearPublishedOutgoingMediaState();
  }, [clearOutgoingVisualMediaStateTrackBinding, clearPublishedOutgoingMediaState]);

  useEffect(() => clearOutgoingMediaStateTrackBindings, [clearOutgoingMediaStateTrackBindings]);

  const sendCallMediaState = useCallback((
    source: CallMediaSource,
    state: CallMediaState,
    callIdOverride?: string,
    reason?: CallMediaStateReason
  ) => {
    const callId = callIdOverride ?? activeRef.current?.callId;
    if (!callId) return;
    const track = resolveOutgoingMediaTrack(source);
    const resolvedState = resolveOutgoingCallMediaState({
      source,
      track,
      explicitState: state,
    });
    const mid = resolveOutgoingMediaStateMid(source);
    const nextSnapshot: OutgoingCallMediaStateSnapshot = {
      callId,
      source,
      state: resolvedState.state,
      activity: resolvedState.activity,
      mid,
      trackId: track?.id ?? null,
      reason: reason ?? null,
    };
    if (isSameOutgoingCallMediaState(
      lastPublishedOutgoingMediaStateRef.current[source],
      nextSnapshot
    )) {
      return;
    }
    callMediaStateSeqRef.current += 1;
    localMediaStateRevisionRef.current[source] += 1;
    lastPublishedOutgoingMediaStateRef.current[source] = nextSnapshot;
    debugCallMedia("media-state-out", {
      callId,
      source,
      state: resolvedState.state,
      activity: resolvedState.activity,
      mid,
      trackId: track?.id ?? null,
      seq: callMediaStateSeqRef.current,
      streamRevision: localMediaStateRevisionRef.current[source],
      reason: reason ?? null,
    });
    wsClient.send({
      type: "call.media_state",
      callId,
      source,
      state: resolvedState.state,
      activity: resolvedState.activity,
      mid,
      seq: callMediaStateSeqRef.current,
      streamRevision: localMediaStateRevisionRef.current[source],
      reason,
    });
  }, [
    activeRef,
    callMediaStateSeqRef,
    debugCallMedia,
    localMediaStateRevisionRef,
    resolveOutgoingMediaTrack,
    resolveOutgoingMediaStateMid,
  ]);

  const syncOutgoingVisualMediaStateTrackBindings = useCallback((callIdOverride?: string) => {
    const callId = callIdOverride ?? activeRef.current?.callId;
    for (const source of ["camera", "screen"] as const) {
      const track = resolveOutgoingMediaTrack(source);
      if (!callId || !track) {
        clearOutgoingVisualMediaStateTrackBinding(source);
        continue;
      }
      if (outgoingVisualMediaTrackIdRef.current[source] !== track.id) {
        clearOutgoingVisualMediaStateTrackBinding(source);

        const handleMute = () => {
          sendCallMediaState(source, "on", callId);
        };
        const handleUnmute = () => {
          sendCallMediaState(source, "on", callId);
        };
        const handleEnded = () => {
          clearOutgoingVisualMediaStateTrackBinding(source);
          clearPublishedOutgoingMediaState(source);
          if (activeRef.current?.callId === callId) {
            sendCallMediaState(source, "ended", callId, "track-ended");
          }
        };

        outgoingVisualMediaStateCleanupRef.current[source] = bindTrackLifecycle(track, {
          onMute: handleMute,
          onUnmute: handleUnmute,
          onEnded: handleEnded,
        });
        outgoingVisualMediaTrackIdRef.current[source] = track.id;
      }

      sendCallMediaState(source, "on", callId);
    }
  }, [
    activeRef,
    clearOutgoingVisualMediaStateTrackBinding,
    clearPublishedOutgoingMediaState,
    resolveOutgoingMediaTrack,
    sendCallMediaState,
  ]);

  return {
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding,
  };
}
