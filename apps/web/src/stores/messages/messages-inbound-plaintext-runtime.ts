import {
  PlaintextAttachmentMessageSchema,
  PlaintextSenderKeyDistributionMessageSchema,
} from "@seclettr/protocol";
import { importSenderKeyDistribution } from "@/lib/group-sender-key";
import { notifySenderKeyDistributionImported } from "@/lib/group-sender-key-events";
import { logger } from "@/lib/logger.js";
import type { InboundFailureDecision } from "./messages-inbound-failure-runtime";
import type {
  AttachmentMessageMeta,
  Message,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";

type InboundFailureHandler = (
  decision: InboundFailureDecision,
  error: unknown
) => Promise<void>;

export interface ParsedInboundBody {
  messageType: Message["type"];
  content: string;
  attachment?: AttachmentMessageMeta;
  replyTo?: Message["replyTo"];
}

export interface InboundPlaintextMessageMeta {
  id: string;
  type: "text" | "attachment" | "sender_key_distribution" | "call_signal";
  senderDeviceId: string;
}

export interface HandleSenderKeyDistributionParams {
  message: InboundPlaintextMessageMeta;
  rawBody: unknown;
  shared: MessagesRuntimeShared;
  schedulePendingMessageSync: (reason: string) => void;
  handleInboundFailure: InboundFailureHandler;
  commitTerminalAndFlushAck: (messageId: string) => Promise<void>;
}

export interface MessagesInboundPlaintextRuntime {
  parsePlaintextBody: (
    message: InboundPlaintextMessageMeta,
    plaintext: Uint8Array,
    handleInboundFailure: InboundFailureHandler
  ) => Promise<unknown>;
  handleSenderKeyDistributionMessage: (
    params: HandleSenderKeyDistributionParams
  ) => Promise<boolean>;
  parseIncomingMessageBody: (
    message: InboundPlaintextMessageMeta,
    rawBody: unknown,
    handleInboundFailure: InboundFailureHandler
  ) => Promise<ParsedInboundBody | null>;
}

/**
 * Owns inbound plaintext-branch parsing after decrypt: raw JSON, sender-key
 * distribution receive path, and text/attachment body shaping.
 */
export function createMessagesInboundPlaintextRuntime(): MessagesInboundPlaintextRuntime {
  async function parsePlaintextBody(
    message: InboundPlaintextMessageMeta,
    plaintext: Uint8Array,
    handleInboundFailure: InboundFailureHandler
  ): Promise<unknown> {
    try {
      return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    } catch (parseError) {
      await handleInboundFailure(
        {
          disposition: "quarantine",
          failureClass: "permanent_malformed_or_corrupt_payload",
          errorKind: "corrupted_payload",
        },
        parseError
      );
      return null;
    }
  }

  async function handleSenderKeyDistributionMessage({
    message,
    rawBody,
    shared,
    schedulePendingMessageSync,
    handleInboundFailure,
    commitTerminalAndFlushAck,
  }: HandleSenderKeyDistributionParams): Promise<boolean> {
    if (message.type !== "sender_key_distribution") {
      return false;
    }

    const storageKey = shared.getStorageKey();
    if (!storageKey) {
      logger.warn("[MSG] sender-key distribution ignored: storage key unavailable");
      return true;
    }

    const parsedDistribution =
      PlaintextSenderKeyDistributionMessageSchema.safeParse(rawBody);
    if (!parsedDistribution.success) {
      await handleInboundFailure(
        {
          disposition: "quarantine",
          failureClass: "permanent_malformed_or_corrupt_payload",
          errorKind: "corrupted_payload",
        },
        parsedDistribution.error
      );
      return true;
    }
    if (parsedDistribution.data.senderDeviceId !== message.senderDeviceId) {
      await handleInboundFailure(
        {
          disposition: "quarantine",
          failureClass: "trust_or_policy_failure",
          errorKind: "trust_failure",
        },
        new Error(
          `sender_key_distribution sender mismatch: ${parsedDistribution.data.senderDeviceId} != ${message.senderDeviceId}`
        )
      );
      return true;
    }

    try {
      await importSenderKeyDistribution(storageKey, parsedDistribution.data);
      notifySenderKeyDistributionImported({
        groupId: parsedDistribution.data.groupId,
        senderDeviceId: parsedDistribution.data.senderDeviceId,
        distributionId: parsedDistribution.data.distributionId,
      });
    } catch (distributionError) {
      await handleInboundFailure(
        {
          disposition: "retry",
          failureClass: "transient_local_crypto_state",
          errorKind: "decrypt_failed",
        },
        distributionError
      );
      return true;
    }

    await commitTerminalAndFlushAck(message.id);
    schedulePendingMessageSync("sender_key_distribution");
    return true;
  }

  async function parseIncomingMessageBody(
    message: InboundPlaintextMessageMeta,
    rawBody: unknown,
    handleInboundFailure: InboundFailureHandler
  ): Promise<ParsedInboundBody | null> {
    const rawReplyToId = (rawBody as { replyToId?: unknown })?.replyToId;
    const rawReplySnippet = (rawBody as { replySnippet?: unknown })?.replySnippet;
    const replyTo =
      typeof rawReplyToId === "string"
        ? {
            id: rawReplyToId,
            content: typeof rawReplySnippet === "string" ? rawReplySnippet : "",
          }
        : undefined;

    if (message.type !== "attachment") {
      const maybeText = (rawBody as { text?: unknown })?.text;
      if (typeof maybeText !== "string") {
        await handleInboundFailure(
          {
            disposition: "quarantine",
            failureClass: "permanent_malformed_or_corrupt_payload",
            errorKind: "corrupted_payload",
          },
          new Error(`Invalid text payload for message ${message.id}`)
        );
        return null;
      }
      return { messageType: "text", content: maybeText, replyTo };
    }

    const parsedAttachment = PlaintextAttachmentMessageSchema.safeParse(rawBody);
    if (!parsedAttachment.success) {
      await handleInboundFailure(
        {
          disposition: "quarantine",
          failureClass: "permanent_malformed_or_corrupt_payload",
          errorKind: "corrupted_payload",
        },
        parsedAttachment.error
      );
      return null;
    }

    const attachment = parsedAttachment.data;
    if (
      attachment.kind === "voice_note" ||
      attachment.mimeType.startsWith("audio/")
    ) {
      return {
        messageType: "attachment",
        content: "[voice note]",
        attachment,
        replyTo,
      };
    }
    if (
      attachment.kind === "video_note" ||
      attachment.mimeType.startsWith("video/")
    ) {
      return {
        messageType: "attachment",
        content: "[video note]",
        attachment,
        replyTo,
      };
    }
    return {
      messageType: "attachment",
      content: attachment.caption?.trim() ? attachment.caption : "[attachment]",
      attachment,
      replyTo,
    };
  }

  return {
    parsePlaintextBody,
    handleSenderKeyDistributionMessage,
    parseIncomingMessageBody,
  };
}
