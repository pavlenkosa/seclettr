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
