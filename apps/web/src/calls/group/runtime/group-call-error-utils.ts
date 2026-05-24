/**
 * group-call-error-utils — error-related helpers for the group call runtime.
 *
 * Owns:
 *   - resolveErrorMessage — extracts a human-readable message from ApiError or Error,
 *     falling back to a provided string
 *   - isMediaCaptureError — checks if an error is a known getUserMedia/getDisplayMedia
 *     DOMException name (AbortError, NotAllowedError, etc.)
 *
 * Does not own any React hooks, state, or SFU-specific logic.
 */
import { ApiError } from "@/lib/api";

export function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function isMediaCaptureError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return [
    "AbortError",
    "NotAllowedError",
    "NotFoundError",
    "NotReadableError",
    "OverconstrainedError",
    "SecurityError",
  ].includes(name);
}
