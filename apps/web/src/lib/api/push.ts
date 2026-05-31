import { z } from "zod";
import { parseLocalPayload, request } from "./client";

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

export async function getPushPreferences(): Promise<PushPreferencesDto> {
  const raw = await request<unknown>("/push/preferences", { method: "GET" });
  return parseLocalPayload(PushPreferencesSchema, raw);
}

export async function updatePushPreferences(preferences: PushPreferencesDto): Promise<PushPreferencesDto> {
  const raw = await request<unknown>("/push/preferences", {
    method: "PUT",
    body: JSON.stringify(preferences),
  });
  return parseLocalPayload(PushPreferencesSchema, raw);
}

export async function listPushSubscriptions(): Promise<PushSubscriptionDto[]> {
  const raw = await request<unknown>("/push/subscriptions", { method: "GET" });
  return parseLocalPayload(PushSubscriptionListSchema, raw).subscriptions;
}

export async function deletePushSubscription(subscriptionId: string): Promise<void> {
  await request<void>(`/push/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
  });
}
