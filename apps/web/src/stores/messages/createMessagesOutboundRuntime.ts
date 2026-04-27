import { ApiError, api } from "@/lib/api";
import {
  clearUploadLocalSource,
  registerUpload,
  setUploadLocalSource,
  updateUploadProgress,
  unregisterUpload,
  uploadFormDataWithProgress,
} from "@/lib/upload-progress";
import { encodeDirectEnvelope } from "@/lib/direct-envelope";
import { getCachedUserLabel, shouldHydrateUserLabel } from "@/lib/user-labels";
import { persistConversations } from "./conversation-persistence";
import {
  incrementOutboundRetryCount,
  loadAllPendingOutboundItems,
  persistOutboundQueueItem,
  removeOutboundQueueItem,
  type OutboundQueueDeviceEnvelope,
} from "./outbound-queue";
import {
  MESSAGE_PROTOCOL_VERSION,
  PlaintextAttachmentMessageSchema,
  PlaintextSenderKeyDistributionMessageSchema,
  type PlaintextSenderKeyDistributionMessage,
} from "@seclettr/protocol";
import {
  encryptAttachment,
  ratchetEncrypt,
  toBase64Url,
} from "@seclettr/crypto";
import type { RecipientDeviceInfo } from "./recipient-directory";
import type {
  Conversation,
  GetMessagesState,
  Message,
  MessagesSendEncryptedAttachmentParams,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";

const MAX_OUTBOUND_RETRIES = 5;

export function buildDirectMessageADv1(params: {
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  messageType: "text" | "attachment" | "sender_key_distribution";
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      p: "seclettr-dm",
      v: 1,
      su: params.senderUserId,
      sd: params.senderDeviceId,
      ru: params.recipientUserId,
      rd: params.recipientDeviceId,
      mt: params.messageType,
    })
  );
}

interface CreateMessagesOutboundRuntimeOptions {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: MessagesRuntimeShared;
  schedulePendingMessageSync: (reason: string) => void;
}

function clampDurationMs(durationMs: number | undefined): number | undefined {
  if (!durationMs || !Number.isFinite(durationMs)) return undefined;
  return Math.max(1, Math.min(120_000, Math.round(durationMs)));
}

function toSafeBlobChunk(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

function isUploadAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

interface AttachmentUploadInitResponse {
  attachmentId: string;
  uploadUrl: string;
  fields: Record<string, string>;
}

interface OptimisticAttachmentStateParams {
  set: SetMessagesState;
  recipientUserId: string;
  clientMessageId: string;
}

function createUploadFormData(
  fields: Record<string, string>,
  ciphertextBlob: Blob,
  options: { fileFieldName?: string; fileName?: string } = {}
): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  const fileFieldName = options.fileFieldName ?? "file";
  if (options.fileName) {
    formData.append(fileFieldName, ciphertextBlob, options.fileName);
  } else {
    formData.append(fileFieldName, ciphertextBlob);
  }
  return formData;
}

async function removeOptimisticAttachmentMessage({
  set,
  recipientUserId,
  clientMessageId,
}: OptimisticAttachmentStateParams): Promise<void> {
  unregisterUpload(clientMessageId);
  clearUploadLocalSource(clientMessageId);
  let nextConversations: Record<string, Conversation> | null = null;
  set((state) => {
    const conv = state.conversations[recipientUserId];
    if (!conv) return {};
    const nextMessages = conv.messages.filter(
      (message) => message.id !== clientMessageId
    );
    nextConversations = {
      ...state.conversations,
      [recipientUserId]: {
        ...conv,
        messages: nextMessages,
        lastMessageAt: nextMessages.at(-1)?.timestamp ?? 0,
      },
    };
    return { conversations: nextConversations };
  });
  if (nextConversations) {
    await persistConversations(nextConversations);
  }
}

