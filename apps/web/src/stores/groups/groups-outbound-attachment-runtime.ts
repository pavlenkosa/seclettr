import { PlaintextAttachmentMessageSchema } from "@seclettr/protocol";
import { encryptAttachment, toBase64Url } from "@seclettr/crypto";
import { api } from "@/lib/api";
import {
  clearUploadLocalSource,
  getUploadLocalSource,
  registerUpload,
  setUploadLocalSource,
  unregisterUpload,
  updateUploadProgress,
  uploadFormDataWithProgress,
} from "@/lib/upload-progress";
import { encryptGroupAttachmentEnvelope } from "@/lib/group-sender-key";
import { formatSenderLabel } from "./group-display-helpers";
import {
  buildGroupMessagePayload,
  clientMessageIdForOptimisticId,
  createLocalMessageIdentifiers,
  isUploadAbortError,
  toSafeBlobChunk,
} from "./groups-outbound-helpers";
import {
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
import type { GroupMember } from "./types";
import type { SendGroupMessageResponse } from "@seclettr/protocol";

interface OptimisticGroupAttachmentParams {
  set: SetGroupsState;
  groupId: string;
  optimisticId: string;
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

interface CreateGroupsOutboundAttachmentRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
  pendingGroupOutboundEnvelopes: Map<string, GroupOutboundQueueItem>;
  ensureGroupSenderKeys: (
    groupId: string,
    members: GroupMember[]
  ) => Promise<{
    myDeviceId: string;
    storageKey: CryptoKey;
  }>;
  deliverQueuedGroupOutboundItem: (
    item: GroupOutboundQueueItem
  ) => Promise<SendGroupMessageResponse>;
  markQueuedMessageSent: (
    item: GroupOutboundQueueItem,
    sentMessage: SendGroupMessageResponse
  ) => void;
}

/**
 * Owns sender-side encrypted group attachment send flow:
 * optimistic bubble, upload, complete, sender-key precondition, and final settle.
 */
export function createGroupsOutboundAttachmentRuntime({
  set,
  get,
  shared,
  pendingGroupOutboundEnvelopes,
  ensureGroupSenderKeys,
  deliverQueuedGroupOutboundItem,
  markQueuedMessageSent,
}: CreateGroupsOutboundAttachmentRuntimeOptions) {
  function markOptimisticGroupAttachmentError({
    set: localSet,
    groupId,
    optimisticId,
  }: OptimisticGroupAttachmentParams): void {
    unregisterUpload(optimisticId);
    localSet((state) => {
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
    set: localSet,
    groupId,
    optimisticId,
    isRetry,
  }: OptimisticGroupAttachmentParams & { isRetry: boolean }): void {
    unregisterUpload(optimisticId);
    if (isRetry) {
      markOptimisticGroupAttachmentError({ set: localSet, groupId, optimisticId });
      return;
    }

    clearUploadLocalSource(optimisticId);
    localSet((state) => {
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
    uploadInit: {
      attachmentId: string;
      uploadUrl: string;
      fields: Record<string, string>;
    },
    ciphertextBlob: Blob,
    fileName: string,
    optimisticAttachmentParams: OptimisticGroupAttachmentParams,
    isRetry: boolean,
    updateProgressFn: (p: number) => void,
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
        updateProgressFn,
        abortSignal
      );
    } catch (err) {
      if (isUploadAbortError(err)) {
        removeOptimisticGroupAttachmentMessage({
          ...optimisticAttachmentParams,
          isRetry,
        });
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
        removeOptimisticGroupAttachmentMessage({
          ...optimisticAttachmentParams,
          isRetry,
        });
        throw err;
      }
      markOptimisticGroupAttachmentError(optimisticAttachmentParams);
      throw err;
    }
  }

  async function completeAttachmentUpload(attachmentId: string): Promise<void> {
    await api.post<void>(`/attachments/${encodeURIComponent(attachmentId)}/complete`);
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
        durationMs:
          durationMs && durationMs > 0 && durationMs <= 120000
            ? Math.round(durationMs)
            : undefined,
        mediaGroupId,
      },
      timestamp: effectiveTimestamp,
      status: "sending",
      isOwn: true,
      rawType: "attachment",
    };

    set((state) => {
      const group =
        state.groups[groupId] ??
        shared.createUnknownGroupChat(groupId, { historyLoaded: true });
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
            lastMessageAt: isRetry ? group.lastMessageAt : effectiveTimestamp,
          },
        },
      };
    });

    const abortController = new AbortController();
    registerUpload(optimisticId, () => abortController.abort());
    setUploadLocalSource(optimisticId, blob);

    const updateProgressFn = (p: number) => updateUploadProgress(optimisticId, p);
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
      updateProgressFn,
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

  async function retryAttachmentUpload(
    groupId: string,
    message: NonNullable<
      ReturnType<GetGroupsState>["groups"][string]
    >["messages"][number]
  ): Promise<void> {
    if (message.type !== "attachment" || !message.attachment) return;
    const localSource = getUploadLocalSource(message.id);
    if (!localSource) return;
    try {
      await uploadAndEncryptGroupAttachment({
        groupId,
        blob: localSource,
        mimeType:
          message.attachment.mimeType ||
          localSource.type ||
          "application/octet-stream",
        fileName:
          message.attachment.fileName ||
          message.content ||
          `attachment-${Date.now()}`,
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
    uploadAndEncryptGroupAttachment,
    retryAttachmentUpload,
  };
}
