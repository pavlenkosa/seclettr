/**
 * call-signal-guard — incoming signal sender verification utilities for 1:1 calls.
 *
 * Owns:
 *   - isCurrentDirectCallContext — generic call-ID + optional connection identity check;
 *     used before applying any signal to confirm it belongs to the current active call
 *   - resolveExpectedDirectCallSignalSender — validates that the signal sender's userId
 *     and deviceId match the known peer; returns a typed result with a mismatch reason
 *     so callers can log the exact rejection cause
 *   - updateDirectCallIfCurrent — immutable conditional update helper: applies the
 *     updater only when callId matches, otherwise returns the original value unchanged
 *
 * Does not own signal routing, WebSocket ingress, or React state. These are pure
 * guard functions invoked at the boundary where signals enter the runtime.
 */
import type { ActiveCall } from "./direct-call-types";

export function isCurrentDirectCallContext<TConnection>(params: {
  activeCallId: string | null | undefined;
  expectedCallId: string;
  currentConnection?: TConnection | null;
  expectedConnection?: TConnection | null;
}): boolean {
  const {
    activeCallId,
    expectedCallId,
    currentConnection,
    expectedConnection,
  } = params;

  if (activeCallId !== expectedCallId) {
    return false;
  }

  if (
    expectedConnection !== undefined &&
    currentConnection !== undefined &&
    currentConnection !== expectedConnection
  ) {
    return false;
  }

  return true;
}

type DirectCallSignalSenderMismatchReason =
  | "call_mismatch"
  | "peer_user_mismatch"
  | "peer_device_mismatch";

interface ResolveExpectedDirectCallSignalSenderInput {
  active: Pick<ActiveCall, "callId" | "peerDeviceId" | "peerUserId"> | null;
  callId: string;
  senderUserId?: string | null;
  senderDeviceId?: string | null;
}

type DirectCallSignalSenderExpectationResult =
  | { ok: true }
  | { ok: false; reason: DirectCallSignalSenderMismatchReason };

export function resolveExpectedDirectCallSignalSender({
  active,
  callId,
  senderUserId = null,
  senderDeviceId = null,
}: ResolveExpectedDirectCallSignalSenderInput): DirectCallSignalSenderExpectationResult {
  if (active?.callId !== callId) {
    return { ok: false, reason: "call_mismatch" };
  }

  if (senderUserId && active.peerUserId && senderUserId !== active.peerUserId) {
    return { ok: false, reason: "peer_user_mismatch" };
  }

  if (senderDeviceId && active.peerDeviceId && senderDeviceId !== active.peerDeviceId) {
    return { ok: false, reason: "peer_device_mismatch" };
  }

  return { ok: true };
}

export function updateDirectCallIfCurrent<TCall extends Pick<ActiveCall, "callId">>(
  active: TCall | null,
  callId: string,
  update: (current: TCall) => TCall
): TCall | null {
  if (!active || active.callId !== callId) {
    return active;
  }

  return update(active);
}
