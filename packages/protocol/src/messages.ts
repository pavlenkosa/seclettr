import { z } from "zod";
import {
  type StripVersion,
  MESSAGE_PROTOCOL_VERSION,
  wireObject,
  versionedWireObject,
} from "./common.js";

export { MESSAGE_PROTOCOL_VERSION } from "./common.js";

const MAX_ENVELOPE_BASE64_LENGTH = 196_608;
const MAX_KEY_MATERIAL_BASE64_LENGTH = 256;
const MAX_SIGNATURE_BASE64_LENGTH = 128;
const MAX_ATTACHMENT_SECRET_BASE64_LENGTH = 128;

export const MessageTypeSchema = z.enum([
  "text",
  "attachment",
  "sender_key_distribution",
  "call_signal",
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

const X3dhHeaderSchema = wireObject({
  ephemeralKey: z.string().min(1).max(MAX_KEY_MATERIAL_BASE64_LENGTH),
  signedPreKeyId: z.number().int(),
  oneTimePreKeyId: z.number().int().optional(),
  senderIdentityKey: z.string().min(1).max(MAX_KEY_MATERIAL_BASE64_LENGTH),
});

export const EncryptedMessageSchema = wireObject({
  id: z.string().uuid(),
  senderUserId: z.string().uuid(),
  senderDeviceId: z.string().uuid(),
  recipientDeviceId: z.string().uuid(),
  type: MessageTypeSchema,
  ciphertext: z.string().min(1).max(MAX_ENVELOPE_BASE64_LENGTH),
  x3dhHeader: X3dhHeaderSchema.optional(),
  createdAt: z.string().datetime(),
});
export type EncryptedMessage = z.infer<typeof EncryptedMessageSchema>;

const SendMessageEnvelopeSchema = wireObject({
  recipientDeviceId: z.string().uuid(),
  ciphertext: z.string().min(1).max(MAX_ENVELOPE_BASE64_LENGTH),
  type: MessageTypeSchema,
  x3dhHeader: X3dhHeaderSchema.optional(),
  oneTimePreKeyReservationToken: z.string().min(32).max(2048).optional(),
  attachmentId: z.string().uuid().optional(),
}).superRefine((message, ctx) => {
  if (message.type === "attachment" && !message.attachmentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attachmentId"],
      message: "attachmentId is required for attachment messages",
    });
  }
  if (
    message.x3dhHeader?.oneTimePreKeyId !== undefined &&
    !message.oneTimePreKeyReservationToken
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["oneTimePreKeyReservationToken"],
      message:
        "oneTimePreKeyReservationToken is required when x3dhHeader.oneTimePreKeyId is present",
    });
  }
  if (
    message.x3dhHeader?.oneTimePreKeyId === undefined &&
    message.oneTimePreKeyReservationToken
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["oneTimePreKeyReservationToken"],
      message:
        "oneTimePreKeyReservationToken is only valid for OTK-backed X3DH session init",
    });
  }
});

export const SendMessageRequestSchema = versionedWireObject(
  MESSAGE_PROTOCOL_VERSION,
  {
    clientMessageId: z.string().uuid(),
    recipientUserId: z.string().uuid(),
    messages: z.array(SendMessageEnvelopeSchema).min(1).max(50),
  }
);
export type SendMessageRequestWire = z.infer<typeof SendMessageRequestSchema>;
export type SendMessageRequest = StripVersion<SendMessageRequestWire>;

export const SendMessageResponseSchema = versionedWireObject(
  MESSAGE_PROTOCOL_VERSION,
  {
    messageId: z.string().uuid(),
    timestamp: z.string().datetime(),
  }
);
export type SendMessageResponseWire = z.infer<typeof SendMessageResponseSchema>;
export type SendMessageResponse = StripVersion<SendMessageResponseWire>;

export const PendingMessagesResponseSchema = versionedWireObject(
  MESSAGE_PROTOCOL_VERSION,
  {
    messages: z.array(EncryptedMessageSchema).max(500),
  }
);
export type PendingMessagesResponseWire = z.infer<
  typeof PendingMessagesResponseSchema
