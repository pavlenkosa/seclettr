import {
  ratchetDecrypt,
  type EncryptedMessage,
  type RatchetState,
} from "@seclettr/crypto";
import type { WsServerMessage } from "@seclettr/protocol";
import { decodeDirectEnvelope } from "@/lib/direct-envelope";
import { logger } from "@/lib/logger.js";
import { buildDirectMessageADv1 } from "./messages-outbound-direct-helpers";
import type { InboundFailureDecision } from "./messages-inbound-failure-runtime";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";

type IncomingMessageNew = WsServerMessage & { type: "message.new" };
type IncomingServerMessagePayload = IncomingMessageNew["message"];
type DecodedDirectEnvelope = ReturnType<typeof decodeDirectEnvelope>;

type InboundFailureHandler = (
  decision: InboundFailureDecision,
  error: unknown
) => Promise<void>;

type SessionRuntime = MessagesRuntimeShared["messageSessionRuntime"];
type BootstrapResult = Awaited<
  ReturnType<SessionRuntime["bootstrapInboundSession"]>
>;

export interface MessagesInboundDecryptRuntimeDeps {
  shared: MessagesRuntimeShared;
}

export interface DecryptIncomingPlaintextParams {
  message: IncomingServerMessagePayload;
  myUserId: string;
  myDeviceId: string;
  handleInboundFailure: InboundFailureHandler;
}

export interface MessagesInboundDecryptRuntime {
  decryptIncomingPlaintext: (
    params: DecryptIncomingPlaintextParams
  ) => Promise<Uint8Array | null>;
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
  } catch (error) {
    if (error instanceof Error && error.name === "OperationError") {
      return await ratchetDecrypt(session, msg, adV0);
    }
    throw error;
  }
}

async function bootstrapX3dhInboundSession(
  runtime: SessionRuntime,
  params: Parameters<SessionRuntime["bootstrapInboundSession"]>[0],
  adFallback: Uint8Array
): Promise<BootstrapResult> {
  try {
    return await runtime.bootstrapInboundSession(params);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "OperationError") {
      throw error;
    }
    return runtime.bootstrapInboundSession({
      ...params,
      associatedData: adFallback,
    });
  }
}

/**
 * Owns encrypted inbound envelope decode, AD fallback, X3DH bootstrap fallback,
 * and post-success session commit/save timing.
 */
export function createMessagesInboundDecryptRuntime(
  deps: MessagesInboundDecryptRuntimeDeps
): MessagesInboundDecryptRuntime {
  const { shared } = deps;

  async function decryptIncomingPlaintext({
    message,
    myUserId,
    myDeviceId,
    handleInboundFailure,
  }: DecryptIncomingPlaintextParams): Promise<Uint8Array | null> {
    const decodedEnvelope = await decodeIncomingEnvelope(
      message,
      handleInboundFailure
    );
    if (!decodedEnvelope) return null;

    const { dh, pn, n } = decodedEnvelope.header;
    const ciphertext = decodedEnvelope.ciphertext;

    const adV1 = buildDirectMessageADv1({
      senderUserId: message.senderUserId,
      senderDeviceId: message.senderDeviceId,
      recipientUserId: myUserId,
      recipientDeviceId: myDeviceId,
      messageType: message.type as
        | "text"
        | "attachment"
        | "sender_key_distribution",
    });
    const adV0 = buildInboundAdV0(message.senderDeviceId, myDeviceId);
    const ratchetMessage = { header: { dh, pn, n }, ciphertext };

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
          ratchetMessage,
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
      const bootstrap = await bootstrapX3dhInboundSession(
        shared.messageSessionRuntime,
        {
          localDeviceId: myDeviceId,
          senderDeviceId: message.senderDeviceId,
          x3dhHeader: message.x3dhHeader,
          initialMessage: ratchetMessage,
          associatedData: adV1,
        },
        adV0
      );
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
      ratchetMessage,
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

  return {
    decryptIncomingPlaintext,
  };
}
