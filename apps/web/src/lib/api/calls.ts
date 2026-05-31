import {
  GROUPS_PROTOCOL_VERSION,
  ROOMS_PROTOCOL_VERSION,
  DirectMissedCallsResponseSchema,
  GroupActiveCallSchema,
  GroupActiveCallsResponseSchema,
  GroupCallJoinResponseSchema,
  GroupCallParticipantDevicesResponseSchema,
  GroupCallParticipantsResponseSchema,
  RoomCreateResponseSchema,
  RoomJoinPreviewResponseSchema,
  RoomJoinResponseSchema,
  RoomParticipantsResponseSchema,
  type DirectMissedCallEntry,
  type GroupActiveCall,
  type GroupActiveCallEntry,
  type GroupCallParticipant,
  type GroupCallParticipantDevice,
  type RoomCreateResponse,
  type RoomJoinPreviewResponse,
  type RoomJoinResponse,
  type RoomParticipantsResponse,
} from "@seclettr/protocol";
import { ApiError, parseVersionedApiPayload, request, sendBestEffortKeepalive } from "./client";

export interface GroupCallParticipantDto {
  userId: string;
  username: string;
}

export type GroupCallParticipantDeviceDto = GroupCallParticipantDevice;
export type GroupCallParticipantRosterDto = GroupCallParticipant;

export async function getActiveGroupCalls(): Promise<GroupActiveCallEntry[]> {
  try {
    const response = await request<unknown>("/calls/active-group-calls", { method: "GET" });
    const parsed = parseVersionedApiPayload(
      GroupActiveCallsResponseSchema,
      response,
      GROUPS_PROTOCOL_VERSION
    );
    return parsed?.calls ?? [];
  } catch {
    return [];
  }
}

export async function getMissedDirectCalls(): Promise<DirectMissedCallEntry[]> {
  try {
    const response = await request<unknown>("/calls/missed-direct", { method: "GET" });
    const parsed = parseVersionedApiPayload(
      DirectMissedCallsResponseSchema,
      response,
      GROUPS_PROTOCOL_VERSION
    );
    return parsed?.calls ?? [];
  } catch {
    return [];
  }
}

export async function getActiveGroupCall(groupId: string): Promise<GroupActiveCall | null> {
  try {
    const response = await request<unknown>(
      `/groups/${encodeURIComponent(groupId)}/active-call`,
      { method: "GET" }
    );
    return parseVersionedApiPayload(
      GroupActiveCallSchema,
      response,
      GROUPS_PROTOCOL_VERSION
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getGroupCallParticipants(callId: string): Promise<GroupCallParticipantRosterDto[]> {
  const response = await request<unknown>(
    `/calls/${encodeURIComponent(callId)}/participants`,
    { method: "GET" }
  );
  return parseVersionedApiPayload(
    GroupCallParticipantsResponseSchema,
    response,
    GROUPS_PROTOCOL_VERSION
  ).participants;
}

export async function getGroupCallParticipantDevices(callId: string): Promise<GroupCallParticipantDeviceDto[]> {
  const response = await request<unknown>(
    `/calls/${encodeURIComponent(callId)}/participant-devices`,
    { method: "GET" }
  );
  return parseVersionedApiPayload(
    GroupCallParticipantDevicesResponseSchema,
    response,
    GROUPS_PROTOCOL_VERSION
  ).participantDevices;
}

export async function joinGroupCall(callId: string): Promise<GroupCallParticipantRosterDto[]> {
  const response = await request<unknown>(
    `/calls/${encodeURIComponent(callId)}/participants`,
    { method: "POST" }
  );
  return parseVersionedApiPayload(
    GroupCallJoinResponseSchema,
    response,
    GROUPS_PROTOCOL_VERSION
  ).participants;
}

export async function leaveGroupCall(callId: string): Promise<void> {
  await request<void>(
    `/calls/${encodeURIComponent(callId)}/participants/me`,
    { method: "DELETE" }
  );
}

export async function directHangupCall(callId: string): Promise<void> {
  await request<void>(
    `/calls/${encodeURIComponent(callId)}/direct-hangup`,
    { method: "POST" }
  );
}

export async function directRejectCall(callId: string): Promise<void> {
  await request<void>(
    `/calls/${encodeURIComponent(callId)}/direct-reject`,
    { method: "POST" }
  );
}

export function groupCallHeartbeat(callId: string): Promise<void> {
  return request<unknown>(`/calls/${encodeURIComponent(callId)}/participants/me`, {
    method: "PUT",
  }).then(() => {});
}

export function leaveGroupCallKeepalive(callId: string): void {
  sendBestEffortKeepalive(
    `/calls/${encodeURIComponent(callId)}/participants/me`,
    { method: "DELETE" }
  );
}

export function directHangupCallKeepalive(callId: string): void {
  sendBestEffortKeepalive(
    `/calls/${encodeURIComponent(callId)}/direct-hangup`,
    { method: "POST" }
  );
}

export function updateCallStatusKeepalive(callId: string, status: "active" | "ended" | "missed" | "rejected"): void {
  sendBestEffortKeepalive(
    `/calls/${encodeURIComponent(callId)}/status`,
    {
      method: "PUT",
      body: JSON.stringify({ status }),
    }
  );
}

export async function createRoom(body: { callType: "audio" | "video"; expiresInMinutes: number }): Promise<RoomCreateResponse> {
  const raw = await request<unknown>("/rooms", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return parseVersionedApiPayload(RoomCreateResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
}

export async function getRoomPreview(token: string): Promise<RoomJoinPreviewResponse> {
  const raw = await request<unknown>(`/rooms/join/${encodeURIComponent(token)}`);
  return parseVersionedApiPayload(RoomJoinPreviewResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
}

export async function redeemRoomInvite(token: string, body: { guestName: string }): Promise<RoomJoinResponse> {
  const raw = await request<unknown>(`/rooms/join/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return parseVersionedApiPayload(RoomJoinResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
}

export async function getRoomParticipants(callId: string, guestToken?: string): Promise<RoomParticipantsResponse> {
  const headers: Record<string, string> = {};
  if (guestToken) {
    headers["Authorization"] = `Bearer ${guestToken}`;
  }
  const raw = await request<unknown>(`/rooms/${encodeURIComponent(callId)}/participants`, { headers });
  return parseVersionedApiPayload(RoomParticipantsResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
}

export async function joinRoomPresence(callId: string, guestToken?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (guestToken) {
    headers["Authorization"] = `Bearer ${guestToken}`;
  }
  await request<void>(`/rooms/${encodeURIComponent(callId)}/participants`, { method: "POST", headers });
}

export function leaveRoomPresence(callId: string, guestToken?: string): void {
  const headers: Record<string, string> = {};
  if (guestToken) {
    headers["Authorization"] = `Bearer ${guestToken}`;
  }
  sendBestEffortKeepalive(`/rooms/${encodeURIComponent(callId)}/participants/me`, { method: "DELETE", headers });
}

export async function closeRoom(callId: string): Promise<void> {
  await request<void>(`/rooms/${encodeURIComponent(callId)}`, { method: "DELETE" });
}

export async function kickRoomGuest(callId: string, guestSessionId: string): Promise<void> {
  await request<void>(
    `/rooms/${encodeURIComponent(callId)}/guests/${encodeURIComponent(guestSessionId)}`,
    { method: "DELETE" }
  );
}