>;
export type PendingMessagesResponse = StripVersion<PendingMessagesResponseWire>;

export const MessageAckResponseSchema = versionedWireObject(
  MESSAGE_PROTOCOL_VERSION,
  {
    ok: z.literal(true),
  }
);
export type MessageAckResponseWire = z.infer<typeof MessageAckResponseSchema>;
export type MessageAckResponse = StripVersion<MessageAckResponseWire>;

export const SendGroupMessageRequestSchema = versionedWireObject(
  MESSAGE_PROTOCOL_VERSION,
  {
    clientMessageId: z.string().uuid(),
    groupId: z.string().uuid(),
    distributionId: z.string().uuid(),
    chainId: z.number().int().min(0),
    messageId: z.number().int().min(0),
    ciphertext: z.string().min(1).max(MAX_ENVELOPE_BASE64_LENGTH),
    signature: z.string().min(1).max(MAX_SIGNATURE_BASE64_LENGTH),
    type: MessageTypeSchema,
    /** Required when type === "attachment" — references the uploaded encrypted blob. */
    attachmentId: z.string().uuid().optional(),
    /** 0 = legacy empty AEAD AD; 1 = distributionId+chainId+messageId AD. Default 1 for new messages. */
    aeadVersion: z.number().int().min(0).max(1).optional().default(1),
  }
);
export type SendGroupMessageRequestWire = z.infer<
  typeof SendGroupMessageRequestSchema
>;
export type SendGroupMessageRequest = StripVersion<SendGroupMessageRequestWire>;

export const SendGroupMessageResponseSchema = versionedWireObject(
  MESSAGE_PROTOCOL_VERSION,
  {
    ok: z.literal(true),
    serverMessageId: z.string().uuid(),
    createdAt: z.string().datetime(),
  }
);
export type SendGroupMessageResponseWire = z.infer<
  typeof SendGroupMessageResponseSchema
>;
export type SendGroupMessageResponse =
  StripVersion<SendGroupMessageResponseWire>;

export const PlaintextTextMessageSchema = wireObject({
  text: z.string().max(65536),
  replyToId: z.string().uuid().optional(),
  replySnippet: z.string().max(200).optional(),
});
export type PlaintextTextMessage = z.infer<typeof PlaintextTextMessageSchema>;

export const PlaintextAttachmentMessageSchema = wireObject({
  key: z.string().min(1).max(MAX_ATTACHMENT_SECRET_BASE64_LENGTH),
  digest: z.string().min(1).max(MAX_ATTACHMENT_SECRET_BASE64_LENGTH),
  attachmentId: z.string().uuid(),
  mimeType: z.string().max(128),
  fileName: z.string().max(255).optional(),
  size: z.number().int().positive(),
  caption: z.string().max(2048).optional(),
  kind: z.enum(["file", "voice_note", "video_note"]).optional(),
  durationMs: z.number().int().positive().max(120000).optional(),
  /** Groups multiple attachments sent together into a single visual album. */
  mediaGroupId: z.string().uuid().optional(),
});
export type PlaintextAttachmentMessage = z.infer<
  typeof PlaintextAttachmentMessageSchema
>;

export const PlaintextSenderKeyDistributionMessageSchema = wireObject({
  schemaVersion: z.literal(1),
  type: z.literal("sender_key_distribution"),
  groupId: z.string().uuid(),
  senderDeviceId: z.string().uuid(),
  distributionId: z.string().uuid(),
  chainId: z.number().int().min(0),
  chainKey: z.string().min(1).max(MAX_KEY_MATERIAL_BASE64_LENGTH),
  signingKey: z.string().min(1).max(MAX_KEY_MATERIAL_BASE64_LENGTH),
});
export type PlaintextSenderKeyDistributionMessage = z.infer<
  typeof PlaintextSenderKeyDistributionMessageSchema
>;
