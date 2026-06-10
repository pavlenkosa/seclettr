/**
 * group-call-participant-routing — shared domain rules for group-call
 * participant membership, device targeting, event building, and empty-roster
 * termination.
 *
 * Both the HTTP routes (`routes/calls/index.ts`) and the WebSocket service
 * (`services/websocket.ts`) consume these helpers instead of duplicating
 * the SQL query and event-building logic.
 *
 * Transport-specific delivery (Fastify reply, Redis publishMessage, WS send)
 * stays at the edge — this module owns only the canonical domain rules.
 */
import { query } from "../db/pool.js";
import { publishMessage } from "./redis.js";
import {
  clearGroupCallParticipants,
  listGroupCallParticipants,
} from "./group-call-presence.js";

/* ── Device / membership queries ───────────────────────────────────────── */

export async function loadUserDeviceIds(userId: string): Promise<string[]> {
  const devices = await query<{ id: string }>(
    `SELECT id FROM devices WHERE user_id = $1`,
    [userId]
  );
  return [...new Set(devices.map((device) => device.id))];
}

export async function loadGroupMemberDeviceIds(groupId: string): Promise<string[]> {
  const devices = await query<{ id: string }>(
    `SELECT d.id
     FROM devices d
     INNER JOIN group_members gm ON gm.user_id = d.user_id
     WHERE gm.group_id = $1
       AND gm.removed_at IS NULL`,
    [groupId]
  );
  return [...new Set(devices.map((device) => device.id))];
}

export async function hasActiveGroupMembership(
  groupId: string,
  userId: string
): Promise<boolean> {
  const memberships = await query<{ group_id: string }>(
    `SELECT group_id
     FROM group_members
     WHERE group_id = $1
       AND user_id = $2
       AND removed_at IS NULL`,
    [groupId, userId]
  );
  return memberships.length > 0;
}

export async function loadParticipantDeviceIdsForUsers(
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const devices = await query<{ id: string }>(
    `SELECT id
     FROM devices
     WHERE user_id = ANY($1::uuid[])`,
    [userIds]
  );

  return [...new Set(devices.map((device) => device.id))];
}

export async function filterAllowedGroupMemberDevices(
  groupId: string,
  deviceIds: string[]
): Promise<string[]> {
  const unique = [...new Set(deviceIds)];
  if (unique.length === 0) return [];

  const allowedDevices = await query<{ id: string }>(
    `SELECT d.id
     FROM devices d
     INNER JOIN group_members gm ON gm.user_id = d.user_id
     WHERE gm.group_id = $1
       AND gm.removed_at IS NULL
       AND d.id = ANY($2::uuid[])`,
    [groupId, unique]
  );

  return [...new Set(allowedDevices.map((device) => device.id))];
}

export async function isAllowedGroupMemberDevice(
  groupId: string,
  deviceId: string
): Promise<boolean> {
  const devices = await query<{ id: string }>(
    `SELECT d.id
     FROM devices d
     INNER JOIN group_members gm ON gm.user_id = d.user_id
     WHERE d.id = $1
       AND gm.group_id = $2
       AND gm.removed_at IS NULL`,
    [deviceId, groupId]
  );
  return devices.length > 0;
}

/* ── Active call participant device targeting ──────────────────────────── */

export async function loadActiveGroupCallTargetDeviceIds(
  callId: string,
  groupId: string,
  listGroupCallParticipantDevices: (callId: string) => Promise<string[]>,
  listGroupCallParticipants: (callId: string) => Promise<string[]>
): Promise<string[]> {
  if (await hasDeviceScopedParticipants(callId, listGroupCallParticipantDevices)) {
    const deviceIds = await listGroupCallParticipantDevices(callId);
    if (deviceIds.length > 0) {
      return filterAllowedGroupMemberDevices(groupId, deviceIds);
    }
  }

  const participantUserIds = await listGroupCallParticipants(callId);
  if (participantUserIds.length > 0) {
    const participantDeviceIds = await loadParticipantDeviceIdsForUsers(
      participantUserIds
    );
    return filterAllowedGroupMemberDevices(groupId, participantDeviceIds);
  }

  return loadGroupMemberDeviceIds(groupId);
}

async function hasDeviceScopedParticipants(
  callId: string,
  listGroupCallParticipantDevices: (callId: string) => Promise<string[]>
): Promise<boolean> {
  const deviceIds = await listGroupCallParticipantDevices(callId);
  return deviceIds.length > 0;
}

/* ── Fan-out helpers ───────────────────────────────────────────────────── */

export async function publishGroupCallFanOut(
  groupId: string,
  payload: Omit<Record<string, unknown>, "recipientDeviceId"> & { type: string }
): Promise<void> {
  const deviceIds = await loadGroupMemberDeviceIds(groupId);
  await Promise.all(
    deviceIds.map((deviceId) =>
      publishMessage({
        ...payload,
        recipientDeviceId: deviceId,
      })
    )
  );
}

