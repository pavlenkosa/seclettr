import {
  getCachedUserLabel,
  primeUserLabelCache,
  shouldHydrateUserLabel,
} from "@/lib/user-labels";
import { persistConversations } from "./conversation-persistence";
import type {
  Conversation,
  GetMessagesState,
  Message,
  MessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import type { ParsedInboundBody } from "./messages-inbound-plaintext-runtime";
import type { WsServerMessage } from "@seclettr/protocol";

type IncomingMessageNew = WsServerMessage & { type: "message.new" };
type IncomingServerMessagePayload = IncomingMessageNew["message"];

export interface ReplaceOrAppendResult {
  messages: Message[];
  existingMessageIndex: number;
}

export interface PersistParsedIncomingMessageParams {
  message: IncomingServerMessagePayload;
  parsedBody: ParsedInboundBody;
  commitTerminalAndFlushAck: (messageId: string) => Promise<void>;
}

export interface MessagesInboundConversationRuntimeDeps {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: Pick<MessagesRuntimeShared, "peerIdentityRuntime">;
  trySendReadReceipt: (messageId: string) => boolean;
  queueReadReceipt: (messageId: string) => Promise<void>;
}

export interface MessagesInboundConversationRuntime {
  persistParsedIncomingMessage: (
    params: PersistParsedIncomingMessageParams
  ) => Promise<void>;
}

export function getOrCreateConversation(
  conversations: Record<string, Conversation>,
  userId: string
): Conversation {
  return (
    conversations[userId] ?? {
      userId,
      username: getCachedUserLabel(userId) ?? userId,
      messages: [],
      lastMessageAt: 0,
      unreadCount: 0,
    }
  );
}

export function replaceOrAppendMessage(
  messages: Message[],
  messageId: string,
  nextMessage: Message
): ReplaceOrAppendResult {
  const existingMessageIndex = messages.findIndex(
    (entry) => entry.id === messageId
  );
  if (existingMessageIndex < 0) {
    return {
      messages: [...messages, nextMessage],
      existingMessageIndex,
    };
  }

  return {
    messages: messages.map((entry, index) =>
      index === existingMessageIndex
        ? {
            ...entry,
            ...nextMessage,
            isOwn: false,
          }
        : entry
    ),
    existingMessageIndex,
  };
}

function buildDeliveredConversations(
  state: MessagesState,
  message: IncomingServerMessagePayload,
  newMessage: Message,
  peerIdentityKeyFromHeader?: string
): Record<string, Conversation> {
  const senderId = message.senderUserId;
  const conversation = getOrCreateConversation(state.conversations, senderId);
  const nextPeerIdentityByDevice = {
    ...conversation.peerIdentityByDevice,
    ...(peerIdentityKeyFromHeader
      ? { [message.senderDeviceId]: peerIdentityKeyFromHeader }
      : {}),
  };
  const hasIdentityForSenderDevice = Boolean(
    nextPeerIdentityByDevice[message.senderDeviceId]
  );
  const nextPeerIdentityDeviceId = hasIdentityForSenderDevice
    ? message.senderDeviceId
    : conversation.peerIdentityDeviceId;
  const nextPeerIdentityKey =
    nextPeerIdentityDeviceId && nextPeerIdentityByDevice[nextPeerIdentityDeviceId]
      ? nextPeerIdentityByDevice[nextPeerIdentityDeviceId]
      : conversation.peerIdentityKey;
  const { messages, existingMessageIndex } = replaceOrAppendMessage(
    conversation.messages,
    message.id,
    {
      ...newMessage,
      errorKind: undefined,
    }
  );
  const unreadIncrement = existingMessageIndex >= 0 ? 0 : 1;
  const unreadCount =
    state.activeConversationId === senderId
      ? 0
      : conversation.unreadCount + unreadIncrement;

  return {
    ...state.conversations,
    [senderId]: {
      ...conversation,
      messages,
      lastMessageAt: Math.max(conversation.lastMessageAt, newMessage.timestamp),
      unreadCount,
      peerIdentityKey: nextPeerIdentityKey,
      peerIdentityDeviceId: nextPeerIdentityDeviceId,
      peerIdentityByDevice:
        Object.keys(nextPeerIdentityByDevice).length > 0
          ? nextPeerIdentityByDevice
          : conversation.peerIdentityByDevice,
    },
  };
}

function buildReadConversations(
  state: MessagesState,
  senderId: string,
  messageId: string
): Record<string, Conversation> | null {
  const conversation = state.conversations[senderId];
  if (!conversation) return null;

  let changed = false;
  const messages = conversation.messages.map((entry) => {
    if (entry.id !== messageId || entry.status === "read") {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      status: "read" as const,
    };
  });
  if (!changed) return null;

  return {
    ...state.conversations,
    [senderId]: {
      ...conversation,
      messages,
    },
  };
}

/**
 * Owns inbound delivered/read conversation projection only: replacing/appending
 * received messages, unread/read transitions, persistence, and sender-label hydration.
 */
export function createMessagesInboundConversationRuntime(
  deps: MessagesInboundConversationRuntimeDeps
): MessagesInboundConversationRuntime {
  const { set, get, shared, trySendReadReceipt, queueReadReceipt } = deps;

  async function persistDeliveredIncomingMessage(
    message: IncomingServerMessagePayload,
    newMessage: Message,
    peerIdentityKeyFromHeader?: string
  ): Promise<void> {
    let deliveredConversations: Record<string, Conversation> | null = null;
    set((state) => {
      deliveredConversations = buildDeliveredConversations(
        state,
        message,
        newMessage,
        peerIdentityKeyFromHeader
      );
      return { conversations: deliveredConversations };
    });

    if (deliveredConversations) {
      await persistConversations(deliveredConversations);
    }
  }

  async function markIncomingMessageReadIfActive(
    senderId: string,
    messageId: string
  ): Promise<void> {
    if (get().activeConversationId !== senderId) {
      return;
    }

    if (!trySendReadReceipt(messageId)) {
      await queueReadReceipt(messageId);
    }

    let readConversations: Record<string, Conversation> | null = null;
    set((state) => {
      readConversations = buildReadConversations(state, senderId, messageId);
      return readConversations ? { conversations: readConversations } : {};
    });
    if (readConversations) {
      await persistConversations(readConversations);
    }
  }

  function hydrateOrPrimeIncomingSenderLabel(senderId: string): void {
    if (shouldHydrateUserLabel(get().conversations[senderId]?.username, senderId)) {
      void get().ensureConversationUsername(senderId);
      return;
    }
    primeUserLabelCache(senderId, get().conversations[senderId]?.username);
  }

  async function persistParsedIncomingMessage({
    message,
    parsedBody,
    commitTerminalAndFlushAck,
  }: PersistParsedIncomingMessageParams): Promise<void> {
    const senderId = message.senderUserId;
    const peerIdentityKeyFromHeader = message.x3dhHeader?.senderIdentityKey;
    if (peerIdentityKeyFromHeader) {
      shared.peerIdentityRuntime.cachePeerIdentity(
        message.senderDeviceId,
        peerIdentityKeyFromHeader
      );
    }

    const newMessage: Message = {
      id: message.id,
      senderId,
      senderDeviceId: message.senderDeviceId,
      content: parsedBody.content,
      type: parsedBody.messageType,
      attachment: parsedBody.attachment,
      replyTo: parsedBody.replyTo,
      timestamp: new Date(message.createdAt).getTime(),
      status: "delivered",
      isOwn: false,
    };

    await persistDeliveredIncomingMessage(
      message,
      newMessage,
      peerIdentityKeyFromHeader
    );
    hydrateOrPrimeIncomingSenderLabel(senderId);
    await commitTerminalAndFlushAck(message.id);
    await markIncomingMessageReadIfActive(senderId, message.id);
  }

  return {
    persistParsedIncomingMessage,
  };
}
