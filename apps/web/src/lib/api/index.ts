// Re-export public client API
export { ApiError, setAccessToken, getAccessToken } from "./client";
import { request } from "./client";

// Re-export DTOs — types only, no external consumers for call/group DTOs but
// kept for backward-compat with any future import of @/lib/api
export type { GroupCallParticipantDto, GroupCallParticipantDeviceDto, GroupCallParticipantRosterDto } from "./calls";
export type { GroupMemberDevicesDto, UserDeviceDirectoryEntryDto } from "./groups";
// PushPreferencesDto and PushSubscriptionDto have active external consumers
export type { PushPreferencesDto, PushSubscriptionDto } from "./push";

// Import all domain methods
import {
  getActiveGroupCalls,
  getMissedDirectCalls,
  getActiveGroupCall,
  getGroupCallParticipants,
  getGroupCallParticipantDevices,
  joinGroupCall,
  leaveGroupCall,
  directHangupCall,
  directRejectCall,
  groupCallHeartbeat,
  leaveGroupCallKeepalive,
  directHangupCallKeepalive,
  updateCallStatusKeepalive,
  createRoom,
  getRoomPreview,
  redeemRoomInvite,
  getRoomParticipants,
  joinRoomPresence,
  leaveRoomPresence,
  closeRoom,
  kickRoomGuest,
} from "./calls";

import {
  getGroupMemberDevices,
  getUserDeviceDirectory,
  getGroupHistory,
  syncCurrentDeviceCryptoMaterial,
} from "./groups";

import {
  getPushPreferences,
  updatePushPreferences,
  listPushSubscriptions,
  deletePushSubscription,
} from "./push";

import { getMeUser } from "./profile";

// Assembled api object — same shape and method names as the original lib/api.ts
export const api = {
  // Generic HTTP verbs
  get: <T>(path: string, options: RequestInit = {}) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options: RequestInit = {}) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  put: <T>(path: string, body?: unknown, options: RequestInit = {}) =>
    request<T>(path, {
      ...options,
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown, options: RequestInit = {}) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  delete: <T>(path: string, options: RequestInit = {}) =>
    request<T>(path, { ...options, method: "DELETE" }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),

  // Call methods
  getActiveGroupCalls,
  getMissedDirectCalls,
  getActiveGroupCall,
  getGroupCallParticipants,
  getGroupCallParticipantDevices,
  joinGroupCall,
  leaveGroupCall,
  directHangupCall,
  directRejectCall,
  groupCallHeartbeat,
  leaveGroupCallKeepalive,
  directHangupCallKeepalive,
  updateCallStatusKeepalive,
  createRoom,
  getRoomPreview,
  redeemRoomInvite,
  getRoomParticipants,
  joinRoomPresence,
  leaveRoomPresence,
  closeRoom,
  kickRoomGuest,

  // Group / device methods
  getGroupMemberDevices,
  getUserDeviceDirectory,
  getGroupHistory,
  syncCurrentDeviceCryptoMaterial,

  // Push methods
  getPushPreferences,
  updatePushPreferences,
  listPushSubscriptions,
  deletePushSubscription,

  // Profile methods
  getMeUser,
};
