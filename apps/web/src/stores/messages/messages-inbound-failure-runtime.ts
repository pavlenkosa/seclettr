import { logger } from "@/lib/logger.js";
import { shouldHydrateUserLabel } from "@/lib/user-labels";
import { persistConversations } from "./conversation-persistence";
import type { WsServerMessage } from "@seclettr/protocol";
import type {
  Conversation,
  GetMessagesState,
  IncomingDecryptErrorKind,
  Message,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import type { ReplaceOrAppendResult } from "./messages-inbound-conversation-runtime";

export type InboundFailureClass =
  | "transient_local_crypto_state"
  | "transient_ordering_or_session_dependency"
  | "permanent_malformed_or_corrupt_payload"
  | "trust_or_policy_failure";

export interface InboundFailureDecision {
  disposition: "retry" | "quarantine";
  failureClass: InboundFailureClass;
  errorKind: Exclude<IncomingDecryptErrorKind, undefined>;
  clearSession?: boolean;
}

const INCOMING_DECRYPT_ERROR_CONTENT: Record<
  Exclude<IncomingDecryptErrorKind, undefined>,
  string
> = {
  decrypt_failed: "[unable to decrypt message]",
  session_missing: "[message requires session resync]",
  corrupted_payload: "[corrupted encrypted message]",
  trust_failure: "[message quarantined due to trust policy]",
};

type IncomingMessageNew = WsServerMessage & { type: "message.new" };
type IncomingServerMessagePayload = IncomingMessageNew["message"];

export interface MessagesInboundFailureRuntimeDeps {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: MessagesRuntimeShared;
  getOrCreateConversation: (
    conversations: Record<string, Conversation>,
    userId: string
  ) => Conversation;
  replaceOrAppendMessage: (
    messages: Message[],
    messageId: string,
    nextMessage: Message
  ) => ReplaceOrAppendResult;
}

export interface MessagesInboundFailureRuntime {
  flushPendingAckForMessage: (messageId: string) => Promise<void>;
  commitTerminalAndFlushAck: (messageId: string) => Promise<void>;
  classifyUnexpectedInboundFailure: (
    message: IncomingServerMessagePayload,
    error: unknown
  ) => InboundFailureDecision;
  handleInboundFailure: (
    message: IncomingServerMessagePayload,
    decision: InboundFailureDecision,
    error: unknown
  ) => Promise<void>;
}

/**
 * Owns inbound failure policy only: classification, decrypt-error placeholders,
 * and terminal/quarantine ACK settlement for encrypted direct receive.
 */
export function createMessagesInboundFailureRuntime(
  deps: MessagesInboundFailureRuntimeDeps
): MessagesInboundFailureRuntime {
  const { set, get, shared, getOrCreateConversation, replaceOrAppendMessage } =
    deps;

  async function persistIncomingDecryptError(
    message: IncomingServerMessagePayload,
    kind: Exclude<IncomingDecryptErrorKind, undefined>
  ): Promise<void> {
    const senderId = message.senderUserId;
    const timestampMs = Date.parse(message.createdAt);
    const timestamp = Number.isNaN(timestampMs) ? Date.now() : timestampMs;
    const content = INCOMING_DECRYPT_ERROR_CONTENT[kind];

    let nextConversations: Record<string, Conversation> | null = null;
    set((state) => {
      const existingConversation = getOrCreateConversation(
        state.conversations,
        senderId
      );
      const incomingErrorMessage: Message = {
        id: message.id,
        senderId,
        senderDeviceId: message.senderDeviceId,
        content,
        type: "text",
        timestamp,
        status: "error",
        errorKind: kind,
        isOwn: false,
      };
      const { messages, existingMessageIndex } = replaceOrAppendMessage(
        existingConversation.messages,
        message.id,
        incomingErrorMessage
      );
      const isNewMessage = existingMessageIndex < 0;
      const newMessageDelta = isNewMessage ? 1 : 0;
      const isActiveConversation = state.activeConversationId === senderId;
      const unreadCount = isActiveConversation
        ? 0
        : existingConversation.unreadCount + newMessageDelta;

      nextConversations = {
        ...state.conversations,
        [senderId]: {
          ...existingConversation,
          messages,
          lastMessageAt: Math.max(existingConversation.lastMessageAt, timestamp),
          unreadCount,
        },
      };

      return {
        conversations: nextConversations,
      };
    });

    if (nextConversations) {
      await persistConversations(nextConversations);
    }

    if (
      shouldHydrateUserLabel(get().conversations[senderId]?.username, senderId)
    ) {
      void get().ensureConversationUsername(senderId);
    }
  }

  async function flushPendingAckForMessage(messageId: string): Promise<void> {
    await shared.inboundTrackingCoordinator.flushPendingAckForMessage(
      set,
      get,
      messageId
    );
  }

  async function commitTerminalAndFlushAck(messageId: string): Promise<void> {
    await shared.inboundTrackingCoordinator.commitTerminalMessageState(
      set,
      get,
      messageId
    );
    await flushPendingAckForMessage(messageId);
  }

  function classifyUnexpectedInboundFailure(
    _message: IncomingServerMessagePayload,
    error: unknown
  ): InboundFailureDecision {
    const missingOneTimePreKey =
      error instanceof Error &&
      error.message.startsWith("Missing one-time prekey");
    if (missingOneTimePreKey) {
      return {
        disposition: "retry",
        failureClass: "transient_ordering_or_session_dependency",
        errorKind: "session_missing",
      };
    }

    const isDecryptOpError =
      error instanceof Error && error.name === "OperationError";

    return {
      disposition: "retry",
      failureClass: "transient_local_crypto_state",
      errorKind: "decrypt_failed",
      clearSession: isDecryptOpError,
    };
  }

  async function persistRetryableFailure(
    message: IncomingServerMessagePayload,
    decision: InboundFailureDecision,
    error: unknown
  ): Promise<void> {
    logger.warn(
      "[MSG] transient inbound failure",
      message.id,
      "class=",
      decision.failureClass,
      error
    );
    if (message.type !== "sender_key_distribution") {
      await persistIncomingDecryptError(message, decision.errorKind);
    }
    if (decision.clearSession) {
      await shared.messageSessionRuntime
        .clearSession(message.senderDeviceId)
        .catch(() => null);
    }
  }

  async function persistQuarantinedFailure(
    message: IncomingServerMessagePayload,
    decision: InboundFailureDecision,
    error: unknown
  ): Promise<void> {
    logger.warn(
      "[MSG] quarantining inbound message",
      message.id,
      "class=",
      decision.failureClass,
      error
    );
    if (message.type !== "sender_key_distribution") {
      await persistIncomingDecryptError(message, decision.errorKind);
    }
    if (decision.clearSession) {
      await shared.messageSessionRuntime
        .clearSession(message.senderDeviceId)
        .catch(() => null);
    }
    await shared.inboundTrackingCoordinator.commitTerminalMessageState(
      set,
      get,
      message.id,
      { quarantined: true }
    );
    await flushPendingAckForMessage(message.id);
  }

  async function handleInboundFailure(
    message: IncomingServerMessagePayload,
    decision: InboundFailureDecision,
    error: unknown
  ): Promise<void> {
    if (decision.disposition === "quarantine") {
      await persistQuarantinedFailure(message, decision, error);
      return;
    }
    await persistRetryableFailure(message, decision, error);
  }

  return {
    flushPendingAckForMessage,
    commitTerminalAndFlushAck,
    classifyUnexpectedInboundFailure,
    handleInboundFailure,
  };
}
