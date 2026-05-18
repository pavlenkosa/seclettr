import { type WsServerMessage } from "@seclettr/protocol";
import { logger } from "@/lib/logger.js";
import { createMessagesInboundDecryptRuntime } from "./messages-inbound-decrypt-runtime";
import {
  createMessagesInboundFailureRuntime,
  type InboundFailureDecision,
} from "./messages-inbound-failure-runtime";
import {
  createMessagesInboundConversationRuntime,
  getOrCreateConversation,
  replaceOrAppendMessage,
} from "./messages-inbound-conversation-runtime";
import { createMessagesInboundPeerIdentityRuntime } from "./messages-inbound-peer-identity-runtime";
import { createMessagesInboundProcessingRuntime } from "./messages-inbound-processing-runtime";
import {
  createMessagesInboundPlaintextRuntime,
} from "./messages-inbound-plaintext-runtime";
import type {
  GetMessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";

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
type InboundFailureHandler = (
  decision: InboundFailureDecision,
  error: unknown
) => Promise<void>;

interface LockedIncomingMessageContext extends CreateMessagesInboundRuntimeOptions {
  message: IncomingServerMessagePayload;
  myUserId: string;
  myDeviceId: string;
  inboundDecryptRuntime: ReturnType<typeof createMessagesInboundDecryptRuntime>;
  inboundConversationRuntime: ReturnType<
    typeof createMessagesInboundConversationRuntime
  >;
  inboundPeerIdentityRuntime: ReturnType<
    typeof createMessagesInboundPeerIdentityRuntime
  >;
  inboundPlaintextRuntime: ReturnType<typeof createMessagesInboundPlaintextRuntime>;
  handleInboundFailure: InboundFailureHandler;
  classifyUnexpectedInboundFailure: (
    error: unknown
  ) => InboundFailureDecision;
  flushPendingAckForMessage: (messageId: string) => Promise<void>;
  commitTerminalAndFlushAck: (messageId: string) => Promise<void>;
}

export function createMessagesInboundRuntime({
  set,
  get,
  shared,
  schedulePendingMessageSync,
  trySendReadReceipt,
  queueReadReceipt,
}: CreateMessagesInboundRuntimeOptions) {
  const inboundFailureRuntime = createMessagesInboundFailureRuntime({
    set,
    get,
    shared,
    getOrCreateConversation,
    replaceOrAppendMessage,
  });
  const inboundDecryptRuntime = createMessagesInboundDecryptRuntime({
    shared,
  });
  const inboundConversationRuntime = createMessagesInboundConversationRuntime({
    set,
    get,
    shared,
    trySendReadReceipt,
    queueReadReceipt,
  });
  const inboundPeerIdentityRuntime = createMessagesInboundPeerIdentityRuntime({
    set,
    get,
    shared,
  });
  const inboundProcessingRuntime = createMessagesInboundProcessingRuntime({
    get,
    shared,
  });
  const inboundPlaintextRuntime = createMessagesInboundPlaintextRuntime();

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
        inboundFailureRuntime.handleInboundFailure(message, decision, error);

      if (message.senderDeviceId === myDeviceId) {
        await inboundFailureRuntime.commitTerminalAndFlushAck(message.id);
        return;
      }

      if (get().processedMessageIds.has(message.id)) {
        await inboundFailureRuntime.flushPendingAckForMessage(message.id);
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
        inboundProcessingRuntime.processLockedIncomingMessage({
          ...runtimeContext,
          message,
          myUserId,
          myDeviceId,
          inboundDecryptRuntime,
          inboundConversationRuntime,
          inboundPeerIdentityRuntime,
          inboundPlaintextRuntime,
          handleInboundFailure: handleFailureForMessage,
          classifyUnexpectedInboundFailure: (error) =>
            inboundFailureRuntime.classifyUnexpectedInboundFailure(message, error),
          flushPendingAckForMessage:
            inboundFailureRuntime.flushPendingAckForMessage,
          commitTerminalAndFlushAck:
            inboundFailureRuntime.commitTerminalAndFlushAck,
        })
      );
    },
  };
}
