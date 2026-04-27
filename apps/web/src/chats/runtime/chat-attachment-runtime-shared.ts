import { decryptAttachment, fromBase64Url } from "@seclettr/crypto";
import { ApiError, api } from "@/lib/api";
import { sanitizeDownloadName } from "@/lib/file-names";
import { getUploadLocalSource } from "@/lib/upload-progress";
import type { AttachmentMessageMeta } from "@/stores/messages";

export type ChatAttachmentErrorCause =
  | "digestMismatch"
  | "decryptFailed"
  | "storagePending"
  | "playFailed"
  | "downloadFailed";

type ChatAttachmentRuntimeError = Error & {
  attachmentErrorCause?: ChatAttachmentErrorCause;
};

export interface ChatAttachmentMediaPlaybackOptions {
  mediaKey: string;
  activeMediaKey: string | null;
  onActiveMediaChange: (key: string | null) => void;
}

interface FetchAndDecryptAttachmentBlobOptions {
  messageId?: string;
}

const ATTACHMENT_STORAGE_RETRY_DELAYS_MS = [180, 360, 720];

function toSafeBlobPart(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientAttachmentStorageError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;

  if (error.status === 500) {
    return true;
  }

  if (error.status !== 404 && error.status !== 409 && error.status !== 425) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("attachment object not found") ||
    message.includes("attachment object not ready") ||
    message.includes("attachment not ready")
  );
}

async function fetchAttachmentCiphertext(
  attachmentId: string
): Promise<{
  ciphertext: string;
  encryptedDigest: string;
}> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= ATTACHMENT_STORAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await api.get<{
        ciphertext: string;
        encryptedDigest: string;
      }>(`/attachments/${encodeURIComponent(attachmentId)}/ciphertext`);
    } catch (error) {
      if (!isTransientAttachmentStorageError(error)) {
        throw error;
      }
      lastError = error;
      if (attempt === ATTACHMENT_STORAGE_RETRY_DELAYS_MS.length) {
        throw createChatAttachmentRuntimeError(
          "storagePending",
          error instanceof Error ? error.message : "ATTACHMENT_STORAGE_PENDING"
        );
      }
      await wait(ATTACHMENT_STORAGE_RETRY_DELAYS_MS[attempt]!);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : createChatAttachmentRuntimeError("storagePending", "ATTACHMENT_STORAGE_PENDING");
}

function createChatAttachmentRuntimeError(
  attachmentErrorCause: ChatAttachmentErrorCause,
  message: string = attachmentErrorCause
): ChatAttachmentRuntimeError {
  const error = new Error(message) as ChatAttachmentRuntimeError;
  error.attachmentErrorCause = attachmentErrorCause;
  return error;
}

export function resolveChatAttachmentErrorCause(
  error: unknown,
  fallback: ChatAttachmentErrorCause
): ChatAttachmentErrorCause {
  if (
    error instanceof Error &&
    "attachmentErrorCause" in error &&
    typeof (error as ChatAttachmentRuntimeError).attachmentErrorCause === "string"
  ) {
    return (error as ChatAttachmentRuntimeError).attachmentErrorCause ?? fallback;
  }

  if (error instanceof Error && error.message === "ATTACHMENT_DIGEST_MISMATCH") {
    return "digestMismatch";
  }

  if (error instanceof Error && error.message === "ATTACHMENT_STORAGE_PENDING") {
    return "storagePending";
  }

  return fallback;
}

export async function fetchAndDecryptAttachmentBlob(
  attachment: AttachmentMessageMeta,
  options: FetchAndDecryptAttachmentBlobOptions = {}
): Promise<Blob> {
  if (options.messageId) {
    const localSourceBlob = getUploadLocalSource(options.messageId);
    if (localSourceBlob) {
      return localSourceBlob;
    }
  }

  const signed = await fetchAttachmentCiphertext(attachment.attachmentId);

  if (signed.encryptedDigest !== attachment.digest) {
    throw createChatAttachmentRuntimeError(
      "digestMismatch",
      "ATTACHMENT_DIGEST_MISMATCH"
    );
  }

  try {
    const decrypted = await decryptAttachment(
      fromBase64Url(signed.ciphertext),
      fromBase64Url(attachment.key),
      fromBase64Url(attachment.digest)
    );

    return new Blob([toSafeBlobPart(Uint8Array.from(decrypted))], {
      type: attachment.mimeType,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "attachmentErrorCause" in error &&
      (error as ChatAttachmentRuntimeError).attachmentErrorCause === "storagePending"
    ) {
      throw error;
    }
    throw createChatAttachmentRuntimeError(
      "decryptFailed",
      error instanceof Error ? error.message : "decryptFailed"
    );
  }
}

export function createAttachmentObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokeAttachmentObjectUrl(url: string | null): void {
  if (!url) return;
  URL.revokeObjectURL(url);
}

export function triggerAttachmentDownload(
  blob: Blob,
  attachment: AttachmentMessageMeta
): void {
  let url: string | null = null;

  try {
    url = createAttachmentObjectUrl(blob);
    const fileName = sanitizeDownloadName(
      attachment.fileName,
      `attachment-${attachment.attachmentId}`
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener noreferrer";
    anchor.click();
    setTimeout(() => revokeAttachmentObjectUrl(url), 1000);
  } catch (error) {
    revokeAttachmentObjectUrl(url);
    throw createChatAttachmentRuntimeError(
      "downloadFailed",
      error instanceof Error ? error.message : "downloadFailed"
    );
  }
}
