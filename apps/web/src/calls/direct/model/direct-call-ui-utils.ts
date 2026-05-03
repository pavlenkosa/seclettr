import type { DirectCallRuntimeState } from "./direct-call-runtime-state";
import { formatCallDuration } from "@/calls/shared/model/call-duration";
import { DirectCallSetupTimeoutError } from "./direct-call-setup-timeouts";

export type DirectCallTranslator = (key: string, params?: Record<string, string | number | undefined>) => string;

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function formatPeerLabel(value: string): string {
  if (!isUuidLike(value)) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function getPeerInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "?";
  if (trimmed.includes(" ")) {
    const parts = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function toMediaErrorMessage(
  error: unknown,
  callType: "audio" | "video",
  t: DirectCallTranslator
): string {
  if (error instanceof DirectCallSetupTimeoutError) {
    if (error.stage === "local-media") {
      return callType === "video"
        ? t("call.error.cameraMicTimeout")
        : t("call.error.micTimeout");
    }
    return t("call.error.setupTimeout");
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return callType === "video"
        ? t("call.error.cameraMicDenied")
        : t("call.error.micDenied");
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return callType === "video"
        ? t("call.error.noCameraMic")
        : t("call.error.noMic");
    }
    if (error.name === "NotReadableError") {
      return t("call.error.deviceInUse");
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return t("call.error.unableStart");
}

export function toScreenShareErrorMessage(error: unknown, t: DirectCallTranslator): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError" || error.name === "SecurityError") {
      return t("call.error.screenDenied");
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return t("call.error.unableScreenShare");
}

export function callStateLabel(
  runtimeState: DirectCallRuntimeState,
  duration: number,
  t: DirectCallTranslator
): string {
  if (
    runtimeState === "active_audio" ||
    runtimeState === "active_video" ||
    runtimeState === "screen_sharing"
  ) {
    return formatCallDuration(duration);
  }
  if (runtimeState === "incoming" || runtimeState === "outgoing") {
    return t("call.state.ringing");
  }
  if (runtimeState === "reconnecting") {
    return t("call.state.reconnecting");
  }
  if (runtimeState === "idle") {
    return "";
  }
  return t("call.state.connecting");
}

export function hasRenderableVideoTrack(
  stream: MediaStream | null,
  options?: { requireEnabled?: boolean; requireUnmuted?: boolean }
): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((track) => (
    track.readyState === "live" &&
    (!options?.requireUnmuted || !track.muted) &&
    (!options?.requireEnabled || track.enabled)
  ));
}

export function clampMinimizedDockPosition<TPosition extends { x: number; y: number }>(
  position: TPosition,
  width: number,
  height: number
): TPosition {
  const margin = 8;
  const maxX = Math.max(margin, globalThis.innerWidth - width - margin);
  const maxY = Math.max(margin, globalThis.innerHeight - height - margin);
  return {
    ...position,
    x: Math.min(maxX, Math.max(margin, position.x)),
    y: Math.min(maxY, Math.max(margin, position.y)),
  };
}

export function clampFloatingPreviewPosition<TPosition extends { x: number; y: number }>(
  position: TPosition,
  width: number,
  height: number
): TPosition {
  return clampMinimizedDockPosition(position, width, height);
}

export function clampFloatingPreviewWidth(width: number): number {
  const minWidth = 92;
  const mobileMaxWidth = Math.round(globalThis.innerWidth * 0.44);
  const desktopMaxWidth = Math.round(globalThis.innerWidth * 0.24);
  const maxWidth = Math.max(
    minWidth,
    Math.min(220, globalThis.innerWidth <= 640 ? mobileMaxWidth : desktopMaxWidth)
  );

  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)));
}
