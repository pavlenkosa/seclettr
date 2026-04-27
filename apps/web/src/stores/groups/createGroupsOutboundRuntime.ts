import {
  MESSAGE_PROTOCOL_VERSION,
  PlaintextAttachmentMessageSchema,
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
} from "@/lib/group-sender-key";
import {
  ensureSenderKeyDistributedToGroupMembers,
  formatSenderLabel,
} from "./group-helpers";
import type {
  GetGroupsState,
  GroupChatMessage,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";

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

async function sendAttachmentEnvelopeWithRetry(
  storageKey: CryptoKey,
  groupId: string,
  myDeviceId: string,
  attachmentPayload: ReturnType<typeof PlaintextAttachmentMessageSchema.parse>,
  attachmentId: string
): Promise<SendGroupMessageResponse> {
  const sendEnvelope = async () => {
    const encryptedEnvelope = await encryptGroupAttachmentEnvelope(
      storageKey,
      groupId,
      myDeviceId,
      attachmentPayload
    );
    return api.post<SendGroupMessageResponse>(`/groups/${encodeURIComponent(groupId)}/messages`, {
      version: MESSAGE_PROTOCOL_VERSION,
      clientMessageId: crypto.randomUUID(),
      groupId,
      distributionId: encryptedEnvelope.distributionId,
      chainId: encryptedEnvelope.chainId,
      messageId: encryptedEnvelope.messageId,
      ciphertext: encryptedEnvelope.ciphertext,
      signature: encryptedEnvelope.signature,
      type: "attachment" as const,
      attachmentId,
    });
  };

  try {
    return await sendEnvelope();
  } catch (error) {
    if (!isSenderKeyConflictError(error)) {
      throw error;
    }
    return sendEnvelope();
  }
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
  durationMs?: number;
  mediaGroupId?: string;
}

export function createGroupsOutboundRuntime({
  set,
  get,
  shared,
  sendSenderKeyDistribution,
}: CreateGroupsOutboundRuntimeOptions) {
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

  async function postEncryptedGroupText(
    groupId: string,
    content: string,
    reply?: { id: string; snippet: string }
  ): Promise<SendGroupMessageResponse> {
    const myDeviceId = shared.getMyDeviceId();
    const storageKey = shared.getStorageKey();
    if (!myDeviceId || !storageKey) {
      throw new Error("Not authenticated");
    }

    const sendWithEnvelope = async () => {
      const encryptedEnvelope = await encryptGroupTextEnvelope(
        storageKey,
        groupId,
        myDeviceId,
        content,
        reply
      );
      return api.post<SendGroupMessageResponse>(`/groups/${encodeURIComponent(groupId)}/messages`, {
        version: MESSAGE_PROTOCOL_VERSION,
        clientMessageId: crypto.randomUUID(),
        groupId,
        distributionId: encryptedEnvelope.distributionId,
        chainId: encryptedEnvelope.chainId,
        messageId: encryptedEnvelope.messageId,
        ciphertext: encryptedEnvelope.ciphertext,
        signature: encryptedEnvelope.signature,
        type: "text" as const,
      });
    };

    try {
      return await sendWithEnvelope();
    } catch (error) {
      if (!isSenderKeyConflictError(error)) {
        throw error;
      }
      return sendWithEnvelope();
    }
  }

  async function uploadAndEncryptGroupAttachment({
    groupId,
    blob,
    mimeType,
    fileName,
    kind,
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
    const optimisticId = replaceMessageId ?? `local-${crypto.randomUUID()}`;
    const effectiveTimestamp = optimisticTimestamp ?? Date.now();
    const optimisticMessage: GroupChatMessage = {
      id: optimisticId,
      senderDeviceId: myDeviceId,
      senderLabel: formatSenderLabel(myDeviceId, true),
      content: fileName,
      type: "attachment",
      attachment: {
        attachmentId: uploadInit.attachmentId,
        key: toBase64Url(encryptedAttachment.key),
        digest: toBase64Url(encryptedAttachment.digest),
        mimeType,
        fileName,
        size: blob.size,
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

    unregisterUpload(optimisticId);

    const attachmentPayload = PlaintextAttachmentMessageSchema.parse({
      key: toBase64Url(encryptedAttachment.key),
      digest: toBase64Url(encryptedAttachment.digest),
      attachmentId: uploadInit.attachmentId,
      mimeType,
      fileName,
      size: blob.size,
      kind,
      durationMs: optimisticMessage.attachment?.durationMs,
      mediaGroupId,
    });

    await get().refreshGroup(groupId, { refreshDeviceLabels: false });
    const members = get().groups[groupId]?.members ?? [];
    await ensureGroupSenderKeys(groupId, members);

    try {
      const sentMessage = await sendAttachmentEnvelopeWithRetry(
        storageKey,
        groupId,
        myDeviceId,
        attachmentPayload,
        uploadInit.attachmentId
      );

      set((state) => {
        const group = state.groups[groupId];
        if (!group) return {};
        const timestamp = parseServerMessageTimestamp(
          sentMessage.createdAt,
          optimisticMessage.timestamp
        );
        const nextMessages = group.messages
          .map((msg) =>
            msg.id === optimisticId
              ? {
                  ...msg,
                  id: sentMessage.serverMessageId,
                  timestamp,
                  status: "sent" as const,
                }
              : msg
          )
          .sort((left, right) => left.timestamp - right.timestamp);
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...group,
              messages: nextMessages,
              lastMessageAt: nextMessages.at(-1)?.timestamp ?? group.lastMessageAt,
            },
          },
        };
      });

      clearUploadLocalSource(optimisticId);
    } catch (error) {
      markOptimisticGroupAttachmentError(optimisticAttachmentParams);
      throw error;
    }
  }

  return {
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

      const optimisticId = `local-${crypto.randomUUID()}`;
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
        const sentMessage = await postEncryptedGroupText(groupId, trimmed, reply);

        set((state) => {
          const group = state.groups[groupId];
          if (!group) return {};
          const timestamp = parseServerMessageTimestamp(
            sentMessage.createdAt,
            optimisticTimestamp
          );
          const nextMessages = group.messages
            .map((message) =>
              message.id === optimisticId
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
              [groupId]: {
                ...group,
                messages: nextMessages,
                lastMessageAt: nextMessages.at(-1)?.timestamp ?? group.lastMessageAt,
              },
            },
          };
        });
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

      if (!shared.getMyDeviceId() || !shared.getMyUserId() || !shared.getStorageKey()) {
        return;
      }

      if (message.rawType === "attachment" && message.type === "attachment") {
        const localSource = getUploadLocalSource(message.id);
        if (!localSource || !message.attachment) return;

        try {
          await uploadAndEncryptGroupAttachment({
            groupId,
            blob: localSource,
            mimeType: message.attachment.mimeType || localSource.type || "application/octet-stream",
            fileName: message.attachment.fileName || message.content || `attachment-${Date.now()}`,
            kind: message.attachment.kind ?? "file",
            durationMs: message.attachment.durationMs,
            mediaGroupId: message.attachment.mediaGroupId,
            replaceMessageId: message.id,
            optimisticTimestamp: message.timestamp,
          });
        } catch {
          // uploadAndEncryptGroupAttachment already restores the message to error.
        }
        return;
      }

      if (message.rawType !== "text" || message.type === "attachment") return;

      const retryReply = message.replyTo
        ? {
            id: message.replyTo.id,
            snippet: message.replyTo.content,
          }
        : undefined;

      set((state) => {
        const currentGroup = state.groups[groupId];
        if (!currentGroup) return {};
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...currentGroup,
              messages: currentGroup.messages.map((entry) =>
                entry.id === messageId
                  ? { ...entry, status: "sending" as const }
                  : entry
              ),
            },
          },
        };
      });

      try {
        await get().refreshGroup(groupId, { refreshDeviceLabels: false });
        const members = get().groups[groupId]?.members ?? [];
        await ensureGroupSenderKeys(groupId, members);
        const sentMessage = await postEncryptedGroupText(
          groupId,
          message.content,
          retryReply
        );
        set((state) => {
          const currentGroup = state.groups[groupId];
          if (!currentGroup) return {};
          const timestamp = parseServerMessageTimestamp(
            sentMessage.createdAt,
            message.timestamp
          );
          const nextMessages = currentGroup.messages
            .map((entry) =>
              entry.id === messageId
                ? {
                    ...entry,
                    id: sentMessage.serverMessageId,
                    timestamp,
                    status: "sent" as const,
                  }
                : entry
            )
            .sort((left, right) => left.timestamp - right.timestamp);
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...currentGroup,
                messages: nextMessages,
                lastMessageAt:
                  nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
              },
            },
          };
        });
      } catch {
        set((state) => {
          const currentGroup = state.groups[groupId];
          if (!currentGroup) return {};
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...currentGroup,
                messages: currentGroup.messages.map((entry) =>
                  entry.id === messageId
                    ? { ...entry, status: "error" as const }
                    : entry
                ),
              },
            },
          };
        });
      }
    },

    sendGroupFileAttachment: async (groupId: string, file: File, mediaGroupId?: string) => {
      await uploadAndEncryptGroupAttachment({
        groupId,
        blob: file,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || `attachment-${Date.now()}`,
        kind: "file",
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
