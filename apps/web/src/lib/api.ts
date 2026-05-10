/**
 * HTTP API client.
 * Handles JWT access token injection and transparent token refresh.
 */
import {
  DEVICES_PROTOCOL_VERSION,
  GROUPS_PROTOCOL_VERSION,
  ROOMS_PROTOCOL_VERSION,
  DirectMissedCallsResponseSchema,
  GroupActiveCallSchema,
  GroupActiveCallsResponseSchema,
  GroupCallJoinResponseSchema,
  GroupCallParticipantDevicesResponseSchema,
  GroupCallParticipantsResponseSchema,
  GroupHistoryResponseSchema,
  GroupMemberDevicesResponseSchema,
  UserDeviceDirectoryResponseSchema,
  RoomCreateResponseSchema,
  RoomJoinPreviewResponseSchema,
  RoomJoinResponseSchema,
  RoomParticipantsResponseSchema,
  safeParseVersionedWire,
  type DirectMissedCallEntry,
  type GroupActiveCall,
  type GroupActiveCallEntry,
  type GroupCallParticipant,
  type GroupCallParticipantDevice,
  type GroupHistoryMessage,
  type GroupMemberPublicDevice,
  type UserDeviceDirectoryEntry,
  type RoomCreateResponse,
  type RoomJoinPreviewResponse,
  type RoomJoinResponse,
  type RoomParticipantsResponse,
} from "@seclettr/protocol";
import { z, type ZodTypeAny } from "zod";
import { refreshSessionAccessToken } from "./session";
import { resolveApiBaseUrl } from "./runtime-config";

const BASE_URL = resolveApiBaseUrl();
export interface GroupCallParticipantDto {
  userId: string;
  username: string;
}

export interface GroupMemberDevicesDto {
  userId: string;
  devices: GroupMemberPublicDevice[];
}

export type GroupCallParticipantDeviceDto = GroupCallParticipantDevice;
export type GroupCallParticipantRosterDto = GroupCallParticipant;
export type UserDeviceDirectoryEntryDto = UserDeviceDirectoryEntry;

export interface PushPreferencesDto {
  directMessagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  callInvitesEnabled: boolean;
  showSender: boolean;
}

export interface PushSubscriptionDto {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  currentDevice: boolean;
}

let accessToken: string | null = null;

function buildRequestHeaders(options: RequestInit = {}): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  // Browser strips Origin/Referer for same-origin GET (and we set
  // referrer-policy=no-referrer globally), so the API can't recover the
  // browser-facing origin from standard headers when rewriting presigned S3
  // URLs. We pass it explicitly so the rewritten URL matches the page origin
  // and the browser trusts the cert / honors CORS.
  if (typeof globalThis.location !== "undefined" && globalThis.location.origin) {
    headers.set("X-Client-Origin", globalThis.location.origin);
  }
  return headers;
}

function sendBestEffortKeepalive(path: string, options: RequestInit = {}): void {
  const headers = buildRequestHeaders(options);
  fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
    keepalive: true,
  }).catch(() => {
    // Best-effort unload cleanup.
  });
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const headers = buildRequestHeaders(options);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry) {
    // refreshSessionAccessToken() deduplicates concurrent calls across HTTP, WS,
    // and SFU transports — safe to await without a local wrapper.
    const newToken = await refreshSessionAccessToken();
    if (newToken) {
      return request<T>(path, options, false);
    }
    // Refresh failed — clear auth state
    accessToken = null;
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    let message = "Request failed";
    try {
      const body = await res.text();
      if (body.trim().length > 0) {
        try {
          const err = JSON.parse(body) as { error?: string };
          message = err.error ?? body;
        } catch {
          message = body;
        }
      }
    } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const body = await res.text();
  if (body.trim().length === 0) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
}

function parseVersionedApiPayload<TSchema extends ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
  supportedVersion: number
) {
  const parsed = safeParseVersionedWire(
    schema,
    payload,
    supportedVersion
  );
  if (!parsed.success) {
    throw new Error(
      parsed.error.code === "UNSUPPORTED_PROTOCOL_VERSION"
        ? `Unsupported API protocol version ${String(parsed.error.receivedVersion ?? "unknown")}`
        : "Invalid API payload"
    );
  }
  return parsed.data;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Local response schemas ────────────────────────────────────────────────────

const MeResponseSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(1),
});

const PushPreferencesSchema = z.object({
  directMessagesEnabled: z.boolean(),
  groupMessagesEnabled: z.boolean(),
  callInvitesEnabled: z.boolean(),
  showSender: z.boolean(),
});

