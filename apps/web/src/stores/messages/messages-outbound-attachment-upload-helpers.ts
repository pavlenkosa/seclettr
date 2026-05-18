import { ApiError, api } from "@/lib/api";
import {
  clearUploadLocalSource,
  unregisterUpload,
  updateUploadProgress,
  uploadFormDataWithProgress,
} from "@/lib/upload-progress";
import { persistConversations } from "./conversation-persistence";
import type {
  Conversation,
  MessagesSendEncryptedAttachmentParams,
  SetMessagesState,
} from "./messages-store-runtime-types";

/**
 * Owns attachment-upload support helpers for encrypted direct outbound runtime:
 * optimistic attachment cleanup/error state, multipart form-data creation,
 * upload progress + fallback upload flow, and upload completion request.
 * Does not own recipient-device lookup, ratchet/session advancement, queue
 * persistence, or final direct-message delivery orchestration.
 */

export interface AttachmentUploadInitResponse {
  attachmentId: string;
  uploadUrl: string;
  fields: Record<string, string>;
}

interface OptimisticAttachmentStateParams {
  set: SetMessagesState;
  recipientUserId: string;
  clientMessageId: string;
}

export function clampDurationMs(
  durationMs: number | undefined
): number | undefined {
  if (!durationMs || !Number.isFinite(durationMs)) return undefined;
  return Math.max(1, Math.min(120_000, Math.round(durationMs)));
}

export function toSafeBlobChunk(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

export function isUploadAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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

export async function markOptimisticAttachmentError({
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

export async function uploadEncryptedAttachmentCiphertext(params: {
  set: SetMessagesState;
  attachmentParams: MessagesSendEncryptedAttachmentParams;
  uploadInit: AttachmentUploadInitResponse;
  ciphertextBlob: Blob;
  clientMessageId: string;
  abortController: AbortController;
}): Promise<void> {
  const {
    set,
    attachmentParams,
    uploadInit,
    ciphertextBlob,
    clientMessageId,
    abortController,
  } = params;
  const optimisticStateParams = {
    set,
    recipientUserId: attachmentParams.recipientUserId,
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
        fileName: attachmentParams.fallbackUploadFileName,
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

export async function completeAttachmentUpload(
  attachmentId: string
): Promise<void> {
  await api.post<void>(
    `/attachments/${encodeURIComponent(attachmentId)}/complete`
  );
}
