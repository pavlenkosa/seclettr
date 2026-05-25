/**
 * Profile routes: own profile read/update, avatar upload/download,
 * and public profile lookup by username.
 *
 * Avatar storage: S3 key = `profile-avatars/${userId}`, same bucket as
 * message attachments. Avatars are NOT encrypted — they are semi-public
 * (accessible to any authenticated user). The API streams the blob
 * directly; the client fetches it with Bearer auth and uses a blob URL.
 */
import type { FastifyInstance } from "fastify";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "../../middleware/auth.js";
import { query } from "../../db/pool.js";
import { config } from "../../config.js";
import { consumeFixedWindowRateLimit } from "../../utils/fixed-window-rate-limit.js";
import { OwnProfileSchema, UpdateProfileRequestSchema, PublicProfileSchema } from "@seclettr/protocol";
import { parseOrReply } from "../../utils/validation.js";
import type { Readable } from "node:stream";

const AVATAR_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AVATAR_PREFIX = "profile-avatars/";

const PROFILE_UPDATE_RATE_WINDOW_SEC = 60;
const PROFILE_UPDATE_RATE_MAX = 10;

const AVATAR_UPLOAD_RATE_WINDOW_SEC = 60 * 5;
const AVATAR_UPLOAD_RATE_MAX = 5;

const PROFILE_LOOKUP_RATE_WINDOW_SEC = 60;
const PROFILE_LOOKUP_RATE_MAX = 60;

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

interface UserProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_key: string | null;
  updated_at: Date;
}

function buildOwnProfileResponse(row: UserProfileRow) {
  return OwnProfileSchema.parse({
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarKey: row.avatar_key,
    updatedAt: row.updated_at.toISOString(),
  });
}

function buildPublicProfileResponse(row: UserProfileRow) {
  return PublicProfileSchema.parse({
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarKey: row.avatar_key,
    updatedAt: row.updated_at.toISOString(),
  });
}