export async function publishGroupCallFanOutExcludingSender(
  callId: string,
  groupId: string,
  senderDeviceId: string,
  listGroupCallParticipantDevices: (callId: string) => Promise<string[]>,
  listGroupCallParticipants: (callId: string) => Promise<string[]>,
  payload: Record<string, unknown>
): Promise<void> {
  const deviceIds = await loadActiveGroupCallTargetDeviceIds(
    callId,
    groupId,
    listGroupCallParticipantDevices,
    listGroupCallParticipants
  );
  const targetDeviceIds = deviceIds.filter(
    (deviceId) => deviceId !== senderDeviceId
  );
  await Promise.all(
    targetDeviceIds.map((deviceId) =>
      publishMessage({
        ...payload,
        recipientDeviceId: deviceId,
      })
    )
  );
}

/* ── Event builders ────────────────────────────────────────────────────── */

export interface ParticipantLifecycleInput {
  groupId: string;
  callId: string;
  userId: string;
  deviceId: string;
  sessionId?: string | null;
  timestamp: string;
  includeUserEvent: boolean;
}

export type GroupParticipantLifecycleEvent = {
  type:
    | "group.call.participant_joined"
    | "group.call.participant_left"
    | "group.call.participant_device_joined"
    | "group.call.participant_device_left";
  groupId: string;
  callId: string;
  userId: string;
  deviceId: string;
  sessionId?: string;
} & Record<string, unknown>;

function buildDeviceEvent(
  baseType: "joined" | "left",
  input: ParticipantLifecycleInput
): GroupParticipantLifecycleEvent {
  const eventType =
    baseType === "joined"
      ? "group.call.participant_device_joined"
      : "group.call.participant_device_left";
  const timestampKey = baseType === "joined" ? "joinedAt" : "leftAt";
  const event: GroupParticipantLifecycleEvent = {
    type: eventType,
    groupId: input.groupId,
    callId: input.callId,
    userId: input.userId,
    deviceId: input.deviceId,
    [timestampKey]: input.timestamp,
  } as unknown as GroupParticipantLifecycleEvent;
  if (input.sessionId != null) {
    event.sessionId = input.sessionId;
  }
  return event;
}

function buildUserEvent(
  baseType: "joined" | "left",
  input: ParticipantLifecycleInput
): GroupParticipantLifecycleEvent {
  const eventType =
    baseType === "joined"
      ? "group.call.participant_joined"
      : "group.call.participant_left";
  const timestampKey = baseType === "joined" ? "joinedAt" : "leftAt";
  const event: GroupParticipantLifecycleEvent = {
    type: eventType,
    groupId: input.groupId,
    callId: input.callId,
    userId: input.userId,
    deviceId: input.deviceId,
    [timestampKey]: input.timestamp,
  } as unknown as GroupParticipantLifecycleEvent;
  if (input.sessionId != null) {
    event.sessionId = input.sessionId;
  }
  return event;
}

export function buildParticipantLifecycleEvents(
  baseType: "joined" | "left",
  input: ParticipantLifecycleInput
): GroupParticipantLifecycleEvent[] {
  const events: GroupParticipantLifecycleEvent[] = [
    buildDeviceEvent(baseType, input),
  ];
  if (input.includeUserEvent) {
    events.push(buildUserEvent(baseType, input));
  }
  return events;
}

/* ── Empty-roster termination ──────────────────────────────────────────── */

export type ActiveCallSession = {
  id: string;
  caller_user_id: string;
  callee_user_id: string | null;
  group_id: string | null;
  call_type: "audio" | "video";
  status: string;
  is_room: boolean;
};

export async function endGroupCallIfRosterEmpty(
  currentCall: ActiveCallSession,
  endedByUserId: string
): Promise<boolean> {
  if (!currentCall.group_id) return false;

  const remainingParticipants = await listGroupCallParticipants(currentCall.id);
  if (remainingParticipants.length > 0) {
    return false;
  }

  const updated = await query<{ id: string }>(
    `UPDATE call_sessions
     SET status = 'ended',
         ended_at = COALESCE(ended_at, now())
     WHERE id = $1
       AND status IN ('ringing', 'active')
     RETURNING id`,
    [currentCall.id]
  );
  if (updated.length === 0) {
    return false;
  }

  await clearGroupCallParticipants(currentCall.id);
  await publishGroupCallFanOut(currentCall.group_id, {
    type: "group.call.ended",
    groupId: currentCall.group_id,
    callId: currentCall.id,
    callerUserId: currentCall.caller_user_id,
    endedByUserId,
    endedAt: new Date().toISOString(),
    wasMissed: currentCall.status === "ringing",
  });
  return true;
}
