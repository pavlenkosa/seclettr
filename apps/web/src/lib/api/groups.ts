import {
  DEVICES_PROTOCOL_VERSION,
  GROUPS_PROTOCOL_VERSION,
  GroupHistoryResponseSchema,
  GroupMemberDevicesResponseSchema,
  UserDeviceDirectoryResponseSchema,
  type GroupHistoryMessage,
  type GroupMemberPublicDevice,
  type UserDeviceDirectoryEntry,
} from "@seclettr/protocol";
import { parseVersionedApiPayload, request } from "./client";

export interface GroupMemberDevicesDto {
  userId: string;
  devices: GroupMemberPublicDevice[];
}

export type UserDeviceDirectoryEntryDto = UserDeviceDirectoryEntry;

export async function getGroupMemberDevices(groupId: string): Promise<GroupMemberDevicesDto[]> {
  const response = await request<unknown>(
    `/groups/${encodeURIComponent(groupId)}/member-devices`,
    { method: "GET" }
  );
  return parseVersionedApiPayload(
    GroupMemberDevicesResponseSchema,
    response,
    GROUPS_PROTOCOL_VERSION
  ).members;
}

export async function getUserDeviceDirectory(userId: string): Promise<UserDeviceDirectoryEntryDto[]> {
  const response = await request<unknown>(
    `/users/${encodeURIComponent(userId)}/devices`,
    { method: "GET" }
  );
  return parseVersionedApiPayload(
    UserDeviceDirectoryResponseSchema,
    response,
    DEVICES_PROTOCOL_VERSION
  ).devices;
}

export async function getGroupHistory(
  groupId: string,
  options: { limit?: number; before?: string } = {}
): Promise<GroupHistoryMessage[]> {
  const search = new URLSearchParams();
  if (options.limit !== undefined) {
    search.set("limit", String(options.limit));
  }
  if (options.before) {
    search.set("before", options.before);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await request<unknown>(
    `/groups/${encodeURIComponent(groupId)}/messages${suffix}`,
    { method: "GET" }
  );
  return parseVersionedApiPayload(
    GroupHistoryResponseSchema,
    response,
    GROUPS_PROTOCOL_VERSION
  ).messages;
}

export async function syncCurrentDeviceCryptoMaterial(payload: {
  identityKeyPublic: string;
  signingKeyPublic: string;
  signedPreKey: {
    id: number;
    publicKey: string;
    signature: string;
  };
}): Promise<void> {
  await request<void>("/devices/crypto-material", {
    method: "PUT",
    body: JSON.stringify({
      version: DEVICES_PROTOCOL_VERSION,
      identityKeyPublic: payload.identityKeyPublic,
      signingKeyPublic: payload.signingKeyPublic,
      signedPreKey: payload.signedPreKey,
    }),
  });
}