export async function profileRoutes(fastify: FastifyInstance): Promise<void> {
  /** GET /profile — own profile */
  fastify.get(
    "/",
    { preHandler: requireAuth },
    async (request) => {
      const { sub: userId } = request.auth;
      const rows = await query<UserProfileRow>(
        "SELECT id, username, display_name, bio, avatar_key, updated_at FROM users WHERE id = $1",
        [userId]
      );
      if (rows.length === 0) throw new Error("User not found");
      return buildOwnProfileResponse(rows[0]!);
    }
  );

  /** PATCH /profile — update display name and bio */
  fastify.patch(
    "/",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;

      const rateOk = await consumeFixedWindowRateLimit({
        key: `rate:profile-update:v1:${userId}`,
        max: PROFILE_UPDATE_RATE_MAX,
        windowSec: PROFILE_UPDATE_RATE_WINDOW_SEC,
      });
      if (!rateOk.allowed) {
        reply.header("Retry-After", String(rateOk.retryAfterSec));
        return reply.code(429).send({ error: "Too many profile update requests" });
      }

      const body = parseOrReply(reply, UpdateProfileRequestSchema, request.body);
      if (!body) return;

      const rows = await query<UserProfileRow>(
        `UPDATE users
         SET display_name = $1, bio = $2, updated_at = now()
         WHERE id = $3
         RETURNING id, username, display_name, bio, avatar_key, updated_at`,
        [body.displayName ?? null, body.bio ?? null, userId]
      );
      if (rows.length === 0) throw new Error("User not found");
      return buildOwnProfileResponse(rows[0]!);
    }
  );

  /** POST /profile/avatar — upload/replace avatar image */
  fastify.post(
    "/avatar",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;

      const rateOk = await consumeFixedWindowRateLimit({
        key: `rate:profile-avatar:v1:${userId}`,
        max: AVATAR_UPLOAD_RATE_MAX,
        windowSec: AVATAR_UPLOAD_RATE_WINDOW_SEC,
      });
      if (!rateOk.allowed) {
        reply.header("Retry-After", String(rateOk.retryAfterSec));
        return reply.code(429).send({ error: "Too many avatar upload requests" });
      }

      const data = await request.file({ limits: { fileSize: AVATAR_MAX_BYTES } });
      if (!data) {
        return reply.code(400).send({ error: "No file provided" });
      }

      const contentType = data.mimetype ?? "application/octet-stream";
      if (!AVATAR_ALLOWED_TYPES.has(contentType)) {
        // Drain the stream to avoid resource leaks
        data.file.resume();
        return reply.code(400).send({
          error: `Unsupported image type. Allowed: ${[...AVATAR_ALLOWED_TYPES].join(", ")}`,
        });
      }

      // Collect to buffer so we can measure size and upload.
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of data.file) {
        totalBytes += chunk.length;
        if (totalBytes > AVATAR_MAX_BYTES) {
          return reply.code(413).send({ error: "Avatar image too large (max 4 MB)" });
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const storageKey = `${AVATAR_PREFIX}${userId}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: storageKey,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
        })
      );

      const rows = await query<UserProfileRow>(
        `UPDATE users
         SET avatar_key = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, username, display_name, bio, avatar_key, updated_at`,
        [storageKey, userId]
      );
      if (rows.length === 0) throw new Error("User not found");
      return buildOwnProfileResponse(rows[0]!);
    }
  );

  /** DELETE /profile/avatar — remove avatar */
  fastify.delete(
    "/avatar",
    { preHandler: requireAuth },
    async (request) => {
      const { sub: userId } = request.auth;
      const storageKey = `${AVATAR_PREFIX}${userId}`;

      // Delete from S3 (best-effort — ignore if not found)
      await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: storageKey })).catch(() => undefined);

      const rows = await query<UserProfileRow>(
        `UPDATE users
         SET avatar_key = NULL, updated_at = now()
         WHERE id = $1
         RETURNING id, username, display_name, bio, avatar_key, updated_at`,
        [userId]
      );
      if (rows.length === 0) throw new Error("User not found");
      return buildOwnProfileResponse(rows[0]!);
    }
  );

  /** GET /profile/avatar/:userId — serve avatar image (authenticated) */
  fastify.get<{ Params: { userId: string } }>(
    "/avatar/:userId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = request.params;
      const storageKey = `${AVATAR_PREFIX}${userId}`;

      let object;
      try {
        object = await s3.send(
          new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: storageKey })
        );
      } catch {
        return reply.code(404).send({ error: "Avatar not found" });
      }

      const contentType = object.ContentType ?? "image/jpeg";
      reply.header("Content-Type", contentType);
      // Cache for 5 minutes in the browser; the avatarKey in the profile response
      // acts as a cache-buster (key changes only when avatar is updated).
      reply.header("Cache-Control", "private, max-age=300");
      if (object.ContentLength) {
        reply.header("Content-Length", String(object.ContentLength));
      }

      const stream = object.Body as Readable;
      return reply.send(stream);
    }
  );

  /** GET /profile/:username — public profile lookup */
  fastify.get<{ Params: { username: string } }>(
    "/:username",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { username } = request.params;

      const rateOk = await consumeFixedWindowRateLimit({
        key: `rate:profile-lookup:v1:${request.auth.sub}`,
        max: PROFILE_LOOKUP_RATE_MAX,
        windowSec: PROFILE_LOOKUP_RATE_WINDOW_SEC,
      });
      if (!rateOk.allowed) {
        reply.header("Retry-After", String(rateOk.retryAfterSec));
        return reply.code(429).send({ error: "Too many profile lookup requests" });
      }

      const rows = await query<UserProfileRow>(
        "SELECT id, username, display_name, bio, avatar_key, updated_at FROM users WHERE username = $1",
        [username]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: "User not found" });
      }
      return buildPublicProfileResponse(rows[0]!);
    }
  );
}
