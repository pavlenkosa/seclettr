import type { WsServerMessage } from "@seclettr/protocol";
import type {
  GetMessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import type { InboundFailureDecision } from "./messages-inbound-failure-runtime";

type IncomingMessageNew = WsServerMessage & { type: "message.new" };
type IncomingServerMessagePayload = IncomingMessageNew["message"];
type InboundFailureHandler = (
  decision: InboundFailureDecision,
  error: unknown
) => Promise<void>;

export interface MessagesInboundPeerIdentityRuntimeDeps {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: Pick<
    MessagesRuntimeShared,
    "peerIdentityRuntime" | "commitConversationIdentityUpdate"
  >;
}

export interface MessagesInboundPeerIdentityRuntime {
  shouldBlockForPeerIdentity: (
    message: IncomingServerMessagePayload,
    handleInboundFailure: InboundFailureHandler
  ) => Promise<boolean>;
}

/**
 * Owns inbound peer-identity continuity blocking only: pending alerts,
 * tracked identity mismatch detection, identity-update persistence, and
 * trust-failure routing into inbound failure policy.
 */
export function createMessagesInboundPeerIdentityRuntime(
  deps: MessagesInboundPeerIdentityRuntimeDeps
): MessagesInboundPeerIdentityRuntime {
  const { set, get, shared } = deps;

  async function blockForPeerIdentityChange(
    message: IncomingServerMessagePayload,
    handleInboundFailure: InboundFailureHandler,
    observedIdentityKey?: string
  ): Promise<void> {
    if (observedIdentityKey) {
      const result = shared.peerIdentityRuntime.checkPeerIdentityContinuity({
        conversations: get().conversations,
        recipientUserId: message.senderUserId,
        deviceId: message.senderDeviceId,
        observedIdentityKey,
      });
      await shared.commitConversationIdentityUpdate(set, result.nextConversations);
    }

    await handleInboundFailure(
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
    message: IncomingServerMessagePayload,
    handleInboundFailure: InboundFailureHandler
  ): Promise<boolean> {
    const currentConversation = get().conversations[message.senderUserId];
    const pendingIdentityAlert =
      shared.peerIdentityRuntime.getConversationIdentityAlert(
        currentConversation,
        message.senderDeviceId
      );
    if (pendingIdentityAlert) {
      await blockForPeerIdentityChange(
        message,
        handleInboundFailure,
        message.x3dhHeader?.senderIdentityKey
      );
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
    await shared.commitConversationIdentityUpdate(set, result.nextConversations);
    await blockForPeerIdentityChange(
      message,
      handleInboundFailure,
      headerIdentityKey
    );
    return true;
  }

  return {
    shouldBlockForPeerIdentity,
  };
}
