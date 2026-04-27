import { logger } from "@/lib/logger.js";
import { CALL_MEDIA_DEBUG_ENABLED_KEY } from "@/calls/shared/media/call-media-debug";

function isGroupCallDebugLoggingEnabled(): boolean {
  if (!import.meta.env.DEV || globalThis.window === undefined) {
    return false;
  }

  try {
    return globalThis.localStorage.getItem(CALL_MEDIA_DEBUG_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function logGroupCallWarn(message: string, ...details: unknown[]): void {
  if (!isGroupCallDebugLoggingEnabled()) {
    return;
  }
  logger.warn(message, ...details);
}

export function logGroupCallInfo(message: string, ...details: unknown[]): void {
  if (!isGroupCallDebugLoggingEnabled()) {
    return;
  }
  logger.info(message, ...details);
}

// Errors are always logged regardless of the debug flag so that frame-crypto
// failures, consumer consume errors, and signalling problems are never silently
// swallowed in production.
export function logGroupCallError(message: string, ...details: unknown[]): void {
  logger.error(message, ...details);
}
