import { useCallback } from "react";
import { shouldClearSlotFromHint } from "@/calls/direct/model/call-media-state";
import type { IncomingMediaStateHint } from "@/calls/direct/model/call-media-state";
import type {
  DirectCallRemoteMediaHintsOptions,
  DirectCallRemoteMediaHintsResult,
} from "./direct-call-remote-media-runtime-shared";

export function useDirectCallRemoteMediaHints({
  debugCallMedia,
  remoteCameraSlotRef,
  remoteScreenSlotRef,
  updateRemoteMediaSlot,
  clearRemoteMediaSlot,
}: DirectCallRemoteMediaHintsOptions): DirectCallRemoteMediaHintsResult {
  const processIncomingMediaStateHint = useCallback((
    source: "camera" | "screen",
    hint: IncomingMediaStateHint,
    _trackId: string | null,
    trackEnded: boolean
  ) => {
    const slot = source === "camera" ? remoteCameraSlotRef.current : remoteScreenSlotRef.current;

    updateRemoteMediaSlot(source, (current) => ({
      ...current,
      signaledActivity: hint.activity,
      mid: hint.mid ?? current.mid,
    }));

    const shouldClear = shouldClearSlotFromHint({
      slotHasTrack: Boolean(slot.trackId && slot.stream),
      trackEnded,
      hint,
    });

    if (shouldClear) {
      debugCallMedia("hint-triggered-clear", {
        source,
        trackId: slot.trackId,
        hintSignaledEnded: hint.signaledEnded,
        hintSignaledStopping: hint.signaledStopping,
        trackEnded,
      });
      clearRemoteMediaSlot(source, hint.signaledEnded ? "ended" : "inactive", slot.trackId);
      return;
    }

    if (hint.signaledEnded && slot.trackId && !trackEnded) {
      updateRemoteMediaSlot(source, (current) => ({
        ...current,
        status: "stopping",
      }));
    }
  }, [
    clearRemoteMediaSlot,
    debugCallMedia,
    remoteCameraSlotRef,
    remoteScreenSlotRef,
    updateRemoteMediaSlot,
  ]);

  const updateSlotProgress = useCallback((
    source: "camera" | "screen",
    progress: { lastFrameAt: number; lastPacketAt: number }
  ) => {
    updateRemoteMediaSlot(source, (slot) => ({
      ...slot,
      lastFrameAt: progress.lastFrameAt || slot.lastFrameAt,
      lastPacketAt: progress.lastPacketAt || slot.lastPacketAt,
    }));
  }, [updateRemoteMediaSlot]);

  return {
    processIncomingMediaStateHint,
    updateSlotProgress,
  };
}
