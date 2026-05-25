import { ApiError, api } from "@/lib/api";
import { encodeDirectEnvelope } from "@/lib/direct-envelope";
import { getCachedUserLabel, shouldHydrateUserLabel } from "@/lib/user-labels";
import { ratchetEncrypt, serializeRatchetState } from "@seclettr/crypto";
import { MESSAGE_PROTOCOL_VERSION } from "@seclettr/protocol";
import { persistConversations } from "./conversation-persistence";
import {
  buildDirectMessageADv1,
  parseDirectDeliveries,
} from "./messages-outbound-direct-helpers";
import type {
  Conversation,
  DirectMessageDeliveryMeta,
  GetMessagesState,
  Message,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import {
  toOutboundQueueSessionCommits,
  type DirectDeviceSessionCommit,
} from "./messages-outbound-session-queue-helpers";
import {
  persistOutboundQueueItem,
  type OutboundQueueDeviceEnvelope,
  type OutboundQueueItem,
} from "./outbound-queue";

/**
 * Text-send runtime for encrypted outbound direct messages.
 *
 * Owns only the visible encrypted text send path: optimistic bubble insert,
 * peer-identity hydration for recipient devices, queue-before-save ordering,
 * final `/messages` send, and error/success bubble settlement.
 * It does not own attachment send flow, sender-key distribution, retry/resume,
 * or generic session/queue helper semantics.
 */

export interface MessagesOutboundTextRuntimeDeps {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: MessagesRuntimeShared;
  withDeviceSessionLocks: <T>(
    deviceIds: string[],
    fn: () => Promise<T>
  ) => Promise<T>;
  saveGeneratedSessionCommits: (
    sessionCommits: DirectDeviceSessionCommit[]
  ) => Promise<void>;
  applyPendingSessionCommitsForRecipient: (
    recipientUserId: string
  ) => Promise<void>;
  settleAcceptedDirectQueueItem: (
    item: OutboundQueueItem,
    deliveries: DirectMessageDeliveryMeta[] | undefined
  ) => Promise<boolean>;
  markDirectQueuedMessageStatus: (
    recipientUserId: string,
    clientMessageId: string,
    status: Message["status"],
    directDeliveries?: DirectMessageDeliveryMeta[]
  ) => Promise<void>;
}

export interface MessagesOutboundTextRuntime {
  sendMessage: (
    recipientUserId: string,
    text: string,
    reply?: { id: string; snippet: string }
  ) => Promise<void>;
}

export function createMessagesOutboundTextRuntime(
  deps: MessagesOutboundTextRuntimeDeps
): MessagesOutboundTextRuntime {
  const {
    set,
    get,
    shared,
    withDeviceSessionLocks,
    saveGeneratedSessionCommits,
    applyPendingSessionCommitsForRecipient,
    settleAcceptedDirectQueueItem,
    markDirectQueuedMessageStatus,
  } = deps;

  async function sendMessage(
    recipientUserId: string,
    text: string,
    reply?: { id: string; snippet: string }
  ): Promise<void> {
    const myUserId = shared.getMyUserId();
    const myDeviceId = shared.getMyDeviceId();
    if (!myUserId || !myDeviceId) throw new Error("Not authenticated");

    await shared.recipientDeviceDirectory.ensureDirectRelationship(recipientUserId);
    const recipientDevices =
      await shared.recipientDeviceDirectory.getDeliverableRecipientDevices(
        recipientUserId,
        myDeviceId
      );
    if (recipientDevices.length === 0) {
      shared.recipientDeviceDirectory.invalidateRecipientDeviceCache(
        recipientUserId
      );
      throw new Error(
        "No recipient devices available (current device is excluded)"
      );
    }

    const clientMessageId = crypto.randomUUID();
    const messages: Array<{
      recipientDeviceId: string;
      ciphertext: string;
      type: "text";
      x3dhHeader?: object;
      oneTimePreKeyReservationToken?: string;
    }> = [];
    const sessionCommits: DirectDeviceSessionCommit[] = [];
    let queuedItem: OutboundQueueItem | null = null;

    const plaintext = new TextEncoder().encode(
      JSON.stringify({
        text,
        ...(reply ? { replyToId: reply.id, replySnippet: reply.snippet } : {}),
      })
    );

    const singleRecipientDevice =
      recipientDevices.length === 1 ? recipientDevices[0] : null;

    await applyPendingSessionCommitsForRecipient(recipientUserId);

    for (const device of recipientDevices) {
      await shared.assertPeerIdentityContinuity(set, get, {
        recipientUserId,
        deviceId: device.deviceId,
        observedIdentityKey: device.identityKeyPublic,
      });
    }

    await withDeviceSessionLocks(
      recipientDevices.map((device) => device.deviceId),
      async () => {
        for (const device of recipientDevices) {
          const {
            state,
            x3dhHeader,
            oneTimePreKeyReservationToken,
            peerIdentityKeyB64,
          } = await shared.messageSessionRuntime.getOrCreateOutboundSession(
            recipientUserId,
            device.deviceId
          );
          shared.peerIdentityRuntime.cachePeerIdentity(
            device.deviceId,
            peerIdentityKeyB64 ?? device.identityKeyPublic
          );
          const ad = buildDirectMessageADv1({
            senderUserId: myUserId,
            senderDeviceId: myDeviceId,
            recipientUserId,
            recipientDeviceId: device.deviceId,
            messageType: "text",
          });
          const encrypted = await ratchetEncrypt(state, plaintext, ad);
          sessionCommits.push({
            recipientDeviceId: device.deviceId,
            state,
            serializedState: serializeRatchetState(state),
          });

          messages.push({
            recipientDeviceId: device.deviceId,
            ciphertext: encodeDirectEnvelope(
              encrypted.header,
              encrypted.ciphertext
            ),
            type: "text",
            x3dhHeader,
            oneTimePreKeyReservationToken,
          });
        }

        const optimisticMsg: Message = {
          id: clientMessageId,
          senderId: myUserId,
          senderDeviceId: myDeviceId,
          content: text,
          type: "text",
          replyTo: reply ? { id: reply.id, content: reply.snippet } : undefined,
          timestamp: Date.now(),
          status: "sending",
          isOwn: true,
        };

        let optimisticConversations: Record<string, Conversation> | null = null;
        set((state) => {
          const existing = state.conversations[recipientUserId];
          const optimisticUsername =
            existing?.username &&
            !shouldHydrateUserLabel(existing.username, recipientUserId)
              ? existing.username
              : getCachedUserLabel(recipientUserId) ?? recipientUserId;
          const mergedPeerIdentityByDevice = {
            ...existing?.peerIdentityByDevice,
            ...Object.fromEntries(
              recipientDevices.map(
                (device) => [device.deviceId, device.identityKeyPublic] as const
              )
            ),
          };
          const nextConversations = {
            ...state.conversations,
            [recipientUserId]: {
              userId: recipientUserId,
              username: optimisticUsername,
              messages: [...(existing?.messages ?? []), optimisticMsg],
              lastMessageAt: Date.now(),
              unreadCount: 0,
              peerIdentityKey:
                existing?.peerIdentityKey ??
                singleRecipientDevice?.identityKeyPublic,
              peerIdentityDeviceId:
                existing?.peerIdentityDeviceId ?? singleRecipientDevice?.deviceId,
              peerIdentityByDevice:
                Object.keys(mergedPeerIdentityByDevice).length > 0
                  ? mergedPeerIdentityByDevice
                  : existing?.peerIdentityByDevice,
            },
          };
          optimisticConversations = nextConversations;
          return { conversations: nextConversations };
        });
        if (optimisticConversations) {
          await persistConversations(optimisticConversations);
        }

        // DM-01: durable queue - persist encrypted envelopes before saving the
        // advanced ratchet sessions or attempting HTTP delivery.
        queuedItem = {
          clientMessageId,
          recipientUserId,
          messageType: "text",
          envelopes: messages.map((message) => ({
            recipientDeviceId: message.recipientDeviceId,
            ciphertext: message.ciphertext,
            type: message.type,
            x3dhHeader:
              message.x3dhHeader as OutboundQueueDeviceEnvelope["x3dhHeader"],
            oneTimePreKeyReservationToken: message.oneTimePreKeyReservationToken,
          })),
          sessionCommits: toOutboundQueueSessionCommits(sessionCommits),
          createdAt: Date.now(),
          retryCount: 0,
        };
        await persistOutboundQueueItem(queuedItem);
        await saveGeneratedSessionCommits(sessionCommits);
      }
    );

    try {
      if (!queuedItem) throw new Error("Outbound queue item was not created");
      const response = await api.post<unknown>("/messages", {
        version: MESSAGE_PROTOCOL_VERSION,
        clientMessageId,
        recipientUserId,
        messages,
      });
      const directDeliveries = parseDirectDeliveries(response);
      const fullyAccepted = await settleAcceptedDirectQueueItem(
        queuedItem,
        directDeliveries
      );

      await markDirectQueuedMessageStatus(
        recipientUserId,
        clientMessageId,
        fullyAccepted ? "sent" : "error",
        directDeliveries
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        shared.recipientDeviceDirectory.invalidateRecipientDeviceCache(
          recipientUserId
        );
      }
      let errorConversations: Record<string, Conversation> | null = null;
      set((state) => {
        const nextConversations = {
          ...state.conversations,
          [recipientUserId]: {
            ...state.conversations[recipientUserId]!,
            messages: state.conversations[recipientUserId]!.messages.map(
              (message) =>
                message.id === clientMessageId
                  ? { ...message, status: "error" as const }
                  : message
            ),
          },
        };
        errorConversations = nextConversations;
        return { conversations: nextConversations };
      });
      if (errorConversations) {
        await persistConversations(errorConversations);
      }
      throw error;
    }
  }

  return {
    sendMessage,
  };
}
