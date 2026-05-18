import { logger } from "@/lib/logger.js";
import type { InboundFailureDecision } from "./messages-inbound-failure-runtime";
import type { GetMessagesState } from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import type { WsServerMessage } from "@seclettr/protocol";
import type { createMessagesInboundDecryptRuntime } from "./messages-inbound-decrypt-runtime";
import type { createMessagesInboundConversationRuntime } from "./messages-inbound-conversation-runtime";
import type { createMessagesInboundPeerIdentityRuntime } from "./messages-inbound-peer-identity-runtime";
import type { createMessagesInboundPlaintextRuntime } from "./messages-inbound-plaintext-runtime";

type IncomingMessageNew = WsServerMessage & { type: "message.new" };
type IncomingServerMessagePayload = IncomingMessageNew["message"];
type InboundFailureHandler = (
  decision: InboundFailureDecision,
  error: unknown
) => Promise<void>;

export interface ProcessLockedIncomingMessageParams {
  message: IncomingServerMessagePayload;
  myUserId: string;
  myDeviceId: string;
  schedulePendingMessageSync: (reason: string) => void;
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

export interface MessagesInboundProcessingRuntimeDeps {
  get: GetMessagesState;
  shared: Pick<MessagesRuntimeShared, "warmPeerTrustStore">;
}

export interface MessagesInboundProcessingRuntime {
  processLockedIncomingMessage: (
    params: ProcessLockedIncomingMessageParams
  ) => Promise<void>;
}

/**
 * Owns the locked inbound receive pipeline only: trust-store warmup,
 * duplicate processed-message guard, peer-identity block, decrypt, plaintext
 * branch, and final conversation persistence handoff.
 */
export function createMessagesInboundProcessingRuntime(
  deps: MessagesInboundProcessingRuntimeDeps
): MessagesInboundProcessingRuntime {
  const { get, shared } = deps;

  async function processLockedIncomingMessage({
    message,
    myUserId,
    myDeviceId,
    schedulePendingMessageSync,
    inboundDecryptRuntime,
    inboundConversationRuntime,
    inboundPeerIdentityRuntime,
    inboundPlaintextRuntime,
    handleInboundFailure,
    classifyUnexpectedInboundFailure,
    flushPendingAckForMessage,
    commitTerminalAndFlushAck,
  }: ProcessLockedIncomingMessageParams): Promise<void> {
    await shared.warmPeerTrustStore();
    if (get().processedMessageIds.has(message.id)) {
      await flushPendingAckForMessage(message.id);
      return;
    }

    try {
      if (
        await inboundPeerIdentityRuntime.shouldBlockForPeerIdentity(
          message,
          handleInboundFailure
        )
      ) {
        return;
      }

      const plaintext = await inboundDecryptRuntime.decryptIncomingPlaintext({
        message,
        myUserId,
        myDeviceId,
        handleInboundFailure,
      });
      if (!plaintext) {
        return;
      }
      logger.debug("[MSG] decrypted ok:", message.id, "from", message.senderUserId);

      const rawBody = await inboundPlaintextRuntime.parsePlaintextBody(
        message,
        plaintext,
        handleInboundFailure
      );
      if (rawBody === null) {
        return;
      }

      if (
        await inboundPlaintextRuntime.handleSenderKeyDistributionMessage({
          message,
          rawBody,
          shared: deps.shared as never,
          schedulePendingMessageSync,
          handleInboundFailure,
          commitTerminalAndFlushAck,
        })
      ) {
        return;
      }

      const parsedBody = await inboundPlaintextRuntime.parseIncomingMessageBody(
        message,
        rawBody,
        handleInboundFailure
      );
      if (!parsedBody) {
        return;
      }
      await inboundConversationRuntime.persistParsedIncomingMessage({
        message,
        parsedBody,
        commitTerminalAndFlushAck,
      });
    } catch (error) {
      logger.error(
        "[MSG] DECRYPTION FAILED for",
        message.id,
        "senderDevice=",
        message.senderDeviceId,
        "recipientDevice=",
        message.recipientDeviceId,
        "myDevice=",
        myDeviceId,
        "x3dh=",
        !!message.x3dhHeader,
        "—",
        error
      );

      await handleInboundFailure(classifyUnexpectedInboundFailure(error), error);
    }
  }

  return {
    processLockedIncomingMessage,
  };
}
