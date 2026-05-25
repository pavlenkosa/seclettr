import { ApiError, api } from "@/lib/api";
import {
  registerUpload,
  setUploadLocalSource,
  unregisterUpload,
} from "@/lib/upload-progress";
import { encodeDirectEnvelope } from "@/lib/direct-envelope";
import { getCachedUserLabel, shouldHydrateUserLabel } from "@/lib/user-labels";
import { persistConversations } from "./conversation-persistence";
import type {
  Conversation,
  GetMessagesState,
  Message,
  MessagesSendEncryptedAttachmentParams,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import {
  buildDirectMessageADv1,
  parseDirectDeliveries,
} from "./messages-outbound-direct-helpers";
import {
  clampDurationMs,
  completeAttachmentUpload,
  markOptimisticAttachmentError,
  toSafeBlobChunk,
  type AttachmentUploadInitResponse,
  uploadEncryptedAttachmentCiphertext,
} from "./messages-outbound-attachment-upload-helpers";
import {
  toOutboundQueueSessionCommits,
  type DirectDeviceSessionCommit,
} from "./messages-outbound-session-queue-helpers";
import {
  persistOutboundQueueItem,
  type OutboundQueueDeviceEnvelope,
  type OutboundQueueItem,
} from "./outbound-queue";
import {
  encryptAttachment,
  ratchetEncrypt,
  serializeRatchetState,
  toBase64Url,
} from "@seclettr/crypto";
import {
  MESSAGE_PROTOCOL_VERSION,
  PlaintextAttachmentMessageSchema,
} from "@seclettr/protocol";
import type { DirectMessageDeliveryMeta } from "./messages-store-runtime-types";

/**
 * Attachment-send runtime for encrypted outbound direct messages.
 *
 * Owns optimistic attachment bubble insert, encrypted upload orchestration,
 * recipient-device peer-identity hydration, queue-before-save ordering, and
 * final delivery/error settlement. It does not own retry/resume, text sends,
 * sender-key distribution, or peer-identity acceptance.
 */

export interface MessagesOutboundAttachmentRuntimeDeps {
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

export interface MessagesOutboundAttachmentRuntime {
  sendAttachment: (
    recipientUserId: string,
    file: File,
    caption?: string,
    mediaGroupId?: string
  ) => Promise<void>;
  sendVoiceNote: (
    recipientUserId: string,
    blob: Blob,
    durationMs: number
  ) => Promise<void>;
  sendVideoNote: (
    recipientUserId: string,
    blob: Blob,
    durationMs: number
  ) => Promise<void>;
}

export function createMessagesOutboundAttachmentRuntime(
  deps: MessagesOutboundAttachmentRuntimeDeps
): MessagesOutboundAttachmentRuntime {
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

  async function sendEncryptedAttachmentMessage(
    params: MessagesSendEncryptedAttachmentParams
  ): Promise<void> {
    const myUserId = shared.getMyUserId();
    const myDeviceId = shared.getMyDeviceId();
    if (!myUserId || !myDeviceId) throw new Error("Not authenticated");
    if (params.blob.size <= 0) throw new Error("Attachment blob is empty");

    const encryptedAttachment = await encryptAttachment(
      new Uint8Array(await params.blob.arrayBuffer()),
      params.mimeType
    );

    const uploadInit = await api.post<AttachmentUploadInitResponse>(
      "/attachments/init-upload",
      {
        encryptedSize: encryptedAttachment.data.length,
        encryptedDigest: toBase64Url(encryptedAttachment.digest),
        contentType: params.mimeType,
      }
    );

    const attachmentPayload = PlaintextAttachmentMessageSchema.parse({
      key: toBase64Url(encryptedAttachment.key),
      digest: toBase64Url(encryptedAttachment.digest),
      attachmentId: uploadInit.attachmentId,
      mimeType: params.mimeType,
      fileName: params.fileName,
      size: params.blob.size,
      kind: params.kind,
      caption: params.caption?.trim() || undefined,
      durationMs: clampDurationMs(params.durationMs),
      mediaGroupId: params.mediaGroupId,
    });
    const plaintext = new TextEncoder().encode(JSON.stringify(attachmentPayload));

    const clientMessageId = crypto.randomUUID();
    const optimisticMsg: Message = {
      id: clientMessageId,
      senderId: myUserId,
      senderDeviceId: myDeviceId,
      content: params.optimisticContent,
      type: "attachment",
      attachment: attachmentPayload,
      timestamp: Date.now(),
      status: "sending",
      isOwn: true,
    };

    set((state) => {
      const existing = state.conversations[params.recipientUserId];
      const optimisticUsername =
        existing?.username &&
        !shouldHydrateUserLabel(existing.username, params.recipientUserId)
          ? existing.username
          : getCachedUserLabel(params.recipientUserId) ?? params.recipientUserId;
      const nextConversations = {
        ...state.conversations,
        [params.recipientUserId]: {
          userId: params.recipientUserId,
          username: optimisticUsername,
          messages: [...(existing?.messages ?? []), optimisticMsg],
          lastMessageAt: Date.now(),
          unreadCount: 0,
          peerIdentityKey: existing?.peerIdentityKey,
          peerIdentityDeviceId: existing?.peerIdentityDeviceId,
          peerIdentityByDevice: existing?.peerIdentityByDevice,
        },
      };
      return { conversations: nextConversations };
    });

    const abortController = new AbortController();
    registerUpload(clientMessageId, () => abortController.abort());
    setUploadLocalSource(clientMessageId, params.blob);

    const ciphertextBlob = new Blob([toSafeBlobChunk(encryptedAttachment.data)], {
      type: "application/octet-stream",
    });

    await uploadEncryptedAttachmentCiphertext({
      set,
      attachmentParams: params,
      uploadInit,
      ciphertextBlob,
      clientMessageId,
      abortController,
    });

    try {
      await completeAttachmentUpload(uploadInit.attachmentId);
    } catch (error) {
      await markOptimisticAttachmentError({
        set,
        recipientUserId: params.recipientUserId,
        clientMessageId,
      });
      throw error;
    }

    unregisterUpload(clientMessageId);

    await shared.recipientDeviceDirectory.ensureDirectRelationship(
      params.recipientUserId
    );
    const recipientDevices =
      await shared.recipientDeviceDirectory.getDeliverableRecipientDevices(
        params.recipientUserId,
        myDeviceId
      );
    if (recipientDevices.length === 0) {
      shared.recipientDeviceDirectory.invalidateRecipientDeviceCache(
        params.recipientUserId
      );
      throw new Error(
        "No recipient devices available (current device is excluded)"
      );
    }

    const singleRecipientDevice =
      recipientDevices.length === 1 ? recipientDevices[0] : null;

    set((state) => {
      const existing = state.conversations[params.recipientUserId];
      if (!existing) return {};
      const mergedPeerIdentityByDevice = {
        ...existing.peerIdentityByDevice,
        ...Object.fromEntries(
          recipientDevices.map(
            (device) => [device.deviceId, device.identityKeyPublic] as const
          )
        ),
      };
      return {
        conversations: {
          ...state.conversations,
          [params.recipientUserId]: {
            ...existing,
            peerIdentityKey:
              existing.peerIdentityKey ?? singleRecipientDevice?.identityKeyPublic,
            peerIdentityDeviceId:
              existing.peerIdentityDeviceId ?? singleRecipientDevice?.deviceId,
            peerIdentityByDevice:
              Object.keys(mergedPeerIdentityByDevice).length > 0
                ? mergedPeerIdentityByDevice
                : existing.peerIdentityByDevice,
          },
        },
      };
    });

    const messages: Array<{
      recipientDeviceId: string;
      ciphertext: string;
      type: "attachment";
      attachmentId: string;
      x3dhHeader?: object;
      oneTimePreKeyReservationToken?: string;
    }> = [];
    const sessionCommits: DirectDeviceSessionCommit[] = [];
    let queuedItem: OutboundQueueItem | null = null;

    await applyPendingSessionCommitsForRecipient(params.recipientUserId);

    for (const device of recipientDevices) {
      await shared.assertPeerIdentityContinuity(set, get, {
        recipientUserId: params.recipientUserId,
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
            params.recipientUserId,
            device.deviceId
          );
          shared.peerIdentityRuntime.cachePeerIdentity(
            device.deviceId,
            peerIdentityKeyB64 ?? device.identityKeyPublic
          );
          const ad = buildDirectMessageADv1({
            senderUserId: myUserId,
            senderDeviceId: myDeviceId,
            recipientUserId: params.recipientUserId,
            recipientDeviceId: device.deviceId,
            messageType: "attachment",
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
            type: "attachment",
            attachmentId: uploadInit.attachmentId,
            x3dhHeader,
            oneTimePreKeyReservationToken,
          });
        }

        queuedItem = {
          clientMessageId,
          recipientUserId: params.recipientUserId,
          messageType: "attachment",
          envelopes: messages.map((message) => ({
            recipientDeviceId: message.recipientDeviceId,
            ciphertext: message.ciphertext,
            type: message.type,
            attachmentId: message.attachmentId,
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

    let optimisticConversations: Record<string, Conversation> | null = null;
    set((state) => {
      optimisticConversations = state.conversations;
      return {};
    });
    if (optimisticConversations) {
      await persistConversations(optimisticConversations);
    }

    try {
      if (!queuedItem) throw new Error("Outbound queue item was not created");
      const response = await api.post<unknown>("/messages", {
        version: MESSAGE_PROTOCOL_VERSION,
        clientMessageId,
        recipientUserId: params.recipientUserId,
        messages,
      });
      const directDeliveries = parseDirectDeliveries(response);
      const fullyAccepted = await settleAcceptedDirectQueueItem(
        queuedItem,
        directDeliveries
      );

      await markDirectQueuedMessageStatus(
        params.recipientUserId,
        clientMessageId,
        fullyAccepted ? "sent" : "error",
        directDeliveries
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        shared.recipientDeviceDirectory.invalidateRecipientDeviceCache(
          params.recipientUserId
        );
      }
      let errorConversations: Record<string, Conversation> | null = null;
      set((state) => {
        const nextConversations = {
          ...state.conversations,
          [params.recipientUserId]: {
            ...state.conversations[params.recipientUserId]!,
            messages: state.conversations[params.recipientUserId]!.messages.map(
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
    sendAttachment: async (
      recipientUserId: string,
      file: File,
      caption?: string,
      mediaGroupId?: string
    ) => {
      await sendEncryptedAttachmentMessage({
        recipientUserId,
        blob: file,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || `attachment-${Date.now()}`,
        kind: "file",
        caption,
        optimisticContent: caption?.trim() || "[attachment]",
        fallbackUploadFileName: "attachment.enc",
        mediaGroupId,
      });
    },

    sendVoiceNote: async (
      recipientUserId: string,
      blob: Blob,
      durationMs: number
    ) => {
      await sendEncryptedAttachmentMessage({
        recipientUserId,
        blob,
        mimeType: blob.type || "audio/webm",
        fileName: `voice-note-${Date.now()}.webm`,
        kind: "voice_note",
        durationMs,
        optimisticContent: "[voice note]",
        fallbackUploadFileName: "voice-note.enc",
      });
    },

    sendVideoNote: async (
      recipientUserId: string,
      blob: Blob,
      durationMs: number
    ) => {
      await sendEncryptedAttachmentMessage({
        recipientUserId,
        blob,
        mimeType: blob.type || "video/webm",
        fileName: `video-note-${Date.now()}.webm`,
        kind: "video_note",
        durationMs,
        optimisticContent: "[video note]",
        fallbackUploadFileName: "video-note.enc",
      });
    },
  };
}