async function markOptimisticAttachmentError({
  set,
  recipientUserId,
  clientMessageId,
}: OptimisticAttachmentStateParams): Promise<void> {
  unregisterUpload(clientMessageId);
  clearUploadLocalSource(clientMessageId);
  let errorConversations: Record<string, Conversation> | null = null;
  set((state) => {
    const conv = state.conversations[recipientUserId];
    if (!conv) return {};
    const nextConversations = {
      ...state.conversations,
      [recipientUserId]: {
        ...conv,
        messages: conv.messages.map((message) =>
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
}

async function uploadEncryptedAttachmentCiphertext({
  set,
  params,
  uploadInit,
  ciphertextBlob,
  clientMessageId,
  abortController,
}: {
  set: SetMessagesState;
  params: MessagesSendEncryptedAttachmentParams;
  uploadInit: AttachmentUploadInitResponse;
  ciphertextBlob: Blob;
  clientMessageId: string;
  abortController: AbortController;
}): Promise<void> {
  const optimisticStateParams = {
    set,
    recipientUserId: params.recipientUserId,
    clientMessageId,
  };
  let uploadSucceeded = false;
  try {
    uploadSucceeded = await uploadFormDataWithProgress(
      uploadInit.uploadUrl,
      createUploadFormData(uploadInit.fields, ciphertextBlob),
      (progress) => updateUploadProgress(clientMessageId, progress),
      abortController.signal
    );
  } catch (err) {
    if (isUploadAbortError(err)) {
      await removeOptimisticAttachmentMessage(optimisticStateParams);
      throw err;
    }
    uploadSucceeded = false;
  }

  if (uploadSucceeded) {
    return;
  }

  try {
    await api.upload<void>(
      `/attachments/${encodeURIComponent(uploadInit.attachmentId)}/upload-ciphertext`,
      createUploadFormData({}, ciphertextBlob, {
        fileFieldName: "ciphertext",
        fileName: params.fallbackUploadFileName,
      })
    );
  } catch (err) {
    if (isUploadAbortError(err)) {
      await removeOptimisticAttachmentMessage(optimisticStateParams);
      throw err;
    }
    await markOptimisticAttachmentError(optimisticStateParams);
    throw err;
  }
}

export function createMessagesOutboundRuntime({
  set,
  get,
  shared,
  schedulePendingMessageSync,
}: CreateMessagesOutboundRuntimeOptions) {
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

    const uploadInit = await api.post<AttachmentUploadInitResponse>("/attachments/init-upload", {
      encryptedSize: encryptedAttachment.data.length,
      encryptedDigest: toBase64Url(encryptedAttachment.digest),
      contentType: params.mimeType,
    });

    // Build full attachment payload (key/digest known after encryption).
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

    // Add optimistic message BEFORE the upload so the sender sees the bubble
    // with a progress bar immediately.
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

    // Upload with progress tracking.
    const abortController = new AbortController();
    registerUpload(clientMessageId, () => abortController.abort());
    setUploadLocalSource(clientMessageId, params.blob);

    const ciphertextBlob = new Blob([toSafeBlobChunk(encryptedAttachment.data)], {
      type: "application/octet-stream",
    });

    await uploadEncryptedAttachmentCiphertext({
      set,
      params,
      uploadInit,
      ciphertextBlob,
      clientMessageId,
      abortController,
    });

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

    // Update peerIdentity now that we have recipient devices.
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

    for (const device of recipientDevices) {
      await shared.assertPeerIdentityContinuity(set, get, {
        recipientUserId: params.recipientUserId,
        deviceId: device.deviceId,
        observedIdentityKey: device.identityKeyPublic,
      });

      await shared.withSessionLock(device.deviceId, async () => {
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
        await shared.messageSessionRuntime.saveSession(device.deviceId, state);

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
      });
    }

    let optimisticConversations: Record<string, Conversation> | null = null;
    // Persist the optimistic state now that we have peerIdentity info.
    set((state) => {
      optimisticConversations = state.conversations;
      return {};
    });
    if (optimisticConversations) {
      await persistConversations(optimisticConversations);
    }

    // DM-01: durable queue — persist encrypted envelopes before the HTTP call.
    await persistOutboundQueueItem({
      clientMessageId,
      recipientUserId: params.recipientUserId,
      messageType: "attachment",
      envelopes: messages.map((m) => ({
        recipientDeviceId: m.recipientDeviceId,
        ciphertext: m.ciphertext,
        type: m.type,
        attachmentId: m.attachmentId,
        x3dhHeader: m.x3dhHeader as OutboundQueueDeviceEnvelope["x3dhHeader"],
        oneTimePreKeyReservationToken: m.oneTimePreKeyReservationToken,
      })),
      createdAt: Date.now(),
      retryCount: 0,
    });

    try {
      await api.post("/messages", {
        version: MESSAGE_PROTOCOL_VERSION,
        clientMessageId,
        recipientUserId: params.recipientUserId,
        messages,
      });

      let sentConversations: Record<string, Conversation> | null = null;
      set((state) => {
        const nextConversations = {
          ...state.conversations,
          [params.recipientUserId]: {
            ...state.conversations[params.recipientUserId]!,
            messages: state.conversations[params.recipientUserId]!.messages.map(
              (message) =>
                message.id === clientMessageId
                  ? { ...message, status: "sent" as const }
                  : message
            ),
          },
        };
        sentConversations = nextConversations;
        return { conversations: nextConversations };
      });
      if (sentConversations) {
        await persistConversations(sentConversations);
      }
      removeOutboundQueueItem(clientMessageId).catch(() => null);
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

  async function sendEncryptedSenderKeyDistribution(
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

    for (const device of recipientDevices) {
      await shared.assertPeerIdentityContinuity(set, get, {
        recipientUserId,
        deviceId: device.deviceId,
        observedIdentityKey: device.identityKeyPublic,
      });

      await shared.withSessionLock(device.deviceId, async () => {
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
          recipientUserId: recipientUserId,
          recipientDeviceId: device.deviceId,
          messageType: "sender_key_distribution",
        });
        const encrypted = await ratchetEncrypt(state, plaintext, ad);
        await shared.messageSessionRuntime.saveSession(device.deviceId, state);

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
      });
    }

    try {
      await api.post("/messages", {
        version: MESSAGE_PROTOCOL_VERSION,
        clientMessageId: crypto.randomUUID(),
        recipientUserId,
        messages,
      });
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
    sendAttachment: async (recipientUserId: string, file: File, caption?: string, mediaGroupId?: string) => {
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

    sendVoiceNote: async (recipientUserId: string, blob: Blob, durationMs: number) => {
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

    sendVideoNote: async (recipientUserId: string, blob: Blob, durationMs: number) => {
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

    sendSenderKeyDistribution: async (
      recipientUserId: string,
      payload: PlaintextSenderKeyDistributionMessage,
      options?: {
        prefetchedDevices?: Array<{
          deviceId: string;
          identityKeyPublic: string;
        }>;
      }
    ) => {
      return sendEncryptedSenderKeyDistribution(
        recipientUserId,
        payload,
        options
      );
    },

    sendMessage: async (
      recipientUserId: string,
      text: string,
      reply?: { id: string; snippet: string }
    ) => {
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

      const plaintext = new TextEncoder().encode(
        JSON.stringify({
          text,
          ...(reply ? { replyToId: reply.id, replySnippet: reply.snippet } : {}),
        })
      );

      const singleRecipientDevice =
        recipientDevices.length === 1 ? recipientDevices[0] : null;

      for (const device of recipientDevices) {
        await shared.assertPeerIdentityContinuity(set, get, {
          recipientUserId,
          deviceId: device.deviceId,
          observedIdentityKey: device.identityKeyPublic,
        });

        await shared.withSessionLock(device.deviceId, async () => {
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
            recipientUserId: recipientUserId,
            recipientDeviceId: device.deviceId,
            messageType: "text",
          });
          const encrypted = await ratchetEncrypt(state, plaintext, ad);
          await shared.messageSessionRuntime.saveSession(device.deviceId, state);

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

      // DM-01: durable queue — persist encrypted envelopes before the HTTP call.
      await persistOutboundQueueItem({
        clientMessageId,
        recipientUserId,
        messageType: "text",
        envelopes: messages.map((m) => ({
          recipientDeviceId: m.recipientDeviceId,
          ciphertext: m.ciphertext,
          type: m.type,
          x3dhHeader: m.x3dhHeader as OutboundQueueDeviceEnvelope["x3dhHeader"],
          oneTimePreKeyReservationToken: m.oneTimePreKeyReservationToken,
        })),
        createdAt: Date.now(),
        retryCount: 0,
      });

      try {
        await api.post("/messages", {
          version: MESSAGE_PROTOCOL_VERSION,
          clientMessageId,
          recipientUserId,
          messages,
        });

        let sentConversations: Record<string, Conversation> | null = null;
        set((state) => {
          const nextConversations = {
            ...state.conversations,
            [recipientUserId]: {
              ...state.conversations[recipientUserId]!,
              messages: state.conversations[recipientUserId]!.messages.map((message) =>
                message.id === clientMessageId
                  ? { ...message, status: "sent" as const }
                  : message
              ),
            },
          };
          sentConversations = nextConversations;
          return { conversations: nextConversations };
        });
        if (sentConversations) {
          await persistConversations(sentConversations);
        }
        removeOutboundQueueItem(clientMessageId).catch(() => null);
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
              messages: state.conversations[recipientUserId]!.messages.map((message) =>
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
    },

    resumePendingOutboundMessages,
  };

  // DM-01/DM-03: retry pending envelopes using stored ciphertext (no re-encrypt).
  // Called on WS reconnect. Enforces MAX_OUTBOUND_RETRIES budget (DM-03).
  async function resumePendingOutboundMessages(): Promise<void> {
    const items = await loadAllPendingOutboundItems();
    const state = get();

    for (const item of items) {
      const conv = state.conversations[item.recipientUserId];
      const bubble = conv?.messages.find((m) => m.id === item.clientMessageId);

      if (!bubble) {
        // Orphan — no UI bubble, prune.
        await removeOutboundQueueItem(item.clientMessageId);
        continue;
      }

      if (
        bubble.status === "sent" ||
        bubble.status === "delivered" ||
        bubble.status === "read"
      ) {
        await removeOutboundQueueItem(item.clientMessageId);
        continue;
      }

      // DM-03: enforce retry budget before attempting POST.
      const newCount = await incrementOutboundRetryCount(item.clientMessageId);
      if (newCount > MAX_OUTBOUND_RETRIES) {
        set((s) => ({
          quarantinedMessageIds: new Set([
            ...s.quarantinedMessageIds,
            item.clientMessageId,
          ]),
        }));
        await removeOutboundQueueItem(item.clientMessageId);
        continue;
      }

      try {
        await api.post("/messages", {
          version: MESSAGE_PROTOCOL_VERSION,
          clientMessageId: item.clientMessageId,
          recipientUserId: item.recipientUserId,
          messages: item.envelopes.map((env) => ({
            recipientDeviceId: env.recipientDeviceId,
            ciphertext: env.ciphertext,
            type: env.type,
            attachmentId: env.attachmentId,
            x3dhHeader: env.x3dhHeader,
            oneTimePreKeyReservationToken: env.oneTimePreKeyReservationToken,
          })),
        });

        let sentConversations: Record<string, Conversation> | null = null;
        set((s) => {
          const c = s.conversations[item.recipientUserId];
          if (!c) return {};
          const nextConversations = {
            ...s.conversations,
            [item.recipientUserId]: {
              ...c,
              messages: c.messages.map((m) =>
                m.id === item.clientMessageId
                  ? { ...m, status: "sent" as const }
                  : m
              ),
            },
          };
          sentConversations = nextConversations;
          return { conversations: nextConversations };
        });
        if (sentConversations) {
          await persistConversations(sentConversations);
        }
        await removeOutboundQueueItem(item.clientMessageId);
      } catch {
        // Keep in queue; will retry on next reconnect.
      }
    }
  }
}
