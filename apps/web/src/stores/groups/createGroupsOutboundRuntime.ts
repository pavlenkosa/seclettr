import {
  MESSAGE_PROTOCOL_VERSION,
  PlaintextAttachmentMessageSchema,
  type SendGroupMessageRequestWire,
  type SendGroupMessageResponse,
  type PlaintextSenderKeyDistributionMessage,
} from "@seclettr/protocol";
import { encryptAttachment, toBase64Url } from "@seclettr/crypto";
import { api } from "@/lib/api";
import {
  clearUploadLocalSource,
  getUploadLocalSource,
  registerUpload,
  setUploadLocalSource,
  updateUploadProgress,
  unregisterUpload,
  uploadFormDataWithProgress,
} from "@/lib/upload-progress";
import {
  encryptGroupAttachmentEnvelope,
  encryptGroupTextEnvelope,
  type GroupCipherEnvelope,
} from "@/lib/group-sender-key";
import {
  ensureSenderKeyDistributedToGroupMembers,
  formatSenderLabel,
} from "./group-helpers";
import {
  incrementGroupOutboundRetryCount,
  loadAllPendingGroupOutboundItems,
  loadGroupOutboundQueueItem,
  persistGroupOutboundQueueItem,
  removeGroupOutboundQueueItem,
  type GroupOutboundQueueItem,
} from "./group-outbound-queue";
import type {
  GetGroupsState,
  GroupChatMessage,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";

const MAX_GROUP_OUTBOUND_RETRIES = 5;

function toSafeBlobChunk(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

function isUploadAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function parseServerMessageTimestamp(
  createdAt: string,
  fallbackTimestamp: number
): number {
  const timestamp = new Date(createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : fallbackTimestamp;
}

function hasApiErrorStatus(error: unknown, status: number): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidateStatus = (error as { status?: unknown }).status;
  return typeof candidateStatus === "number" && candidateStatus === status;
}

function isSenderKeyConflictError(error: unknown): boolean {
  if (!hasApiErrorStatus(error, 409)) {
    return false;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string"
    && message.includes("group sender-key message id already used");
}

interface OptimisticGroupAttachmentParams {
  set: SetGroupsState;
  groupId: string;
  optimisticId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createLocalMessageIdentifiers(): {
  optimisticId: string;
  clientMessageId: string;
} {
  const clientMessageId = crypto.randomUUID();
  return {
    optimisticId: `local-${clientMessageId}`,
    clientMessageId,
  };
}

function clientMessageIdForOptimisticId(optimisticId: string): string {
  const candidate = optimisticId.startsWith("local-")
    ? optimisticId.slice("local-".length)
    : optimisticId;
  return UUID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
}

function buildGroupMessagePayload(
  encryptedEnvelope: GroupCipherEnvelope,
  clientMessageId: string,
  type: "text" | "attachment",
  cryptoEpoch: number,
  attachmentId?: string
): SendGroupMessageRequestWire {
  const payload: SendGroupMessageRequestWire = {
    version: MESSAGE_PROTOCOL_VERSION,
    clientMessageId,
    groupId: encryptedEnvelope.groupId,
    distributionId: encryptedEnvelope.distributionId,
    cryptoEpoch,
    chainId: encryptedEnvelope.chainId,
    messageId: encryptedEnvelope.messageId,
    ciphertext: encryptedEnvelope.ciphertext,
    signature: encryptedEnvelope.signature,
    type,
    aeadVersion: encryptedEnvelope.aeadVersion,
  };

  return attachmentId ? { ...payload, attachmentId } : payload;
}

async function postGroupMessagePayloadWithRetry(
  groupId: string,
  payload: SendGroupMessageRequestWire
): Promise<SendGroupMessageResponse> {
  const postPayload = () =>
    api.post<SendGroupMessageResponse>(
      `/groups/${encodeURIComponent(groupId)}/messages`,
      payload
    );

  try {
    return await postPayload();
  } catch (error) {
    if (!isSenderKeyConflictError(error)) {
      throw error;
    }
    return postPayload();
  }
}

function markOptimisticGroupAttachmentError({
  set,
  groupId,
  optimisticId,
}: OptimisticGroupAttachmentParams): void {
  unregisterUpload(optimisticId);
  set((state) => {
    const group = state.groups[groupId];
    if (!group) return {};
    return {
      groups: {
        ...state.groups,
        [groupId]: {
          ...group,
          messages: group.messages.map((message) =>
            message.id === optimisticId
              ? { ...message, status: "error" as const }
              : message
          ),
        },
      },
    };
  });
}

function removeOptimisticGroupAttachmentMessage({
  set,
  groupId,
  optimisticId,
  isRetry,
}: OptimisticGroupAttachmentParams & { isRetry: boolean }): void {
  unregisterUpload(optimisticId);
  if (isRetry) {
    markOptimisticGroupAttachmentError({ set, groupId, optimisticId });
    return;
  }

  clearUploadLocalSource(optimisticId);
  set((state) => {
    const group = state.groups[groupId];
    if (!group) return {};
    const nextMessages = group.messages.filter(
      (message) => message.id !== optimisticId
    );
    return {
      groups: {
        ...state.groups,
        [groupId]: {
          ...group,
          messages: nextMessages,
          lastMessageAt: nextMessages.at(-1)?.timestamp ?? 0,
        },
      },
    };
  });
}

async function uploadCiphertextBlob(
  uploadInit: { attachmentId: string; uploadUrl: string; fields: Record<string, string> },
  ciphertextBlob: Blob,
  fileName: string,
  optimisticAttachmentParams: OptimisticGroupAttachmentParams,
  isRetry: boolean,
  updateProgress: (p: number) => void,
  abortSignal: AbortSignal
): Promise<void> {
  let uploadSucceeded = false;
  try {
    const formData = new FormData();
    for (const [key, value] of Object.entries(uploadInit.fields)) {
      formData.append(key, value);
    }
    formData.append("file", ciphertextBlob);
    uploadSucceeded = await uploadFormDataWithProgress(
      uploadInit.uploadUrl,
      formData,
      updateProgress,
      abortSignal
    );
  } catch (err) {
    if (isUploadAbortError(err)) {
      removeOptimisticGroupAttachmentMessage({ ...optimisticAttachmentParams, isRetry });
      throw err;
    }
    uploadSucceeded = false;
  }

  if (uploadSucceeded) return;

  const proxyForm = new FormData();
  proxyForm.append("ciphertext", ciphertextBlob, fileName);
  try {
    await api.upload<void>(
      `/attachments/${encodeURIComponent(uploadInit.attachmentId)}/upload-ciphertext`,
      proxyForm
    );
  } catch (err) {
    if (isUploadAbortError(err)) {
      removeOptimisticGroupAttachmentMessage({ ...optimisticAttachmentParams, isRetry });
      throw err;
    }
    markOptimisticGroupAttachmentError(optimisticAttachmentParams);
    throw err;
  }
}

async function completeAttachmentUpload(attachmentId: string): Promise<void> {
  await api.post<void>(`/attachments/${encodeURIComponent(attachmentId)}/complete`);
}

interface CreateGroupsOutboundRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
  sendSenderKeyDistribution: (
    recipientUserId: string,
    payload: PlaintextSenderKeyDistributionMessage,
    options?: {
      prefetchedDevices?: Array<{
        deviceId: string;
        identityKeyPublic: string;
      }>;
    }
  ) => Promise<string[]>;
}

interface GroupAttachmentSendOptions {
  replaceMessageId?: string;
  optimisticTimestamp?: number;
}

interface UploadGroupAttachmentOptions extends GroupAttachmentSendOptions {
  groupId: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  kind: "file" | "voice_note" | "video_note";
  caption?: string;
  durationMs?: number;
  mediaGroupId?: string;
}

export function createGroupsOutboundRuntime({
  set,
  get,
  shared,
  sendSenderKeyDistribution,
}: CreateGroupsOutboundRuntimeOptions) {
  const pendingGroupOutboundEnvelopes = new Map<string, GroupOutboundQueueItem>();

  async function ensureGroupSenderKeys(
    groupId: string,
    members: ReturnType<GetGroupsState>["groups"][string]["members"]
  ) {
    const myUserId = shared.getMyUserId();
    const myDeviceId = shared.getMyDeviceId();
    const storageKey = shared.getStorageKey();
    if (!myUserId || !myDeviceId || !storageKey) {
      throw new Error("Not authenticated");
    }
    await ensureSenderKeyDistributedToGroupMembers(
      storageKey,
      groupId,
      myUserId,
      myDeviceId,
      members,
      sendSenderKeyDistribution as Parameters<
        typeof ensureSenderKeyDistributedToGroupMembers
      >[5]
    );
    return {
      myDeviceId,
      storageKey,
    };
  }

  async function encryptGroupTextPayload(
    groupId: string,
    clientMessageId: string,
    content: string,
    reply?: { id: string; snippet: string }
  ): Promise<SendGroupMessageRequestWire> {
    const myDeviceId = shared.getMyDeviceId();
    const storageKey = shared.getStorageKey();
    if (!myDeviceId || !storageKey) {
      throw new Error("Not authenticated");
    }

    const encryptedEnvelope = await encryptGroupTextEnvelope(
      storageKey,
      groupId,
      myDeviceId,
      content,
      reply
    );
    return buildGroupMessagePayload(
      encryptedEnvelope,
      clientMessageId,
      "text",
      get().groups[groupId]?.cryptoEpoch ?? 1
    );
  }

  function markLocalGroupMessageStatus(
    groupId: string,
    localMessageId: string,
    status: GroupChatMessage["status"]
  ): void {
    set((state) => {
      const currentGroup = state.groups[groupId];
      if (!currentGroup) return {};
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...currentGroup,
            messages: currentGroup.messages.map((entry) =>
              entry.id === localMessageId ? { ...entry, status } : entry
            ),
          },
        },
      };
    });
  }

  function ensureQueuedOptimisticMessage(item: GroupOutboundQueueItem): void {
    set((state) => {
      const currentGroup =
        state.groups[item.groupId] ??
        shared.createUnknownGroupChat(item.groupId, { historyLoaded: true });
      const hasMessage = currentGroup.messages.some(
        (message) => message.id === item.localMessageId
      );
      if (hasMessage) {
        return {
          groups: {
            ...state.groups,
            [item.groupId]: {
              ...currentGroup,
              messages: currentGroup.messages.map((message) =>
                message.id === item.localMessageId
                  ? { ...message, status: "sending" as const }
                  : message
              ),
            },
          },
        };
      }

      const restoredMessage = {
        ...item.optimisticMessage,
        status: "sending" as const,
      };
      const nextMessages = [...currentGroup.messages, restoredMessage].sort(
        (left, right) => left.timestamp - right.timestamp
      );
      return {
        groups: {
          ...state.groups,
          [item.groupId]: {
            ...currentGroup,
            messages: nextMessages,
            lastMessageAt: nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
          },
        },
      };
    });
  }

  function markQueuedMessageSent(
    item: GroupOutboundQueueItem,
    sentMessage: SendGroupMessageResponse
  ): void {
    set((state) => {
      const currentGroup = state.groups[item.groupId];
      if (!currentGroup) return {};
      const timestamp = parseServerMessageTimestamp(
        sentMessage.createdAt,
        item.optimisticMessage.timestamp
      );
      const nextMessages = currentGroup.messages
        .map((message) =>
          message.id === item.localMessageId
            ? {
                ...message,
                id: sentMessage.serverMessageId,
                timestamp,
                status: "sent" as const,
              }
            : message
        )
        .sort((left, right) => left.timestamp - right.timestamp);
      return {
        groups: {
          ...state.groups,
          [item.groupId]: {
            ...currentGroup,
            messages: nextMessages,
            lastMessageAt: nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
          },
        },
      };
    });
  }

  async function deliverQueuedGroupOutboundItem(
    item: GroupOutboundQueueItem
  ): Promise<SendGroupMessageResponse> {
    return postGroupMessagePayloadWithRetry(item.groupId, item.payload);
  }

  async function uploadAndEncryptGroupAttachment({
    groupId,
    blob,
    mimeType,
    fileName,
    kind,
    caption,
    durationMs,
    mediaGroupId,
    replaceMessageId,
    optimisticTimestamp,
  }: UploadGroupAttachmentOptions): Promise<void> {
    const myDeviceId = shared.getMyDeviceId();
    const storageKey = shared.getStorageKey();
    if (!myDeviceId || !storageKey) throw new Error("Not authenticated");
    if (blob.size <= 0) throw new Error("Attachment blob is empty");

    // Encrypt first so we have key/digest for the optimistic message.
    const encryptedAttachment = await encryptAttachment(
      new Uint8Array(await blob.arrayBuffer()),
      mimeType
    );

    const uploadInit = await api.post<{
      attachmentId: string;
      uploadUrl: string;
      fields: Record<string, string>;
    }>("/attachments/init-upload", {
      encryptedSize: encryptedAttachment.data.length,
      encryptedDigest: toBase64Url(encryptedAttachment.digest),
      contentType: mimeType,
    });

    // Add optimistic message early (before upload) so the sender sees it with a progress bar.
    const isRetry = Boolean(replaceMessageId);
    const localMessageIds = createLocalMessageIdentifiers();
    const optimisticId = replaceMessageId ?? localMessageIds.optimisticId;
    const clientMessageId = replaceMessageId
      ? clientMessageIdForOptimisticId(replaceMessageId)
      : localMessageIds.clientMessageId;
    const effectiveTimestamp = optimisticTimestamp ?? Date.now();
    const trimmedCaption = caption?.trim() || undefined;
    const optimisticMessage: GroupChatMessage = {
      id: optimisticId,
      senderDeviceId: myDeviceId,
      senderLabel: formatSenderLabel(myDeviceId, true),
      content: trimmedCaption ?? fileName,
      type: "attachment",
      attachment: {
        attachmentId: uploadInit.attachmentId,
        key: toBase64Url(encryptedAttachment.key),
        digest: toBase64Url(encryptedAttachment.digest),
        mimeType,
        fileName,
        size: blob.size,
        caption: trimmedCaption,
        kind,
        durationMs: durationMs && durationMs > 0 && durationMs <= 120000 ? Math.round(durationMs) : undefined,
        mediaGroupId,
      },
      timestamp: effectiveTimestamp,
      status: "sending",
      isOwn: true,
      rawType: "attachment",
    };

    set((state) => {
      const group = state.groups[groupId] ?? shared.createUnknownGroupChat(groupId, { historyLoaded: true });
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            messages: isRetry
              ? group.messages.map((message) =>
                  message.id === optimisticId ? optimisticMessage : message
                )
              : [...group.messages, optimisticMessage],
            lastMessageAt: isRetry
              ? group.lastMessageAt
              : effectiveTimestamp,
          },
        },
      };
    });

    const abortController = new AbortController();
    registerUpload(optimisticId, () => abortController.abort());
    setUploadLocalSource(optimisticId, blob);

    const updateProgress = (p: number) => updateUploadProgress(optimisticId, p);

    const ciphertextBlob = new Blob([toSafeBlobChunk(encryptedAttachment.data)], {
      type: "application/octet-stream",
    });

    const optimisticAttachmentParams = { set, groupId, optimisticId };

    await uploadCiphertextBlob(
      uploadInit,
      ciphertextBlob,
      fileName,
      optimisticAttachmentParams,
      isRetry,
      updateProgress,
      abortController.signal
    );

    try {
      await completeAttachmentUpload(uploadInit.attachmentId);
    } catch (err) {
      markOptimisticGroupAttachmentError(optimisticAttachmentParams);
      throw err;
    }

    unregisterUpload(optimisticId);

    const attachmentPayload = PlaintextAttachmentMessageSchema.parse({
      key: toBase64Url(encryptedAttachment.key),
      digest: toBase64Url(encryptedAttachment.digest),
      attachmentId: uploadInit.attachmentId,
      mimeType,
      fileName,
      size: blob.size,
      caption: trimmedCaption,
      kind,
      durationMs: optimisticMessage.attachment?.durationMs,
      mediaGroupId,
    });

    await get().refreshGroup(groupId, { refreshDeviceLabels: false });
    const members = get().groups[groupId]?.members ?? [];
    await ensureGroupSenderKeys(groupId, members);

    try {
      const encryptedEnvelope = await encryptGroupAttachmentEnvelope(
        storageKey,
        groupId,
        myDeviceId,
        attachmentPayload
      );
      const outboundPayload = buildGroupMessagePayload(
        encryptedEnvelope,
        clientMessageId,
        "attachment",
        get().groups[groupId]?.cryptoEpoch ?? 1,
        uploadInit.attachmentId
      );
      const queueItem: GroupOutboundQueueItem = {
        localMessageId: optimisticId,
        groupId,
        clientMessageId,
        messageType: "attachment",
        payload: outboundPayload,
        optimisticMessage,
        createdAt: Date.now(),
        retryCount: 0,
      };
      pendingGroupOutboundEnvelopes.set(optimisticId, queueItem);
      await persistGroupOutboundQueueItem(queueItem);
      const sentMessage = await deliverQueuedGroupOutboundItem(queueItem);

      markQueuedMessageSent(queueItem, sentMessage);
      pendingGroupOutboundEnvelopes.delete(optimisticId);
      await removeGroupOutboundQueueItem(optimisticId).catch(() => null);
      clearUploadLocalSource(optimisticId);
    } catch (error) {
      markOptimisticGroupAttachmentError(optimisticAttachmentParams);
      throw error;
    }
  }

  async function resumePendingGroupOutboundMessages(): Promise<void> {
    const items = await loadAllPendingGroupOutboundItems();
    for (const item of items) {
      const group = get().groups[item.groupId];
      const existingMessage = group?.messages.find(
        (message) => message.id === item.localMessageId
      );
      if (
        existingMessage?.status === "sent" ||
        existingMessage?.status === "delivered"
      ) {
        await removeGroupOutboundQueueItem(item.localMessageId);
        pendingGroupOutboundEnvelopes.delete(item.localMessageId);
        continue;
      }

      const newCount = await incrementGroupOutboundRetryCount(item.localMessageId);
      if (newCount > MAX_GROUP_OUTBOUND_RETRIES) {
        ensureQueuedOptimisticMessage({
          ...item,
          optimisticMessage: {
            ...item.optimisticMessage,
            status: "error",
          },
        });
        markLocalGroupMessageStatus(item.groupId, item.localMessageId, "error");
        await removeGroupOutboundQueueItem(item.localMessageId);
        pendingGroupOutboundEnvelopes.delete(item.localMessageId);
        continue;
      }

      pendingGroupOutboundEnvelopes.set(item.localMessageId, item);
      ensureQueuedOptimisticMessage(item);

      try {
        const sentMessage = await deliverQueuedGroupOutboundItem(item);
        markQueuedMessageSent(item, sentMessage);
        pendingGroupOutboundEnvelopes.delete(item.localMessageId);
        await removeGroupOutboundQueueItem(item.localMessageId);
      } catch {
        markLocalGroupMessageStatus(item.groupId, item.localMessageId, "error");
      }
    }
  }

  async function retryFromQueueItem(
    groupId: string,
    messageId: string,
    localMessageId: string,
    queueItem: GroupOutboundQueueItem
  ): Promise<void> {
    pendingGroupOutboundEnvelopes.set(localMessageId, queueItem);
    markLocalGroupMessageStatus(groupId, messageId, "sending");
    try {
      const sentMessage = await deliverQueuedGroupOutboundItem(queueItem);
      markQueuedMessageSent(queueItem, sentMessage);
      pendingGroupOutboundEnvelopes.delete(localMessageId);
      await removeGroupOutboundQueueItem(localMessageId).catch(() => null);
      if (queueItem.messageType === "attachment") {
        clearUploadLocalSource(localMessageId);
      }
    } catch {
      markLocalGroupMessageStatus(groupId, messageId, "error");
    }
  }

  async function retryAttachmentUpload(
    groupId: string,
    message: NonNullable<ReturnType<GetGroupsState>["groups"][string]>["messages"][number]
  ): Promise<void> {
    if (message.type !== "attachment" || !message.attachment) return;
    const localSource = getUploadLocalSource(message.id);
    if (!localSource) return;
    try {
      await uploadAndEncryptGroupAttachment({
        groupId,
        blob: localSource,
        mimeType: message.attachment.mimeType || localSource.type || "application/octet-stream",
        fileName: message.attachment.fileName || message.content || `attachment-${Date.now()}`,
        kind: message.attachment.kind ?? "file",
        caption: message.attachment.caption,
        durationMs: message.attachment.durationMs,
        mediaGroupId: message.attachment.mediaGroupId,
        replaceMessageId: message.id,
        optimisticTimestamp: message.timestamp,
      });
    } catch {
      // uploadAndEncryptGroupAttachment already restores the message to error.
    }
  }

  return {
    resumePendingGroupOutboundMessages,

    sendGroupText: async (
      groupId: string,
      text: string,
      reply?: { id: string; snippet: string }
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const myDeviceId = shared.getMyDeviceId();
      if (!myDeviceId) {
        throw new Error("Not authenticated");
      }

      const { optimisticId, clientMessageId } = createLocalMessageIdentifiers();
      const optimisticTimestamp = Date.now();
      const optimisticMessage: GroupChatMessage = {
        id: optimisticId,
        senderDeviceId: myDeviceId,
        senderLabel: formatSenderLabel(myDeviceId, true),
        content: trimmed,
        replyTo: reply ? { id: reply.id, content: reply.snippet } : undefined,
        timestamp: optimisticTimestamp,
        status: "sending",
        isOwn: true,
        rawType: "text",
      };

      set((state) => {
        const group =
          state.groups[groupId] ??
          shared.createUnknownGroupChat(groupId, {
            historyLoaded: true,
          });
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...group,
              messages: [...group.messages, optimisticMessage],
              lastMessageAt: optimisticTimestamp,
            },
          },
        };
      });

      try {
        await get().refreshGroup(groupId, { refreshDeviceLabels: false });
        const members = get().groups[groupId]?.members ?? [];
        await ensureGroupSenderKeys(groupId, members);
        const outboundPayload = await encryptGroupTextPayload(
          groupId,
          clientMessageId,
          trimmed,
          reply
        );
        const queueItem: GroupOutboundQueueItem = {
          localMessageId: optimisticId,
          groupId,
          clientMessageId,
          messageType: "text",
          payload: outboundPayload,
          optimisticMessage,
          createdAt: Date.now(),
          retryCount: 0,
        };
        pendingGroupOutboundEnvelopes.set(optimisticId, queueItem);
        await persistGroupOutboundQueueItem(queueItem);
        const sentMessage = await deliverQueuedGroupOutboundItem(queueItem);

        markQueuedMessageSent(queueItem, sentMessage);
        pendingGroupOutboundEnvelopes.delete(optimisticId);
        await removeGroupOutboundQueueItem(optimisticId).catch(() => null);
      } catch (error) {
        set((state) => {
          const group = state.groups[groupId];
          if (!group) return {};
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                messages: group.messages.map((message) =>
                  message.id === optimisticId
                    ? { ...message, status: "error" }
                    : message
                ),
              },
            },
          };
        });
        throw error;
      }
    },

    retryGroupMessage: async (groupId: string, messageId: string) => {
      const group = get().groups[groupId];
      if (!group) return;
      const message = group.messages.find((entry) => entry.id === messageId);
      if (message?.status !== "error") return;
      // Only retry locally-created pending messages — not server history that failed to decrypt
      if (!message.id.startsWith("local-")) return;
      if (!shared.getMyDeviceId() || !shared.getMyUserId() || !shared.getStorageKey()) return;

      const cachedQueueItem =
        pendingGroupOutboundEnvelopes.get(message.id) ??
        (await loadGroupOutboundQueueItem(message.id));

      if (cachedQueueItem?.groupId === groupId) {
        await retryFromQueueItem(groupId, messageId, message.id, cachedQueueItem);
        return;
      }

      if (message.rawType === "attachment" && message.type === "attachment") {
        await retryAttachmentUpload(groupId, message);
      }
    },

    sendGroupFileAttachment: async (
      groupId: string,
      file: File,
      mediaGroupId?: string,
      caption?: string
    ) => {
      await uploadAndEncryptGroupAttachment({
        groupId,
        blob: file,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || `attachment-${Date.now()}`,
        kind: "file",
        caption,
        mediaGroupId,
      });
    },

    sendGroupVoiceNote: async (groupId: string, blob: Blob, durationMs: number) => {
      await uploadAndEncryptGroupAttachment({
        groupId,
        blob,
        mimeType: blob.type || "audio/webm",
        fileName: `voice-note-${Date.now()}.webm`,
        kind: "voice_note",
        durationMs,
      });
    },

    sendGroupVideoNote: async (groupId: string, blob: Blob, durationMs: number) => {
      await uploadAndEncryptGroupAttachment({
        groupId,
        blob,
        mimeType: blob.type || "video/webm",
        fileName: `video-note-${Date.now()}.webm`,
        kind: "video_note",
        durationMs,
      });
    },
  };
}
