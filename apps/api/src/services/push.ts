import type * as FirebaseAdmin from "firebase-admin";
import type { Messaging } from "firebase-admin/messaging";
import webpush, { type PushSubscription } from "web-push";
import { readFileSync } from "node:fs";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import {
  DEFAULT_PUSH_PREFERENCES,
  type PushPayload,
  type PushPreferences,
} from "./push-payloads.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface VapidSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface FcmTokenRow {
  fcm_token: string;
}

interface PushPreferencesRow {
  direct_messages_enabled: boolean;
  group_messages_enabled: boolean;
  call_invites_enabled: boolean;
  show_sender: boolean;
}

// ── VAPID provider ───────────────────────────────────────────────────────────

const vapidKeys =
  config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    ? { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY }
    : null;
let vapidInitialised = false;

function ensureVapidConfigured(): boolean {
  if (!vapidKeys) return false;
  if (vapidInitialised) return true;
  webpush.setVapidDetails(config.VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  vapidInitialised = true;
  return true;
}

function rowToSubscription(row: VapidSubscriptionRow): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

async function markSubscriptionDead(endpoint: string): Promise<void> {
  await query(
    "UPDATE push_subscriptions SET revoked_at = now(), updated_at = now(), last_error_at = now() WHERE endpoint = $1",
    [endpoint]
  );
}

function mapPushPreferencesRow(row: PushPreferencesRow | undefined): PushPreferences {
  if (!row) return DEFAULT_PUSH_PREFERENCES;
  return {
    directMessagesEnabled: row.direct_messages_enabled,
    groupMessagesEnabled: row.group_messages_enabled,
    callInvitesEnabled: row.call_invites_enabled,
    showSender: row.show_sender,
  };
}

// ── FCM provider ─────────────────────────────────────────────────────────────

let fcmInitialised = false;
let fcmMessaging: Messaging | null = null;

function isFcmConfigured(): boolean {
  return Boolean(config.FCM_SERVICE_ACCOUNT_PATH) || Boolean(config.FCM_SERVICE_ACCOUNT_JSON);
}

async function ensureFcmConfigured(): Promise<boolean> {
  if (!isFcmConfigured()) return false;
  if (fcmInitialised && fcmMessaging) return true;

  try {
    const mod = await import("firebase-admin");
    const admin: typeof FirebaseAdmin = mod;
    const serviceAccountPath = config.FCM_SERVICE_ACCOUNT_PATH;
    const serviceAccountJson = config.FCM_SERVICE_ACCOUNT_JSON;

    let credential: ReturnType<typeof admin.credential.cert>;
    if (serviceAccountPath) {
      const fileContent = readFileSync(serviceAccountPath, "utf8");
      credential = admin.credential.cert(JSON.parse(fileContent));
    } else {
      credential = admin.credential.cert(JSON.parse(serviceAccountJson!));
    }

    if (!admin.apps.length) {
      admin.initializeApp({ credential });
    }
    fcmMessaging = admin.messaging();
    fcmInitialised = true;
    return true;
  } catch (err) {
    console.error("Failed to initialise Firebase Admin SDK:", err);
    return false;
  }
}

async function sendFcmPush(token: string, payload: PushPayload): Promise<boolean> {
  if (!(await ensureFcmConfigured()) || !fcmMessaging) return false;

  const androidData: Record<string, string> = {};
  if (payload.tag) androidData["tag"] = payload.tag;
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      androidData[k] = v ?? "";
    }
  }
  if (payload.timestamp) androidData["timestamp"] = String(payload.timestamp);
  androidData["serverUrl"] = config.APP_URL;
  androidData["body"] = payload.body;

  // Call invites are time-critical: a 60-second-old push that arrives late should
  // be discarded rather than shown as a stale "Answer" notification.
  // All other types keep a 60s TTL to tolerate brief connectivity gaps.
  const pushType = payload.data?.["type"] ?? "";
  const isCallInvite = pushType === "call_invite" || pushType === "group_call_invite";

  try {
    await fcmMessaging.send({
      token,
      data: androidData,
      android: {
        priority: "high" as const,
        ttl: isCallInvite ? 0 : 60000,
      },
      apns: {
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            badge: 1,
            sound: "default",
            ...(payload.requireInteraction ? { "content-available": 1 } : {}),
          },
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isPushEnabled(): boolean {
  return ensureVapidConfigured() || isFcmConfigured();
}

export function isFcmAvailable(): boolean {
  return isFcmConfigured();
}

export function getVapidPublicKey(): string | null {
  if (!ensureVapidConfigured()) return null;
  return vapidKeys?.publicKey ?? null;
}

export async function getPushPreferences(userId: string): Promise<PushPreferences> {
  const rows = await query<PushPreferencesRow>(
    `SELECT direct_messages_enabled, group_messages_enabled, call_invites_enabled, show_sender
     FROM push_preferences
     WHERE user_id = $1`,
    [userId]
  );
  return mapPushPreferencesRow(rows[0]);
}

export async function upsertPushPreferences(
  userId: string,
  preferences: PushPreferences
): Promise<PushPreferences> {
  const rows = await query<PushPreferencesRow>(
    `INSERT INTO push_preferences (
       user_id,
       direct_messages_enabled,
       group_messages_enabled,
       call_invites_enabled,
       show_sender,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id)
     DO UPDATE SET
       direct_messages_enabled = EXCLUDED.direct_messages_enabled,
       group_messages_enabled = EXCLUDED.group_messages_enabled,
       call_invites_enabled = EXCLUDED.call_invites_enabled,
       show_sender = EXCLUDED.show_sender,
       updated_at = now()
     RETURNING direct_messages_enabled, group_messages_enabled, call_invites_enabled, show_sender`,
    [
      userId,
      preferences.directMessagesEnabled,
      preferences.groupMessagesEnabled,
      preferences.callInvitesEnabled,
      preferences.showSender,
    ]
  );
  return mapPushPreferencesRow(rows[0]);
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const isFcmReady = isFcmConfigured();

  if (!ensureVapidConfigured() && !isFcmReady) return;

  // ── VAPID: query browser push subscriptions ───────────────────────────
  const vapidConfigured = ensureVapidConfigured();
  if (vapidConfigured) {
    const rows = await query<VapidSubscriptionRow>(
      `SELECT endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [userId]
    );

    if (rows.length > 0) {
      const body = JSON.stringify(payload);
      await Promise.all(
        rows.map(async (row) => {
          try {
            await webpush.sendNotification(rowToSubscription(row), body, {
              TTL: 60,
              urgency: "high",
            });
            await query(
              "UPDATE push_subscriptions SET last_success_at = now(), updated_at = now() WHERE endpoint = $1",
              [row.endpoint]
            );
          } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await markSubscriptionDead(row.endpoint);
              return;
            }
            await query(
              "UPDATE push_subscriptions SET last_error_at = now(), updated_at = now() WHERE endpoint = $1",
              [row.endpoint]
            );
          }
        })
      );
    }
  }

  // ── FCM: query native device tokens ───────────────────────────────────
  if (isFcmReady) {
    const fcmRows = await query<FcmTokenRow>(
      `SELECT fcm_token
       FROM push_device_tokens
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [userId]
    );

    if (fcmRows.length > 0) {
      await Promise.all(
        fcmRows.map(async (row) => {
          await sendFcmPush(row.fcm_token, payload);
        })
      );
    }
  }
}
