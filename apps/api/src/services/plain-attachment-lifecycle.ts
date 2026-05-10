/**
 * Plain attachment hard-delete lifecycle.
 *
 * Mirrors `attachment-lifecycle.ts` for the unencrypted bucket. The retention
 * pass marks orphaned plain_attachments soft-deleted (deleted_at IS NOT NULL).
 * This module performs the second phase:
 *   1. Delete the object from S3/MinIO (`<S3_BUCKET>-plain`)
 *   2. Hard-delete the plain_attachments row from the database
 *
 * Stages are ordered so a partial failure leaves rows in a retryable state:
 * if S3 deletion fails the row stays soft-deleted and is retried next run.
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

const PLAIN_BUCKET = `${config.S3_BUCKET}-plain`;

/** Maximum rows processed per invocation to bound memory and S3 request size. */
const BATCH_SIZE = 50;

interface SoftDeletedPlainAttachment {
  id: string;
  storage_key: string;
}

type Log = { info: (msg: string) => void };

export async function purgeDeletedPlainAttachments(log?: Log): Promise<void> {
  const rows = await pool.query<SoftDeletedPlainAttachment>(
    `SELECT id, storage_key
     FROM plain_attachments
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
          Bucket: PLAIN_BUCKET,
          Delete: { Objects: objects, Quiet: true },
        })
      );
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
        ["plain_attachment_purge_error", String(err)]
      ).catch(() => undefined);
      throw err;
    }
  }

  const deleted = await pool.query(
    "DELETE FROM plain_attachments WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL RETURNING id",
    [ids]
  );

  const count = deleted.rowCount ?? 0;
  recordRetentionDeleted("plain_attachments_purged", count);
  if (count > 0) {
    log?.info(`[plain-attachment-lifecycle] purged ${count} attachment(s) from object storage and database`);
  }
}
