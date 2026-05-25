import { loadAllPendingOutboundItems } from "./outbound-queue";
import type {
  GetMessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import {
  createMessagesOutboundSessionQueueHelpers,
} from "./messages-outbound-session-queue-helpers";
import { createMessagesOutboundAttachmentRuntime } from "./messages-outbound-attachment-runtime";
import { createMessagesOutboundRetryStatusRuntime } from "./messages-outbound-retry-status-runtime";
import { createMessagesOutboundSenderKeyRuntime } from "./messages-outbound-sender-key-runtime";
import { createMessagesOutboundTextRuntime } from "./messages-outbound-text-runtime";

interface CreateMessagesOutboundRuntimeOptions {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: MessagesRuntimeShared;
  schedulePendingMessageSync: (reason: string) => void;
}

export function createMessagesOutboundRuntime({
  set,
  get,
  shared,
  schedulePendingMessageSync,
}: CreateMessagesOutboundRuntimeOptions) {
  const {
    withDeviceSessionLocks,
    saveGeneratedSessionCommits,
    applyQueuedSessionCommits,
    applyPendingSessionCommitsForRecipient,
    settleAcceptedDirectQueueItem,
  } = createMessagesOutboundSessionQueueHelpers(
    shared,
    loadAllPendingOutboundItems
  );
  const {
    markDirectQueuedMessageStatus,
    retryDirectMessage,
    resumePendingOutboundMessages,
  } = createMessagesOutboundRetryStatusRuntime({
    set,
    get,
    applyQueuedSessionCommits,
      settleAcceptedDirectQueueItem,
  });
  const { sendAttachment, sendVoiceNote, sendVideoNote } =
    createMessagesOutboundAttachmentRuntime({
      set,
      get,
      shared,
      withDeviceSessionLocks,
      saveGeneratedSessionCommits,
      applyPendingSessionCommitsForRecipient,
      settleAcceptedDirectQueueItem,
      markDirectQueuedMessageStatus,
    });
  const { sendMessage } = createMessagesOutboundTextRuntime({
    set,
    get,
    shared,
    withDeviceSessionLocks,
    saveGeneratedSessionCommits,
    applyPendingSessionCommitsForRecipient,
    settleAcceptedDirectQueueItem,
    markDirectQueuedMessageStatus,
  });
  const { sendSenderKeyDistribution } = createMessagesOutboundSenderKeyRuntime({
    set,
    get,
    shared,
    withDeviceSessionLocks,
    saveGeneratedSessionCommits,
    applyPendingSessionCommitsForRecipient,
    settleAcceptedDirectQueueItem,
  });
  return {
    sendAttachment,
    sendVoiceNote,
    sendVideoNote,
    acceptPeerIdentityChange: async (recipientUserId: string, deviceId: string) => {
      await shared.warmPeerTrustStore();
      const conversation = get().conversations[recipientUserId];
      const alert = shared.peerIdentityRuntime.getConversationIdentityAlert(
        conversation,
        deviceId
      );
      if (!conversation || !alert) return;

      await shared.messageSessionRuntime.clearSession(deviceId);
      shared.peerIdentityRuntime.cachePeerIdentity(
        deviceId,
        alert.currentIdentityKey
      );
      shared.recipientDeviceDirectory.invalidateRecipientDeviceCache(
        recipientUserId
      );
      const nextConversations = shared.peerIdentityRuntime.acceptPeerIdentityChange({
        conversations: get().conversations,
        recipientUserId,
        deviceId,
      });
      await shared.commitConversationIdentityUpdate(set, nextConversations);

      schedulePendingMessageSync("peer_identity_accepted");
    },

    sendSenderKeyDistribution,
    sendMessage,
    retryDirectMessage,
    resumePendingOutboundMessages,
  };
}
