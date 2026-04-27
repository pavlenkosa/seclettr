import type { WsServerMessage } from "@seclettr/protocol";
import type { CallSession, CallSessionStore } from "./call-routing-state.js";

type HangupMessage = Extract<WsServerMessage, { type: "call.hangup" }>;

type RouteToDevice = (deviceId: string, msg: HangupMessage) => Promise<void>;
type RouteToDevices = (deviceIds: string[], msg: HangupMessage) => Promise<void>;
type LoadUserDeviceIds = (userId: string) => Promise<string[]>;

export type DirectCallTerminationResult =
  | { ok: false; reason: "not_found" | "forbidden" }
  | {
      ok: true;
      session: CallSession;
      terminatedByRole: "caller" | "callee";
      notifiedDeviceIds: string[];
    };

function uniqueDeviceIds(deviceIds: string[]): string[] {
  return [...new Set(deviceIds)];
}

function isTrackedDirectCallParticipant(deviceId: string, session: CallSession): boolean {
  return deviceId === session.callerDeviceId || deviceId === session.calleeDeviceId;
}

async function getCalleeTargets(
  session: CallSession,
  loadUserDeviceIds: LoadUserDeviceIds
): Promise<string[]> {
  if (session.calleeDeviceId) return [session.calleeDeviceId];
  if (session.calleeDeviceIds.length > 0) return session.calleeDeviceIds;
  return loadUserDeviceIds(session.calleeUserId);
}

export async function terminateDirectCallSession(params: {
  callId: string;
  actorDeviceId?: string | null;
  callSessionStore: CallSessionStore;
  loadUserDeviceIds: LoadUserDeviceIds;
  routeToDevice: RouteToDevice;
  routeToDevices: RouteToDevices;
}): Promise<DirectCallTerminationResult> {
  const session = await params.callSessionStore.get(params.callId);
  if (!session) {
    return { ok: false, reason: "not_found" };
  }

  if (params.actorDeviceId && !isTrackedDirectCallParticipant(params.actorDeviceId, session)) {
    return { ok: false, reason: "forbidden" };
  }

  await params.callSessionStore.delete(params.callId);

  const hangupPayload: HangupMessage = {
    type: "call.hangup",
    callId: params.callId,
  };

  if (!params.actorDeviceId || params.actorDeviceId === session.callerDeviceId) {
    const notifiedDeviceIds = uniqueDeviceIds(
      await getCalleeTargets(session, params.loadUserDeviceIds)
    );
    await params.routeToDevices(notifiedDeviceIds, hangupPayload);
    return {
      ok: true,
      session,
      terminatedByRole: "caller",
      notifiedDeviceIds,
    };
  }

  await params.routeToDevice(session.callerDeviceId, hangupPayload);
  return {
    ok: true,
    session,
    terminatedByRole: "callee",
    notifiedDeviceIds: [session.callerDeviceId],
  };
}
