import { query } from "../db/pool.js";
import { logger } from "../lib/logger.js";

export interface AuditEventParams {
  eventType: string;
  actorUserId?: string | null;
  actorDeviceId?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Appends a row to audit_log. Failures are silently swallowed — a write error
 * must never surface to the caller (the request has already succeeded by this point).
 */
export async function appendAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log
         (event_type, actor_user_id, actor_device_id, target_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5::inet, $6)`,
      [
        params.eventType,
        params.actorUserId ?? null,
        params.actorDeviceId ?? null,
        params.targetId ?? null,
        params.ipAddress ?? null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );
  } catch (err) {
    logger.warn("[audit] failed to write audit event", err);
  }
}
