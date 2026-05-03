import {
  PlaintextAttachmentMessageSchema,
  PlaintextSenderKeyDistributionMessageSchema,
  type WsServerMessage,
} from "@seclettr/protocol";
import { ratchetDecrypt, type RatchetState, type EncryptedMessage } from "@seclettr/crypto";
import { buildDirectMessageADv1 } from "./createMessagesOutboundRuntime";
import { decodeDirectEnvelope } from "@/lib/direct-envelope";
import { importSenderKeyDistribution } from "@/lib/group-sender-key";
import { notifySenderKeyDistributionImported } from "@/lib/group-sender-key-events";
import {
  getCachedUserLabel,
  primeUserLabelCache,
  shouldHydrateUserLabel,
} from "@/lib/user-labels";
import { logger } from "@/lib/logger.js";
import { persistConversations } from "./conversation-persistence";
import type {
  AttachmentMessageMeta,
  Conversation,
  GetMessagesState,
  IncomingDecryptErrorKind,
  Message,
  MessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";

type InboundFailureClass =
  | "transient_local_crypto_state"
  | "transient_ordering_or_session_dependency"
  | "permanent_malformed_or_corrupt_payload"
  | "trust_or_policy_failure";

interface InboundFailureDecision {
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

interface CreateMessagesInboundRuntimeOptions {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: MessagesRuntimeShared;
  schedulePendingMessageSync: (reason: string) => void;
  trySendReadReceipt: (messageId: string) => boolean;
  queueReadReceipt: (messageId: string) => Promise<void>;
}

type IncomingMessageNew = WsServerMessage & { type: "message.new" };
type IncomingServerMessagePayload = IncomingMessageNew["message"];
type DecodedDirectEnvelope = ReturnType<typeof decodeDirectEnvelope>;
type InboundFailureHandler = (
  decision: InboundFailureDecision,
  error: unknown
) => Promise<void>;
type PeerIdentityBlockHandler = (
  observedIdentityKey?: string
) => Promise<void>;

interface ParsedInboundBody {
  messageType: Message["type"];
  content: string;
  attachment?: AttachmentMessageMeta;
  replyTo?: Message["replyTo"];
}

interface LockedIncomingMessageContext extends CreateMessagesInboundRuntimeOptions {
  message: IncomingServerMessagePayload;
  myUserId: string;
  myDeviceId: string;
  handleInboundFailure: InboundFailureHandler;
  blockForPeerIdentityChange: PeerIdentityBlockHandler;
  classifyUnexpectedInboundFailure: (
    error: unknown
  ) => InboundFailureDecision;
}

function getOrCreateConversation(
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

function replaceOrAppendMessage(
  messages: Message[],
  messageId: string,
  nextMessage: Message
): { messages: Message[]; existingMessageIndex: number } {
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

function upsertIncomingDecryptError(
  state: MessagesState,
  message: IncomingServerMessagePayload,
  kind: Exclude<IncomingDecryptErrorKind, undefined>,
  timestamp: number,
  content: string
): Record<string, Conversation> {
  const senderId = message.senderUserId;
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

  return {
    ...state.conversations,
    [senderId]: {
      ...existingConversation,
      messages,
      lastMessageAt: Math.max(existingConversation.lastMessageAt, timestamp),
      unreadCount,
    },
  };
}

async function persistIncomingDecryptError(
  { set, get }: Pick<CreateMessagesInboundRuntimeOptions, "set" | "get">,
  message: IncomingServerMessagePayload,
  kind: Exclude<IncomingDecryptErrorKind, undefined>
): Promise<void> {
  const senderId = message.senderUserId;
  const timestampMs = Date.parse(message.createdAt);
  const timestamp = Number.isNaN(timestampMs) ? Date.now() : timestampMs;
  const content = INCOMING_DECRYPT_ERROR_CONTENT[kind];

  let nextConversations: Record<string, Conversation> | null = null;
  set((state) => {
    nextConversations = upsertIncomingDecryptError(
      state,
      message,
      kind,
      timestamp,
      content
    );
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
    get().ensureConversationUsername(senderId);
  }
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

async function persistDeliveredIncomingMessage(
  { set }: Pick<CreateMessagesInboundRuntimeOptions, "set">,
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

async function markIncomingMessageReadIfActive({
  set,
  get,
  trySendReadReceipt,
  queueReadReceipt,
  senderId,
  messageId,
}: Pick<
  CreateMessagesInboundRuntimeOptions,
  "set" | "get" | "trySendReadReceipt" | "queueReadReceipt"
> & {
  senderId: string;
  messageId: string;
}): Promise<void> {
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

async function flushPendingAckForMessage(
  { set, get, shared }: Pick<CreateMessagesInboundRuntimeOptions, "set" | "get" | "shared">,
  messageId: string
): Promise<void> {
  await shared.inboundTrackingCoordinator.flushPendingAckForMessage(
    set,
    get,
    messageId
  );
}

async function commitTerminalAndFlushAck(
  { set, get, shared }: Pick<CreateMessagesInboundRuntimeOptions, "set" | "get" | "shared">,
  messageId: string
): Promise<void> {
  await shared.inboundTrackingCoordinator.commitTerminalMessageState(
    set,
    get,
    messageId
  );
  await flushPendingAckForMessage({ set, get, shared }, messageId);
}

function classifyUnexpectedInboundFailure(
  message: IncomingServerMessagePayload,
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

  return {
    disposition: "retry",
    failureClass: "transient_local_crypto_state",
    errorKind: "decrypt_failed",
    clearSession: Boolean(
      message.x3dhHeader &&
        error instanceof Error &&
        error.name === "OperationError"
    ),
  };
}

async function persistRetryableFailure(
  context: CreateMessagesInboundRuntimeOptions,
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
    await persistIncomingDecryptError(context, message, decision.errorKind);
  }
  if (decision.clearSession) {
    await context.shared.messageSessionRuntime
      .clearSession(message.senderDeviceId)
      .catch(() => null);
  }
}

async function persistQuarantinedFailure(
  context: CreateMessagesInboundRuntimeOptions,
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
    await persistIncomingDecryptError(context, message, decision.errorKind);
  }
  if (decision.clearSession) {
    await context.shared.messageSessionRuntime
      .clearSession(message.senderDeviceId)
      .catch(() => null);
  }
  await context.shared.inboundTrackingCoordinator.commitTerminalMessageState(
    context.set,
    context.get,
    message.id,
    { quarantined: true }
  );
  await flushPendingAckForMessage(context, message.id);
}

async function handleInboundFailure(
  context: CreateMessagesInboundRuntimeOptions,
  message: IncomingServerMessagePayload,
  decision: InboundFailureDecision,
  error: unknown
): Promise<void> {
  if (decision.disposition === "quarantine") {
    await persistQuarantinedFailure(context, message, decision, error);
    return;
  }
  await persistRetryableFailure(context, message, decision, error);
}

async function blockForPeerIdentityChange(
  context: CreateMessagesInboundRuntimeOptions,
  message: IncomingServerMessagePayload,
  observedIdentityKey?: string
): Promise<void> {
  if (observedIdentityKey) {
    const result = context.shared.peerIdentityRuntime.checkPeerIdentityContinuity({
      conversations: context.get().conversations,
      recipientUserId: message.senderUserId,
      deviceId: message.senderDeviceId,
      observedIdentityKey,
    });
    await context.shared.commitConversationIdentityUpdate(
      context.set,
      result.nextConversations
    );
  }

  await handleInboundFailure(
    context,
    message,
    {
      disposition: "retry",
      failureClass: "trust_or_policy_failure",
      errorKind: "trust_failure",
    },
    new Error(
      `Peer identity changed for ${message.senderDeviceId}. Explicit re-verification is required.`
    )
  );
}

async function shouldBlockForPeerIdentity(
  context: LockedIncomingMessageContext
): Promise<boolean> {
  const { get, shared, message, blockForPeerIdentityChange } = context;
  const currentConversation = get().conversations[message.senderUserId];
  const pendingIdentityAlert =
    shared.peerIdentityRuntime.getConversationIdentityAlert(
      currentConversation,
      message.senderDeviceId
    );
  if (pendingIdentityAlert) {
    await blockForPeerIdentityChange(message.x3dhHeader?.senderIdentityKey);
    return true;
  }

  const headerIdentityKey = message.x3dhHeader?.senderIdentityKey;
  const trackedPeerIdentity = headerIdentityKey
    ? shared.peerIdentityRuntime.getTrackedPeerIdentityKey(
        currentConversation,
        message.senderDeviceId
      )
    : null;
  if (!headerIdentityKey || !trackedPeerIdentity) {
    return false;
  }
  if (trackedPeerIdentity === headerIdentityKey) {
    return false;
  }

  const result = shared.peerIdentityRuntime.checkPeerIdentityContinuity({
    conversations: get().conversations,
    recipientUserId: message.senderUserId,
    deviceId: message.senderDeviceId,
    observedIdentityKey: headerIdentityKey,
  });
  await shared.commitConversationIdentityUpdate(context.set, result.nextConversations);
  await blockForPeerIdentityChange(headerIdentityKey);
  return true;
}

async function decodeIncomingEnvelope(
  message: IncomingServerMessagePayload,
  handleInboundFailure: InboundFailureHandler
): Promise<DecodedDirectEnvelope | null> {
  try {
    return decodeDirectEnvelope(message.ciphertext);
  } catch (decodeError) {
    await handleInboundFailure(
      {
        disposition: "quarantine",
        failureClass: "permanent_malformed_or_corrupt_payload",
        errorKind: "corrupted_payload",
      },
      decodeError
    );
    return null;
  }
}

function buildInboundAdV0(
  senderDeviceId: string,
  myDeviceId: string
): Uint8Array {
  return new TextEncoder().encode(`${senderDeviceId}:${myDeviceId}`);
}

async function ratchetDecryptWithAdFallback(
  session: RatchetState,
  msg: EncryptedMessage,
  adV1: Uint8Array,
  adV0: Uint8Array
): Promise<Uint8Array> {
  try {
    return await ratchetDecrypt(session, msg, adV1);
  } catch (err) {
    if (err instanceof Error && err.name === "OperationError") {
      return await ratchetDecrypt(session, msg, adV0);
    }
    throw err;
  }
}

async function decryptIncomingPlaintext(
  context: LockedIncomingMessageContext
): Promise<Uint8Array | null> {
  const { message, myUserId, myDeviceId, shared, handleInboundFailure } = context;
  const decodedEnvelope = await decodeIncomingEnvelope(message, handleInboundFailure);
  if (!decodedEnvelope) {
    return null;
  }

  const { dh, pn, n } = decodedEnvelope.header;
  const ciphertext = decodedEnvelope.ciphertext;

  // DM-04: try v1 AD first; fall back to v0 for messages encrypted by older clients.
  const adV1 = buildDirectMessageADv1({
    senderUserId: message.senderUserId,
    senderDeviceId: message.senderDeviceId,
    recipientUserId: myUserId,
    recipientDeviceId: myDeviceId,
    messageType: message.type as "text" | "attachment" | "sender_key_distribution",
  });
  const adV0 = buildInboundAdV0(message.senderDeviceId, myDeviceId);

  let session = await shared.messageSessionRuntime.loadSession(
    message.senderDeviceId
  );
  logger.debug(
    "[MSG] existing session:",
    !!session,
    "for sender",
    message.senderDeviceId
  );

  let plaintext: Uint8Array | null = null;
  let bootstrapCommit: (() => Promise<void>) | null = null;
  if (session) {
    try {
      plaintext = await ratchetDecryptWithAdFallback(
        session,
        { header: { dh, pn, n }, ciphertext },
        adV1,
        adV0
      );
    } catch (error) {
      if (!message.x3dhHeader) {
        throw error;
      }
      logger.debug(
        "[MSG] existing session decrypt failed, re-init X3DH for",
        message.id
      );
      session = null;
    }
  }

  if (message.x3dhHeader && !session) {
    logger.debug(
      "[MSG] X3DH receive for",
      message.id,
      "otkId:",
      message.x3dhHeader.oneTimePreKeyId
    );
    // Try v1 AD first for X3DH bootstrap, fall back to v0.
    let bootstrap: Awaited<ReturnType<typeof shared.messageSessionRuntime.bootstrapInboundSession>> | null = null;
    try {
      bootstrap = await shared.messageSessionRuntime.bootstrapInboundSession({
        localDeviceId: myDeviceId,
        senderDeviceId: message.senderDeviceId,
        x3dhHeader: message.x3dhHeader,
        initialMessage: { header: { dh, pn, n }, ciphertext },
        associatedData: adV1,
      });
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "OperationError") throw err;
      bootstrap = await shared.messageSessionRuntime.bootstrapInboundSession({
        localDeviceId: myDeviceId,
        senderDeviceId: message.senderDeviceId,
        x3dhHeader: message.x3dhHeader,
        initialMessage: { header: { dh, pn, n }, ciphertext },
        associatedData: adV0,
      });
    }
    session = bootstrap.session;
    plaintext = bootstrap.plaintext;
    bootstrapCommit = bootstrap.commit;
  }

  if (!session) {
    await handleInboundFailure(
      {
        disposition: "retry",
        failureClass: "transient_ordering_or_session_dependency",
        errorKind: "session_missing",
      },
      new Error(`No session available for message ${message.id}`)
    );
    return null;
  }

  plaintext ??= await ratchetDecryptWithAdFallback(
    session,
    { header: { dh, pn, n }, ciphertext },
    adV1,
    adV0
  );
  if (bootstrapCommit) {
    await bootstrapCommit();
  } else {
    await shared.messageSessionRuntime.saveSession(
      message.senderDeviceId,
      session
    );
  }
  return plaintext;
}

async function parsePlaintextBody(
  message: IncomingServerMessagePayload,
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

async function handleSenderKeyDistributionMessage(
  context: LockedIncomingMessageContext,
  rawBody: unknown
): Promise<boolean> {
  const { message, shared, schedulePendingMessageSync, handleInboundFailure } =
    context;
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

  await commitTerminalAndFlushAck(context, message.id);
  schedulePendingMessageSync("sender_key_distribution");
  return true;
}

async function parseIncomingMessageBody(
  message: IncomingServerMessagePayload,
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
  if (attachment.kind === "voice_note" || attachment.mimeType.startsWith("audio/")) {
    return { messageType: "attachment", content: "[voice note]", attachment, replyTo };
  }
  if (attachment.kind === "video_note" || attachment.mimeType.startsWith("video/")) {
    return { messageType: "attachment", content: "[video note]", attachment, replyTo };
  }
  return {
    messageType: "attachment",
    content: attachment.caption?.trim() ? attachment.caption : "[attachment]",
    attachment,
    replyTo,
  };
}

function hydrateOrPrimeIncomingSenderLabel(
  get: GetMessagesState,
  senderId: string
): void {
  if (shouldHydrateUserLabel(get().conversations[senderId]?.username, senderId)) {
    get().ensureConversationUsername(senderId);
    return;
  }
  primeUserLabelCache(senderId, get().conversations[senderId]?.username);
}

async function persistParsedIncomingMessage(
  context: LockedIncomingMessageContext,
  parsedBody: ParsedInboundBody
): Promise<void> {
  const { message, shared, get } = context;
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
    context,
    message,
    newMessage,
    peerIdentityKeyFromHeader
  );
  hydrateOrPrimeIncomingSenderLabel(get, senderId);
  await commitTerminalAndFlushAck(context, message.id);
  await markIncomingMessageReadIfActive({
    ...context,
    senderId,
    messageId: message.id,
  });
}

async function processLockedIncomingMessage(
  context: LockedIncomingMessageContext
): Promise<void> {
  const { get, shared, message, handleInboundFailure } = context;
  await shared.warmPeerTrustStore();
  if (get().processedMessageIds.has(message.id)) {
    await flushPendingAckForMessage(context, message.id);
    return;
  }

  try {
    if (await shouldBlockForPeerIdentity(context)) {
      return;
    }

    const plaintext = await decryptIncomingPlaintext(context);
    if (!plaintext) {
      return;
    }
    logger.debug("[MSG] decrypted ok:", message.id, "from", message.senderUserId);

    const rawBody = await parsePlaintextBody(
      message,
      plaintext,
      handleInboundFailure
    );
    if (rawBody === null) {
      return;
    }

    if (await handleSenderKeyDistributionMessage(context, rawBody)) {
      return;
    }

    const parsedBody = await parseIncomingMessageBody(
      message,
      rawBody,
      handleInboundFailure
    );
    if (!parsedBody) {
      return;
    }
    await persistParsedIncomingMessage(context, parsedBody);
  } catch (error) {
    logger.error(
      "[MSG] DECRYPTION FAILED for",
      message.id,
      "senderDevice=",
      message.senderDeviceId,
      "recipientDevice=",
      message.recipientDeviceId,
      "myDevice=",
      context.myDeviceId,
      "x3dh=",
      !!message.x3dhHeader,
      "—",
      error
    );

    await handleInboundFailure(
      context.classifyUnexpectedInboundFailure(error),
      error
    );
  }
}

export function createMessagesInboundRuntime({
  set,
  get,
  shared,
  schedulePendingMessageSync,
  trySendReadReceipt,
  queueReadReceipt,
}: CreateMessagesInboundRuntimeOptions) {
  return {
    handleIncomingMessage: async (
      incoming: WsServerMessage & { type: "message.new" }
    ) => {
      const { message } = incoming;
      const myUserId = shared.getMyUserId();
      const myDeviceId = shared.getMyDeviceId();
      const myKeyPair = shared.getMyKeyPair();
      if (!myUserId || !myDeviceId || !myKeyPair) {
        logger.warn("[MSG] drop: not authenticated (no userId, deviceId or keyPair)");
        return;
      }
      if (message.recipientDeviceId !== myDeviceId) {
        logger.warn(
          "[MSG] drop: recipient device mismatch",
          "msg.recipientDeviceId=",
          message.recipientDeviceId,
          "myDeviceId=",
          myDeviceId
        );
        return;
      }

      const runtimeContext: CreateMessagesInboundRuntimeOptions = {
        set,
        get,
        shared,
        schedulePendingMessageSync,
        trySendReadReceipt,
        queueReadReceipt,
      };
      const handleFailureForMessage: InboundFailureHandler = (decision, error) =>
        handleInboundFailure(runtimeContext, message, decision, error);
      const blockPeerIdentityChangeForMessage: PeerIdentityBlockHandler = (
        observedIdentityKey
      ) => blockForPeerIdentityChange(runtimeContext, message, observedIdentityKey);

      if (message.senderDeviceId === myDeviceId) {
        await commitTerminalAndFlushAck(runtimeContext, message.id);
        return;
      }

      if (get().processedMessageIds.has(message.id)) {
        await flushPendingAckForMessage(runtimeContext, message.id);
        return;
      }

      if (message.type === "sender_key_distribution" && !shared.getStorageKey()) {
        logger.warn("[MSG] sender-key distribution postponed: storage key unavailable");
        return;
      }

      logger.debug(
        "[MSG] incoming",
        message.id,
        "from",
        message.senderDeviceId,
        "x3dh:",
        !!message.x3dhHeader
      );

      await shared.withSessionLock(message.senderDeviceId, () =>
        processLockedIncomingMessage({
          ...runtimeContext,
          message,
          myUserId,
          myDeviceId,
          handleInboundFailure: handleFailureForMessage,
          blockForPeerIdentityChange: blockPeerIdentityChangeForMessage,
          classifyUnexpectedInboundFailure: (error) =>
            classifyUnexpectedInboundFailure(message, error),
        })
      );
    },
  };
}
