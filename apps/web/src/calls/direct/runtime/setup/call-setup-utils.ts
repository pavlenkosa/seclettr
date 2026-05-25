/**
 * Shared utilities for direct-call setup flows.
 *
 * Consumed by start-call-flow.ts and accept-call-flow.ts.
 * Do not import React hooks from this file — it must remain a plain module.
 */

import { logger } from "@/lib/logger.js";
import { isCurrentDirectCallLifecycleToken } from "@/calls/direct/model/direct-call-lifecycle";
import type { DirectCallSetupRuntimeOptions } from "./direct-call-setup-shared";

// ---------------------------------------------------------------------------
// Lifecycle guard
// ---------------------------------------------------------------------------

export class DirectCallLifecycleAbortError extends Error {
  constructor() {
    super("Direct call lifecycle token is stale");
  }
}

export const isDirectCallLifecycleAbortError = (
  error: unknown
): error is DirectCallLifecycleAbortError =>
  error instanceof DirectCallLifecycleAbortError;

const abortIfStaleLifecycle = (isCurrent: boolean, onAbort?: () => void) => {
  if (isCurrent) {
    return;
  }
  onAbort?.();
  throw new DirectCallLifecycleAbortError();
};

export const createLifecycleGuard = (params: {
  lifecycleToken: number;
  directCallLifecycleTokenRef: DirectCallSetupRuntimeOptions["directCallLifecycleTokenRef"];
}) => (onAbort?: () => void) => {
  abortIfStaleLifecycle(
    isCurrentDirectCallLifecycleToken(
      params.directCallLifecycleTokenRef.current,
      params.lifecycleToken
    ),
    onAbort
  );
};

// ---------------------------------------------------------------------------
// Media stream helpers
// ---------------------------------------------------------------------------

export const stopMediaStream = (stream: MediaStream | null | undefined) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
};

// ---------------------------------------------------------------------------
// ICE candidates
// ---------------------------------------------------------------------------

export const addIceCandidatesSafely = async (
  pc: RTCPeerConnection,
  candidates: RTCIceCandidateInit[],
  logPrefix: string
) => {
  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      logger.warn(logPrefix, error);
    }
  }
};

export const takePendingIceCandidates = (
  callId: string,
  pendingIceCandidatesRef: DirectCallSetupRuntimeOptions["pendingIceCandidatesRef"]
): RTCIceCandidateInit[] => {
  const pending = pendingIceCandidatesRef.current.get(callId) ?? [];
  pendingIceCandidatesRef.current.delete(callId);
  return pending;
};
