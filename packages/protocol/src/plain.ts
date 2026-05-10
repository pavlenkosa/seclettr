import { z } from "zod";
import { wireObject } from "./common.js";

export const PLAIN_PROTOCOL_VERSION = 1 as const;

const MAX_PLAIN_TEXT_LENGTH = 4096;
const MAX_GROUP_NAME_LENGTH = 100;

// ─── Shared leaf schemas ──────────────────────────────────────────────────────

export const PlainMessageTypeSchema = z.enum([
  "text",
  "attachment",
  "voice_note",
  "video_note",
]);
export type PlainMessageType = z.infer<typeof PlainMessageTypeSchema>;

export const PlainAttachmentMetaSchema = wireObject({
  attachmentId: z.string().uuid(),
  contentType: z.string().max(128),
  fileName: z.string().max(255).optional(),
  size: z.number().int().positive(),
  durationMs: z.number().int().positive().optional(),
  mediaGroupId: z.string().uuid().optional(),
});
export type PlainAttachmentMeta = z.infer<typeof PlainAttachmentMetaSchema>;

export const PlainReplyMetaSchema = wireObject({
  id: z.string().uuid(),
  content: z.string().max(200),
  senderName: z.string().max(64).optional(),
});
export type PlainReplyMeta = z.infer<typeof PlainReplyMetaSchema>;

// ─── Wire message shape (server → client) ────────────────────────────────────

export const PlainMessageSchema = wireObject({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  senderUsername: z.string().min(1).max(64),
  /** Set for DM threads */
  recipientUserId: z.string().uuid().optional(),
  /** Set for group threads */
  groupId: z.string().uuid().optional(),
  content: z.string().max(MAX_PLAIN_TEXT_LENGTH),
  messageType: PlainMessageTypeSchema,
  attachment: PlainAttachmentMetaSchema.optional(),
  replyTo: PlainReplyMetaSchema.optional(),
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().optional(),
});
export type PlainMessage = z.infer<typeof PlainMessageSchema>;

// ─── Send DM ──────────────────────────────────────────────────────────────────

export const SendPlainMessageRequestSchema = wireObject({
  version: z.literal(PLAIN_PROTOCOL_VERSION),
  clientId: z.string().uuid(),
  content: z.string().max(MAX_PLAIN_TEXT_LENGTH),
  messageType: PlainMessageTypeSchema,
  attachmentId: z.string().uuid().optional(),
  durationMs: z.number().int().positive().optional(),
  replyToId: z.string().uuid().optional(),
  mediaGroupId: z.string().uuid().optional(),
}).superRefine((msg, ctx) => {
  if (msg.messageType !== "text" && !msg.attachmentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attachmentId"],
      message: "attachmentId required for non-text messages",
    });
  }
});
export type SendPlainMessageRequest = z.infer<typeof SendPlainMessageRequestSchema>;

export const SendPlainMessageResponseSchema = wireObject({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type SendPlainMessageResponse = z.infer<typeof SendPlainMessageResponseSchema>;

// ─── History (paginated cursor) ───────────────────────────────────────────────

export const PlainHistoryResponseSchema = wireObject({
  messages: z.array(PlainMessageSchema),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
});
export type PlainHistoryResponse = z.infer<typeof PlainHistoryResponseSchema>;

// ─── Edit / Delete ────────────────────────────────────────────────────────────

export const EditPlainMessageRequestSchema = wireObject({
  content: z.string().min(1).max(MAX_PLAIN_TEXT_LENGTH),
});
export type EditPlainMessageRequest = z.infer<typeof EditPlainMessageRequestSchema>;

// ─── Plain Groups ─────────────────────────────────────────────────────────────

export const CreatePlainGroupRequestSchema = wireObject({
  version: z.literal(PLAIN_PROTOCOL_VERSION),
  name: z.string().min(1).max(MAX_GROUP_NAME_LENGTH),
  memberUserIds: z.array(z.string().uuid()).min(1).max(255),
});
export type CreatePlainGroupRequest = z.infer<typeof CreatePlainGroupRequestSchema>;

export const PlainGroupMemberRoleSchema = z.enum(["owner", "admin", "member"]);
export type PlainGroupMemberRole = z.infer<typeof PlainGroupMemberRoleSchema>;

export const PlainGroupMemberSchema = wireObject({
  userId: z.string().uuid(),
  username: z.string().min(1).max(64),
  role: PlainGroupMemberRoleSchema,
  joinedAt: z.string().datetime(),
});
export type PlainGroupMember = z.infer<typeof PlainGroupMemberSchema>;

export const PlainGroupSchema = wireObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(MAX_GROUP_NAME_LENGTH),
  creatorId: z.string().uuid(),
  members: z.array(PlainGroupMemberSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PlainGroup = z.infer<typeof PlainGroupSchema>;

export const PlainGroupListResponseSchema = wireObject({
  groups: z.array(PlainGroupSchema),
});
export type PlainGroupListResponse = z.infer<typeof PlainGroupListResponseSchema>;

export const AddPlainGroupMemberRequestSchema = wireObject({
  userId: z.string().uuid(),
});
export type AddPlainGroupMemberRequest = z.infer<typeof AddPlainGroupMemberRequestSchema>;

export const UpdatePlainGroupMemberRoleRequestSchema = wireObject({
  role: PlainGroupMemberRoleSchema,
});
export type UpdatePlainGroupMemberRoleRequest = z.infer<typeof UpdatePlainGroupMemberRoleRequestSchema>;

// ─── Plain Attachments ────────────────────────────────────────────────────────

export const InitPlainUploadRequestSchema = wireObject({
  size: z.number().int().positive(),
  contentType: z.string().max(128),
  fileName: z.string().max(255).optional(),
});
export type InitPlainUploadRequest = z.infer<typeof InitPlainUploadRequestSchema>;

export const InitPlainUploadResponseSchema = wireObject({
  attachmentId: z.string().uuid(),
  uploadUrl: z.string().url(),
  uploadFields: z.record(z.string()).optional(),
  expiresAt: z.string().datetime(),
});
export type InitPlainUploadResponse = z.infer<typeof InitPlainUploadResponseSchema>;

export const ConfirmPlainUploadResponseSchema = wireObject({
  attachmentId: z.string().uuid(),
  downloadUrl: z.string().url(),
});
export type ConfirmPlainUploadResponse = z.infer<typeof ConfirmPlainUploadResponseSchema>;