const PushSubscriptionSchema = z.object({
  id: z.string(),
  endpoint: z.string(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSuccessAt: z.string().nullable(),
  lastErrorAt: z.string().nullable(),
  currentDevice: z.boolean(),
});

const PushSubscriptionListSchema = z.object({
  subscriptions: z.array(PushSubscriptionSchema),
});

function parseLocalPayload<TSchema extends ZodTypeAny>(
  schema: TSchema,
  payload: unknown
): z.infer<TSchema> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error("Invalid API payload");
  }
  return result.data as z.infer<TSchema>;
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, options: RequestInit = {}) =>
    request<T>(path, { ...options, method: "GET" }),

  getActiveGroupCalls: async (): Promise<GroupActiveCallEntry[]> => {
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
  },

  getMissedDirectCalls: async (): Promise<DirectMissedCallEntry[]> => {
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
  },

  getActiveGroupCall: async (groupId: string): Promise<GroupActiveCall | null> => {
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
  },

  getGroupCallParticipants: async (callId: string): Promise<GroupCallParticipantRosterDto[]> => {
    const response = await request<unknown>(
      `/calls/${encodeURIComponent(callId)}/participants`,
      { method: "GET" }
    );
    return parseVersionedApiPayload(
      GroupCallParticipantsResponseSchema,
      response,
      GROUPS_PROTOCOL_VERSION
    ).participants;
  },

  getGroupCallParticipantDevices: async (callId: string): Promise<GroupCallParticipantDeviceDto[]> => {
    const response = await request<unknown>(
      `/calls/${encodeURIComponent(callId)}/participant-devices`,
      { method: "GET" }
    );
    return parseVersionedApiPayload(
      GroupCallParticipantDevicesResponseSchema,
      response,
      GROUPS_PROTOCOL_VERSION
    ).participantDevices;
  },

  getGroupMemberDevices: async (groupId: string): Promise<GroupMemberDevicesDto[]> => {
    const response = await request<unknown>(
      `/groups/${encodeURIComponent(groupId)}/member-devices`,
      { method: "GET" }
    );
    return parseVersionedApiPayload(
      GroupMemberDevicesResponseSchema,
      response,
      GROUPS_PROTOCOL_VERSION
    ).members;
  },

  getUserDeviceDirectory: async (
    userId: string
  ): Promise<UserDeviceDirectoryEntryDto[]> => {
    const response = await request<unknown>(
      `/users/${encodeURIComponent(userId)}/devices`,
      { method: "GET" }
    );
    return parseVersionedApiPayload(
      UserDeviceDirectoryResponseSchema,
      response,
      DEVICES_PROTOCOL_VERSION
    ).devices;
  },

  getGroupHistory: async (
    groupId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<GroupHistoryMessage[]> => {
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
  },

  getMeUser: async (): Promise<{ userId: string; username: string } | null> => {
    try {
      const raw = await request<unknown>("/users/me", { method: "GET" });
      return parseLocalPayload(MeResponseSchema, raw);
    } catch {
      return null;
    }
  },

  getPushPreferences: async (): Promise<PushPreferencesDto> => {
    const raw = await request<unknown>("/push/preferences", { method: "GET" });
    return parseLocalPayload(PushPreferencesSchema, raw);
  },

  updatePushPreferences: async (preferences: PushPreferencesDto): Promise<PushPreferencesDto> => {
    const raw = await request<unknown>("/push/preferences", {
      method: "PUT",
      body: JSON.stringify(preferences),
    });
    return parseLocalPayload(PushPreferencesSchema, raw);
  },

  listPushSubscriptions: async (): Promise<PushSubscriptionDto[]> => {
    const raw = await request<unknown>("/push/subscriptions", { method: "GET" });
    return parseLocalPayload(PushSubscriptionListSchema, raw).subscriptions;
  },

  deletePushSubscription: async (subscriptionId: string): Promise<void> => {
    await request<void>(`/push/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "DELETE",
    });
  },

  joinGroupCall: async (callId: string): Promise<GroupCallParticipantRosterDto[]> => {
    const response = await request<unknown>(
      `/calls/${encodeURIComponent(callId)}/participants`,
      { method: "POST" }
    );
    return parseVersionedApiPayload(
      GroupCallJoinResponseSchema,
      response,
      GROUPS_PROTOCOL_VERSION
    ).participants;
  },

  leaveGroupCall: async (callId: string): Promise<void> => {
    await request<void>(
      `/calls/${encodeURIComponent(callId)}/participants/me`,
      { method: "DELETE" }
    );
  },

  directHangupCall: async (callId: string): Promise<void> => {
    await request<void>(
      `/calls/${encodeURIComponent(callId)}/direct-hangup`,
      { method: "POST" }
    );
  },

  directRejectCall: async (callId: string): Promise<void> => {
    await request<void>(
      `/calls/${encodeURIComponent(callId)}/direct-reject`,
      { method: "POST" }
    );
  },

  syncCurrentDeviceCryptoMaterial: async (payload: {
    identityKeyPublic: string;
    signingKeyPublic: string;
    signedPreKey: {
      id: number;
      publicKey: string;
      signature: string;
    };
  }): Promise<void> => {
    await request<void>("/devices/crypto-material", {
      method: "PUT",
      body: JSON.stringify({
        version: DEVICES_PROTOCOL_VERSION,
        identityKeyPublic: payload.identityKeyPublic,
        signingKeyPublic: payload.signingKeyPublic,
        signedPreKey: payload.signedPreKey,
      }),
    });
  },

  groupCallHeartbeat: (callId: string): Promise<void> => {
    return request<unknown>(`/calls/${encodeURIComponent(callId)}/participants/me`, {
      method: "PUT",
    }).then(() => {});
  },

  leaveGroupCallKeepalive: (callId: string): void => {
    sendBestEffortKeepalive(
      `/calls/${encodeURIComponent(callId)}/participants/me`,
      { method: "DELETE" }
    );
  },

  directHangupCallKeepalive: (callId: string): void => {
    sendBestEffortKeepalive(
      `/calls/${encodeURIComponent(callId)}/direct-hangup`,
      { method: "POST" }
    );
  },

  updateCallStatusKeepalive: (callId: string, status: "active" | "ended" | "missed" | "rejected"): void => {
    sendBestEffortKeepalive(
      `/calls/${encodeURIComponent(callId)}/status`,
      {
        method: "PUT",
        body: JSON.stringify({ status }),
      }
    );
  },

  createRoom: async (body: { callType: "audio" | "video"; expiresInMinutes: number }): Promise<RoomCreateResponse> => {
    const raw = await request<unknown>("/rooms", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return parseVersionedApiPayload(RoomCreateResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
  },

  getRoomPreview: async (token: string): Promise<RoomJoinPreviewResponse> => {
    const raw = await request<unknown>(`/rooms/join/${encodeURIComponent(token)}`);
    return parseVersionedApiPayload(RoomJoinPreviewResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
  },

  redeemRoomInvite: async (token: string, body: { guestName: string }): Promise<RoomJoinResponse> => {
    const raw = await request<unknown>(`/rooms/join/${encodeURIComponent(token)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return parseVersionedApiPayload(RoomJoinResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
  },

  getRoomParticipants: async (callId: string, guestToken?: string): Promise<RoomParticipantsResponse> => {
    const headers: Record<string, string> = {};
    if (guestToken) {
      headers["Authorization"] = `Bearer ${guestToken}`;
    }
    const raw = await request<unknown>(`/rooms/${encodeURIComponent(callId)}/participants`, { headers });
    return parseVersionedApiPayload(RoomParticipantsResponseSchema, raw, ROOMS_PROTOCOL_VERSION);
  },

  joinRoomPresence: async (callId: string, guestToken?: string): Promise<void> => {
    const headers: Record<string, string> = {};
    if (guestToken) {
      headers["Authorization"] = `Bearer ${guestToken}`;
    }
    await request<void>(`/rooms/${encodeURIComponent(callId)}/participants`, { method: "POST", headers });
  },

  leaveRoomPresence: (callId: string, guestToken?: string): void => {
    const headers: Record<string, string> = {};
    if (guestToken) {
      headers["Authorization"] = `Bearer ${guestToken}`;
    }
    sendBestEffortKeepalive(`/rooms/${encodeURIComponent(callId)}/participants/me`, { method: "DELETE", headers });
  },

  closeRoom: async (callId: string): Promise<void> => {
    await request<void>(`/rooms/${encodeURIComponent(callId)}`, { method: "DELETE" });
  },

  kickRoomGuest: async (callId: string, guestSessionId: string): Promise<void> => {
    await request<void>(
      `/rooms/${encodeURIComponent(callId)}/guests/${encodeURIComponent(guestSessionId)}`,
      { method: "DELETE" }
    );
  },

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
};
