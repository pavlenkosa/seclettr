import { ApiError, api } from "@/lib/api";
import { encodeDirectEnvelope } from "@/lib/direct-envelope";
import { ratchetEncrypt, serializeRatchetState } from "@seclettr/crypto";
import {
  MESSAGE_PROTOCOL_VERSION,
  PlaintextSenderKeyDistributionMessageSchema,
  type PlaintextSenderKeyDistributionMessage,
} from "@seclettr/protocol";
import {
  buildDirectMessageADv1,
  parseDirectDeliveries,
} from "./messages-outbound-direct-helpers";
import type {
  DirectMessageDeliveryMeta,
  GetMessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import type { RecipientDeviceInfo } from "./recipient-directory";
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
 * Sender-key distribution runtime for encrypted outbound direct messages.
 *
 * Owns only the non-visible sender-key distribution branch: prefetched-device
 * normalization, queue-before-save ordering, final `/messages` send, and
 * accepted-delivery queue settlement. It does not own optimistic text or
 * attachment UI flows, retry/resume logic, or peer-identity acceptance flow.
 */

export interface MessagesOutboundSenderKeyRuntimeDeps {
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
}

export interface MessagesOutboundSenderKeyRuntime {
  sendSenderKeyDistribution: (
    recipientUserId: string,
    rawPayload: PlaintextSenderKeyDistributionMessage,
    options?: {
      prefetchedDevices?: Array<{
        deviceId: string;
        identityKeyPublic: string;
      }>;
    }
  ) => Promise<string[]>;
}

export function createMessagesOutboundSenderKeyRuntime(
  deps: MessagesOutboundSenderKeyRuntimeDeps
): MessagesOutboundSenderKeyRuntime {
  const {
    set,
    get,
    shared,
    withDeviceSessionLocks,
    saveGeneratedSessionCommits,
    applyPendingSessionCommitsForRecipient,
    settleAcceptedDirectQueueItem,
  } = deps;

  const normalizePrefetchedRecipientDevices = (
    devices: Array<{ deviceId: string; identityKeyPublic: string }>
  ): RecipientDeviceInfo[] => {
    const dedupedDevices = new Map<string, RecipientDeviceInfo>();
    for (const device of devices) {
      if (!device.deviceId || !device.identityKeyPublic) continue;
      dedupedDevices.set(device.deviceId, {
        deviceId: device.deviceId,
        identityKeyPublic: device.identityKeyPublic,
      });
    }
    return [...dedupedDevices.values()].sort((left, right) =>
      left.deviceId.localeCompare(right.deviceId)
    );
  };

  async function sendSenderKeyDistribution(
    recipientUserId: string,
    rawPayload: PlaintextSenderKeyDistributionMessage,
    options?: {
      prefetchedDevices?: Array<{
        deviceId: string;
        identityKeyPublic: string;
      }>;
    }
  ): Promise<string[]> {
    const myUserId = shared.getMyUserId();
    const myDeviceId = shared.getMyDeviceId();
    if (!myUserId || !myDeviceId) throw new Error("Not authenticated");

    const payload = PlaintextSenderKeyDistributionMessageSchema.parse(rawPayload);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));

    await shared.recipientDeviceDirectory.ensureDirectRelationship(recipientUserId);
    const prefetchedDevices = options?.prefetchedDevices
      ? normalizePrefetchedRecipientDevices(options.prefetchedDevices)
      : null;
    const recipientDevices = prefetchedDevices
      ? prefetchedDevices.filter((device) => device.deviceId !== myDeviceId)
      : await shared.recipientDeviceDirectory.getDeliverableRecipientDevices(
          recipientUserId,
          myDeviceId
        );
    if (recipientDevices.length === 0) return [];

    const messages: Array<{
      recipientDeviceId: string;
      ciphertext: string;
      type: "sender_key_distribution";
      x3dhHeader?: object;
      oneTimePreKeyReservationToken?: string;
    }> = [];
    const sessionCommits: DirectDeviceSessionCommit[] = [];
    let queuedItem: OutboundQueueItem | null = null;

    await applyPendingSessionCommitsForRecipient(recipientUserId);

    for (const device of recipientDevices) {
      await shared.assertPeerIdentityContinuity(set, get, {
        recipientUserId,
        deviceId: device.deviceId,
        observedIdentityKey: device.identityKeyPublic,
      });
    }

    const clientMessageId = crypto.randomUUID();
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
            messageType: "sender_key_distribution",
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
            type: "sender_key_distribution",
            x3dhHeader,
            oneTimePreKeyReservationToken,
          });
        }

        queuedItem = {
          clientMessageId,
          recipientUserId,
          messageType: "sender_key_distribution",
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
      await settleAcceptedDirectQueueItem(
        queuedItem,
        parseDirectDeliveries(response)
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        shared.recipientDeviceDirectory.invalidateRecipientDeviceCache(
          recipientUserId
        );
      }
      throw error;
    }

    return recipientDevices.map((device) => device.deviceId);
  }

  return {
    sendSenderKeyDistribution,
  };
}
