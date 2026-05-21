/**
 * Per-user folders for plain chats (DMs and groups).
 *
 * GET    /plain/folders                              → list folders + chat assignments
 * POST   /plain/folders                              → create folder
 * PATCH  /plain/folders/:folderId                    → rename folder
 * DELETE /plain/folders/:folderId                    → delete folder (chats go back to "All")
 * PUT    /plain/folders/:folderId/chats/:kind/:id    → assign chat to folder
 * DELETE /plain/folders/:folderId/chats/:kind/:id    → remove chat from folder
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  MAX_FOLDER_NAME_LENGTH,
  MAX_FOLDERS_PER_USER,
  PlainChatPinKindSchema,
} from "@seclettr/protocol";
import { requireAuth } from "../../middleware/auth.js";
import { query, transaction } from "../../db/pool.js";

const FolderParamsSchema = z.object({
  folderId: z.string().uuid(),
});

const ChatParamsSchema = z.object({
  folderId: z.string().uuid(),
  peerKind: PlainChatPinKindSchema,
  peerId: z.string().uuid(),
});

const FolderBodySchema = z.object({
  name: z.string().min(1).max(MAX_FOLDER_NAME_LENGTH),
});

type FolderRow = {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
};

type EntryRow = {
  folder_id: string;
  peer_kind: string;
  peer_id: string;
};

function formatFolder(row: FolderRow) {
  return {
    folderId: row.id,
    name: row.name,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function plainFolderRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /plain/folders ──────────────────────────────────────────────────────
  fastify.get("/", { preHandler: requireAuth }, async (request, reply) => {
    const { sub: userId } = request.auth;

    const [folders, entries] = await Promise.all([
      query<FolderRow>(
        `SELECT id, name, display_order,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
         FROM plain_chat_folders
         WHERE user_id = $1
         ORDER BY display_order, created_at`,
        [userId]
      ),
      query<EntryRow>(
        `SELECT e.folder_id, e.peer_kind, e.peer_id
         FROM plain_chat_folder_entries e
         INNER JOIN plain_chat_folders f ON f.id = e.folder_id
         WHERE f.user_id = $1`,
        [userId]
      ),
    ]);

    return reply.code(200).send({
      folders: folders.map(formatFolder),
      entries: entries.map((e) => ({
        folderId: e.folder_id,
        peerKind: e.peer_kind,
        peerId: e.peer_id,
      })),
    });
  });

  // ── POST /plain/folders ─────────────────────────────────────────────────────
  fastify.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const { sub: userId } = request.auth;
    const parsed = FolderBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body" });
    const { name } = parsed.data;

    const [existing] = await query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM plain_chat_folders WHERE user_id = $1",
      [userId]
    );
    if (Number(existing?.count ?? 0) >= MAX_FOLDERS_PER_USER) {
      return reply.code(409).send({ error: `Folder limit reached (max ${MAX_FOLDERS_PER_USER})` });
    }

    const [maxOrder] = await query<{ max_order: number | null }>(
      "SELECT MAX(display_order) AS max_order FROM plain_chat_folders WHERE user_id = $1",
      [userId]
    );
    const nextOrder = (maxOrder?.max_order ?? -1) + 1;

    const [folder] = await query<FolderRow>(
      `INSERT INTO plain_chat_folders (user_id, name, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, display_order,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
         to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`,
      [userId, name, nextOrder]
    );
    if (!folder) return reply.code(500).send({ error: "Insert failed" });

    return reply.code(201).send(formatFolder(folder));
  });

  // ── PATCH /plain/folders/:folderId ──────────────────────────────────────────
  fastify.patch<{ Params: { folderId: string } }>(
    "/:folderId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;
      const paramsParsed = FolderParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) return reply.code(400).send({ error: "Invalid params" });

      const bodyParsed = FolderBodySchema.safeParse(request.body);
      if (!bodyParsed.success) return reply.code(400).send({ error: "Invalid body" });

      const { folderId } = paramsParsed.data;
      const { name } = bodyParsed.data;

      const [updated] = await query<FolderRow>(
        `UPDATE plain_chat_folders
         SET name = $1, updated_at = now()
         WHERE id = $2 AND user_id = $3
         RETURNING id, name, display_order,
           to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
           to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`,
        [name, folderId, userId]
      );
      if (!updated) return reply.code(404).send({ error: "Folder not found" });

      return reply.code(200).send(formatFolder(updated));
    }
  );

  // ── DELETE /plain/folders/:folderId ─────────────────────────────────────────
  fastify.delete<{ Params: { folderId: string } }>(
    "/:folderId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;
      const paramsParsed = FolderParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) return reply.code(400).send({ error: "Invalid params" });

      const { folderId } = paramsParsed.data;
      await query(
        "DELETE FROM plain_chat_folders WHERE id = $1 AND user_id = $2",
        [folderId, userId]
      );
      // Entries cascade-delete via FK.
      return reply.code(204).send();
    }
  );

  // ── PUT /plain/folders/:folderId/chats/:peerKind/:peerId ────────────────────
  fastify.put<{ Params: { folderId: string; peerKind: string; peerId: string } }>(
    "/:folderId/chats/:peerKind/:peerId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;
      const paramsParsed = ChatParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) return reply.code(400).send({ error: "Invalid params" });
      const { folderId, peerKind, peerId } = paramsParsed.data;

      // Verify folder belongs to caller.
      const [folder] = await query<{ id: string }>(
        "SELECT id FROM plain_chat_folders WHERE id = $1 AND user_id = $2",
        [folderId, userId]
      );
      if (!folder) return reply.code(404).send({ error: "Folder not found" });

      // Verify caller has access to the chat.
      if (peerKind === "dm") {
        const [peer] = await query<{ id: string }>(
          "SELECT id FROM users WHERE id = $1",
          [peerId]
        );
        if (!peer) return reply.code(404).send({ error: "Peer not found" });
      } else {
        const [membership] = await query<{ user_id: string }>(
          "SELECT user_id FROM plain_group_members WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL",
          [peerId, userId]
        );
        if (!membership) return reply.code(403).send({ error: "Not a member" });
      }

      // Move the chat: remove from any existing folder owned by this user, then insert.
      await transaction(async (client) => {
        await client.query(
          `DELETE FROM plain_chat_folder_entries e
           USING plain_chat_folders f
           WHERE e.folder_id = f.id
             AND f.user_id = $1
             AND e.peer_kind = $2
             AND e.peer_id = $3`,
          [userId, peerKind, peerId]
        );
        await client.query(
          `INSERT INTO plain_chat_folder_entries (folder_id, peer_kind, peer_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [folderId, peerKind, peerId]
        );
      });

      return reply.code(204).send();
    }
  );

  // ── DELETE /plain/folders/:folderId/chats/:peerKind/:peerId ─────────────────
  fastify.delete<{ Params: { folderId: string; peerKind: string; peerId: string } }>(
    "/:folderId/chats/:peerKind/:peerId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;
      const paramsParsed = ChatParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) return reply.code(400).send({ error: "Invalid params" });
      const { folderId, peerKind, peerId } = paramsParsed.data;

      // Verify folder belongs to caller before deleting entry.
      const [folder] = await query<{ id: string }>(
        "SELECT id FROM plain_chat_folders WHERE id = $1 AND user_id = $2",
        [folderId, userId]
      );
      if (!folder) return reply.code(404).send({ error: "Folder not found" });

      await query(
        "DELETE FROM plain_chat_folder_entries WHERE folder_id = $1 AND peer_kind = $2 AND peer_id = $3",
        [folderId, peerKind, peerId]
      );
      return reply.code(204).send();
    }
  );
}
