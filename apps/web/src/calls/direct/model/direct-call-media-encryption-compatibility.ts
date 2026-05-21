/**
 * direct-call-media-encryption-compatibility owns only the local browser/runtime
 * policy for whether direct calls may attempt `frame-v1` at all.
 *
 * It does not own offer/answer negotiation math, live-call recovery, or any
 * protocol / WebSocket contracts.
 */

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
}

export type DirectCallFrameCompatibilityReason = "ios-webkit-browser";

export interface DirectCallFrameCompatibilityPolicy {
  allowFrameMode: boolean;
  reason: DirectCallFrameCompatibilityReason | null;
}

export interface DirectCallFrameCompatibilityContext {
  userAgent?: string | null;
  isNativePlatform?: boolean;
}

function resolveCurrentCompatibilityContext(): DirectCallFrameCompatibilityContext {
  const userAgent = globalThis.navigator?.userAgent ?? null;
  let isNativePlatform = false;

  if (globalThis.window !== undefined) {
    const cap = (globalThis.window as unknown as Record<string, unknown>).Capacitor as CapacitorBridge | undefined;
    isNativePlatform = typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
  }

  return {
    userAgent,
    isNativePlatform,
  };
}

function isIosWebKitBrowser(userAgent: string): boolean {
  const normalized = userAgent.trim().toLowerCase();
  if (!normalized) return false;

  const isIosMobileUa =
    /iphone|ipad|ipod/.test(normalized) ||
    (/macintosh/.test(normalized) && /mobile\//.test(normalized));
  if (!isIosMobileUa) {
    return false;
  }

  return /applewebkit/.test(normalized);
}

export function resolveDirectCallFrameCompatibilityPolicy(
  context: DirectCallFrameCompatibilityContext = resolveCurrentCompatibilityContext()
): DirectCallFrameCompatibilityPolicy {
  if (context.isNativePlatform) {
    return { allowFrameMode: true, reason: null };
  }

  const userAgent = context.userAgent ?? "";
  if (isIosWebKitBrowser(userAgent)) {
    return {
      allowFrameMode: false,
      reason: "ios-webkit-browser",
    };
  }

  return { allowFrameMode: true, reason: null };
}
