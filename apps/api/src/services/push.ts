import webpush, { type PushSubscription } from "web-push";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import {
  DEFAULT_PUSH_PREFERENCES,
  type PushPayload,
  type PushPreferences,
} from "./push-payloads.js";

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPreferencesRow {
  direct_messages_enabled: boolean;
  group_messages_enabled: boolean;
  call_invites_enabled: boolean;
  show_sender: boolean;
}

const vapidKeys =
  config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    ? { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY }
    : null;
let pushInitialised = false;

function ensurePushConfigured(): boolean {
  if (!vapidKeys) return false;
  if (pushInitialised) return true;
  webpush.setVapidDetails(config.VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  pushInitialised = true;
  return true;
}

function rowToSubscription(row: PushSubscriptionRow): PushSubscription {
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

export function isPushEnabled(): boolean {
  return ensurePushConfigured();
}

export function getVapidPublicKey(): string | null {
  if (!ensurePushConfigured()) return null;
  return vapidKeys?.publicKey ?? null;
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
  if (!ensurePushConfigured()) return;

  const rows = await query<PushSubscriptionRow>(
    `SELECT endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId]
  );
  if (rows.length === 0) return;

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
