import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { recordRetentionDeleted } from "./observability.js";
import { purgeDeletedAttachments } from "./attachment-lifecycle.js";
import { logger as fallbackLogger } from "../lib/logger.js";

const DELIVERED_MESSAGE_RETENTION_DAYS = config.DELIVERED_MESSAGE_RETENTION_DAYS;
const UNDELIVERED_MESSAGE_RETENTION_DAYS = config.UNDELIVERED_MESSAGE_RETENTION_DAYS;
const GROUP_MESSAGE_RETENTION_DAYS = config.GROUP_MESSAGE_RETENTION_DAYS;
const ENDED_CALL_SESSION_RETENTION_DAYS = config.ENDED_CALL_SESSION_RETENTION_DAYS;

/** Consumed OTKs (used_at IS NOT NULL) are kept for this many days after use. */
const USED_OTK_RETENTION_DAYS = 7;

/** Expired auth sessions are deleted after this grace period. */
const EXPIRED_SESSION_GRACE_DAYS = 1;

/** Calls stuck in 'ringing' state longer than this are auto-expired. */
const STALE_RINGING_CALL_MINUTES = 5;

/** Orphaned attachments (no referencing messages) are deleted after this many days. */
const ORPHANED_ATTACHMENT_RETENTION_DAYS = 7;

export async function runRetentionCleanup(
  log?: { info: (msg: string) => void; warn: (msg: string, err?: unknown) => void }
): Promise<void> {
  const _log = log ?? fallbackLogger;
  try {
    const r1 = await pool.query(
      `DELETE FROM messages
       WHERE delivered_at IS NOT NULL
         AND created_at < now() - ($1 || ' days')::interval`,
      [String(DELIVERED_MESSAGE_RETENTION_DAYS)]
    );
    const r2 = await pool.query(
      `DELETE FROM messages
       WHERE delivered_at IS NULL
         AND created_at < now() - ($1 || ' days')::interval`,
      [String(UNDELIVERED_MESSAGE_RETENTION_DAYS)]
    );
    const r3 = await pool.query(
      `DELETE FROM group_messages
       WHERE created_at < now() - ($1 || ' days')::interval`,
      [String(GROUP_MESSAGE_RETENTION_DAYS)]
    );
    const r4 = await pool.query(
      `DELETE FROM one_time_prekeys
       WHERE used_at IS NOT NULL
         AND used_at < now() - ($1 || ' days')::interval`,
      [String(USED_OTK_RETENTION_DAYS)]
    );
    const r5 = await pool.query(
      `DELETE FROM auth_sessions
       WHERE expires_at < now() - ($1 || ' days')::interval`,
      [String(EXPIRED_SESSION_GRACE_DAYS)]
    );
    // Calls that were never answered or rejected: mark as missed/ended so they are eventually purged.
    const r6a = await pool.query(
      `UPDATE call_sessions
       SET status = CASE WHEN group_id IS NULL THEN 'missed' ELSE 'ended' END,
           ended_at = now()
       WHERE status = 'ringing'
         AND started_at < now() - ($1 || ' minutes')::interval`,
      [String(STALE_RINGING_CALL_MINUTES)]
    );

    const r6 = await pool.query(
      `DELETE FROM call_sessions
       WHERE status IN ('ended', 'missed', 'rejected')
         AND ended_at < now() - ($1 || ' days')::interval`,
      [String(ENDED_CALL_SESSION_RETENTION_DAYS)]
    );

    // Clear stale OTK reservation metadata for reservations that expired without being committed.
    // The OTK rows remain (unused) so they can be reserved again; only the reservation columns are cleared.
    const r7 = await pool.query(
      `UPDATE one_time_prekeys
       SET reserved_at = NULL,
           reservation_expires_at = NULL,
           reservation_token_hash = NULL,
           reserved_for_user_id = NULL,
           reserved_message_id = NULL
       WHERE used_at IS NULL
         AND reservation_expires_at IS NOT NULL
         AND reservation_expires_at < now()`
    );

    // Soft-delete attachments that were uploaded but never shared (no attachment_access records),
    // older than the grace period. These are abandoned/aborted uploads.
    const r8 = await pool.query(
      `UPDATE attachments
       SET deleted_at = now()
       WHERE deleted_at IS NULL
         AND created_at < now() - ($1 || ' days')::interval
         AND NOT EXISTS (
           SELECT 1 FROM attachment_access aa
            WHERE aa.attachment_id = attachments.id
         )`,
      [String(ORPHANED_ATTACHMENT_RETENTION_DAYS)]
    );

    recordRetentionDeleted("messages_delivered", r1.rowCount ?? 0);
    recordRetentionDeleted("messages_undelivered", r2.rowCount ?? 0);
    recordRetentionDeleted("group_messages", r3.rowCount ?? 0);
    recordRetentionDeleted("one_time_prekeys", r4.rowCount ?? 0);
    recordRetentionDeleted("auth_sessions", r5.rowCount ?? 0);
    recordRetentionDeleted("call_sessions_stale_ringing", r6a.rowCount ?? 0);
    recordRetentionDeleted("call_sessions", r6.rowCount ?? 0);
    recordRetentionDeleted("otk_reservations_cleared", r7.rowCount ?? 0);
    recordRetentionDeleted("attachments_orphaned", r8.rowCount ?? 0);

    const total =
      (r1.rowCount ?? 0) +
      (r2.rowCount ?? 0) +
      (r3.rowCount ?? 0) +
      (r4.rowCount ?? 0) +
      (r5.rowCount ?? 0) +
      (r6a.rowCount ?? 0) +
      (r6.rowCount ?? 0) +
      (r7.rowCount ?? 0) +
      (r8.rowCount ?? 0);
    if (total > 0) {
      _log.info(
        `[retention] cleaned up ${total} rows ` +
        `(msgs-delivered=${r1.rowCount ?? 0}, msgs-undelivered=${r2.rowCount ?? 0}, ` +
        `group-msgs=${r3.rowCount ?? 0}, otks=${r4.rowCount ?? 0}, ` +
        `sessions=${r5.rowCount ?? 0}, stale-ringing=${r6a.rowCount ?? 0}, ` +
        `call-sessions=${r6.rowCount ?? 0}, ` +
        `otk-reservations-cleared=${r7.rowCount ?? 0}, attachments-orphaned=${r8.rowCount ?? 0})`
      );
    }
    await purgeDeletedAttachments(_log);
  } catch (err) {
    _log.warn("[retention] cleanup failed", err);
  }
}
