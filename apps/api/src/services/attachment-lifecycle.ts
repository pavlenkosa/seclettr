/**
 * Attachment hard-delete lifecycle.
 *
 * Retention cleanup marks orphaned attachments soft-deleted (deleted_at IS NOT NULL).
 * This module performs the second phase:
 *   1. Delete the object from S3/MinIO
 *   2. Remove attachment_access rows
 *   3. Hard-delete the attachment row from the database
 *
 * The three stages are ordered so that a partial failure always leaves rows
 * in a retryable state: if S3 deletion fails the row stays soft-deleted and
 * will be retried on the next scheduled run.
 */
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { recordRetentionDeleted } from "./observability.js";

const USE_IN_MEMORY = process.env["QM_API_TEST_USE_IN_MEMORY_SERVICES"] === "1";

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

/** Maximum rows processed per invocation to bound memory and S3 request size. */
const BATCH_SIZE = 50;

interface SoftDeletedAttachment {
  id: string;
  storage_key: string;
}

type Log = { info: (msg: string) => void };

/**
 * Purge a batch of soft-deleted attachments from object storage and the database.
 * Safe to call repeatedly — each invocation processes up to BATCH_SIZE rows.
 */
export async function purgeDeletedAttachments(log?: Log): Promise<void> {
  const rows = await pool.query<SoftDeletedAttachment>(
    `SELECT id, storage_key
     FROM attachments
     WHERE deleted_at IS NOT NULL
     LIMIT $1`,
    [BATCH_SIZE]
  );

  if (rows.rowCount === 0) return;

  const attachments = rows.rows;
  const ids = attachments.map((a) => a.id);

  if (!USE_IN_MEMORY) {
    const objects = attachments.map((a) => ({ Key: a.storage_key }));
    try {
      const result = await s3.send(
        new DeleteObjectsCommand({
          Bucket: config.S3_BUCKET,
          Delete: { Objects: objects, Quiet: true },
        })
      );
      // Quiet mode: only errors are returned in result.Errors.
      // NoSuchKey is treated as success (already deleted).
      if (result.Errors && result.Errors.length > 0) {
        const nonMissing = result.Errors.filter((e) => e.Code !== "NoSuchKey");
        if (nonMissing.length > 0) {
          const keys = nonMissing.map((e) => e.Key).join(", ");
          throw new Error(`S3 DeleteObjects failed for keys: ${keys}`);
        }
      }
    } catch (err) {
      pool.query(
        "SELECT pg_notify($1, $2)",
        ["attachment_purge_error", String(err)]
      ).catch(() => undefined);
      throw err;
    }
  }

  await pool.query(
    "DELETE FROM attachment_access WHERE attachment_id = ANY($1::uuid[])",
    [ids]
  );

  const deleted = await pool.query(
    "DELETE FROM attachments WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL RETURNING id",
    [ids]
  );

  const count = deleted.rowCount ?? 0;
  recordRetentionDeleted("attachments_purged", count);
  if (count > 0) {
    log?.info(`[attachment-lifecycle] purged ${count} attachment(s) from object storage and database`);
  }
}
