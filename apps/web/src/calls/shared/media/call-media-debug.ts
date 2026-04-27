/**
 * call-media-debug — shared call media debug utilities
 *
 * Owns: the debug-flag key, flag read/write helpers, media snapshot utilities,
 * and gated logging functions used across the call runtime.
 *
 * The key CALL_MEDIA_DEBUG_ENABLED_KEY is the single source of truth for the
 * call media debug flag. All other modules (group-call logger, DevTools panel)
 * must import it from here rather than defining their own copies.
 */
import { logger } from "@/lib/logger.js";

export const CALL_MEDIA_DEBUG_ENABLED_KEY = "seclettr.dev.call-media-debug.enabled.v1";

export function snapshotTrack(track: MediaStreamTrack | null | undefined): Record<string, unknown> | null {
  if (!track) return null;
  return {
    id: track.id,
    kind: track.kind,
    label: track.label,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
  };
}

export function snapshotVideoElement(element: HTMLVideoElement | null): Record<string, unknown> {
  if (!element) {
    return {
      mounted: false,
    };
  }
  return {
    mounted: true,
    paused: element.paused,
    readyState: element.readyState,
    currentTime: element.currentTime,
    videoWidth: element.videoWidth,
    videoHeight: element.videoHeight,
    hasSrcObject: Boolean(element.srcObject),
  };
}

export function readDecodedFrameCount(element: HTMLVideoElement): number | null {
  if (typeof element.getVideoPlaybackQuality === "function") {
    const quality = element.getVideoPlaybackQuality();
    if (Number.isFinite(quality.totalVideoFrames)) {
      return quality.totalVideoFrames;
    }
  }
  const legacyElement = element as HTMLVideoElement & { webkitDecodedFrameCount?: number };
  if (typeof legacyElement.webkitDecodedFrameCount === "number" && Number.isFinite(legacyElement.webkitDecodedFrameCount)) {
    return legacyElement.webkitDecodedFrameCount;
  }
  return null;
}

export function readCallMediaDebugEnabled(): boolean {
  if (!import.meta.env.DEV || globalThis.window === undefined) {
    return false;
  }
  return localStorage.getItem(CALL_MEDIA_DEBUG_ENABLED_KEY) === "1";
}

export function writeCallMediaDebugEnabled(enabled: boolean): void {
  if (globalThis.window === undefined) {
    return;
  }
  localStorage.setItem(CALL_MEDIA_DEBUG_ENABLED_KEY, enabled ? "1" : "0");
}

/**
 * Logs a warning that is suppressed unless the call media debug flag is on.
 * Safe to call from shared modules (frame-crypto, SFU) that need conditional logging
 * without depending on runtime-specific logger wrappers.
 */
export function logCallMediaWarn(message: string, ...details: unknown[]): void {
  if (!readCallMediaDebugEnabled()) return;
  logger.warn(message, ...details);
}

/**
 * Logs an error unconditionally. Errors are always surfaced regardless of the debug flag
 * so that frame-crypto failures and pipeline errors are never silently swallowed.
 */
export function logCallMediaError(message: string, ...details: unknown[]): void {
  logger.error(message, ...details);
}
