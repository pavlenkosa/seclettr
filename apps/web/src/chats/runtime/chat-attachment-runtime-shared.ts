import { decryptAttachment, fromBase64Url } from "@seclettr/crypto";
import { ApiError, api } from "@/lib/api";
import { sanitizeDownloadName } from "@/lib/file-names";
import { isNativePlatform } from "@/lib/native-platform";
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

async function fetchAttachmentCiphertextViaDownloadUrl(
  attachmentId: string
): Promise<{ ciphertext: string; encryptedDigest: string }> {
  const meta = await api.get<{
    downloadUrl: string;
    encryptedDigest: string;
    encryptedSize: number;
  }>(`/attachments/${encodeURIComponent(attachmentId)}/download-url`);

  const response = await fetch(meta.downloadUrl);
  if (!response.ok) {
    throw createChatAttachmentRuntimeError(
      "downloadFailed",
      `Presigned download failed (${response.status})`
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Encode to base64url in 8 KB chunks to avoid stack overflow and slow string concat.
  const CHUNK = 8192;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCodePoint(...bytes.subarray(offset, offset + CHUNK));
  }
  const ciphertext = btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return { ciphertext, encryptedDigest: meta.encryptedDigest };
}

type CiphertextResult = { ciphertext: string; encryptedDigest: string };

async function handleCiphertextFetchError(
  attachmentId: string,
  error: unknown,
  attempt: number
): Promise<CiphertextResult | "retry"> {
  if (error instanceof ApiError && error.status === 413) {
    return fetchAttachmentCiphertextViaDownloadUrl(attachmentId);
  }
  if (!isTransientAttachmentStorageError(error)) {
    throw error;
  }
  if (attempt === ATTACHMENT_STORAGE_RETRY_DELAYS_MS.length) {
    throw createChatAttachmentRuntimeError(
      "storagePending",
      error instanceof Error ? error.message : "ATTACHMENT_STORAGE_PENDING"
    );
  }
  await wait(ATTACHMENT_STORAGE_RETRY_DELAYS_MS[attempt]!);
  return "retry";
}

async function fetchAttachmentCiphertext(attachmentId: string): Promise<CiphertextResult> {
  for (let attempt = 0; attempt <= ATTACHMENT_STORAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await api.get<CiphertextResult>(
        `/attachments/${encodeURIComponent(attachmentId)}/ciphertext`
      );
    } catch (error) {
      const outcome = await handleCiphertextFetchError(attachmentId, error, attempt);
      if (outcome !== "retry") return outcome;
    }
  }
  throw createChatAttachmentRuntimeError("storagePending", "ATTACHMENT_STORAGE_PENDING");
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

async function fetchPlainAttachmentBlob(attachment: AttachmentMessageMeta): Promise<Blob> {
  // If we still have a local blob URL from optimistic sending, use it directly
  if (attachment.localUrl && !attachment.localUrl.startsWith("https://in-memory")) {
    try {
      const resp = await fetch(attachment.localUrl);
      if (resp.ok) return new Blob([await resp.arrayBuffer()], { type: attachment.mimeType });
    } catch {
      // fall through to API fetch
    }
  }

  // Fetch a fresh presigned download URL from the plain attachments API
  const meta = await api.get<{ attachmentId: string; downloadUrl: string }>(
    `/plain/attachments/${encodeURIComponent(attachment.attachmentId)}`
  );

  const response = await fetch(meta.downloadUrl);
  if (!response.ok) {
    throw createChatAttachmentRuntimeError(
      "downloadFailed",
      `Plain attachment download failed (${response.status})`
    );
  }
  return new Blob([await response.arrayBuffer()], { type: attachment.mimeType });
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

  if (attachment.isPlain) {
    return fetchPlainAttachmentBlob(attachment);
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

export async function triggerAttachmentDownload(
  blob: Blob,
  attachment: AttachmentMessageMeta
): Promise<void> {
  const fileName = sanitizeDownloadName(
    attachment.fileName,
    `attachment-${attachment.attachmentId}`
  );

  // On native Android, anchor.click() doesn't trigger a system download.
  // Use the Web Share API instead so the user gets the OS share sheet
  // (Save to Downloads, share to another app, etc.)
  if (isNativePlatform() && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
    } catch (error) {
      // User cancelled share or share failed — fall through to anchor approach
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }

  let url: string | null = null;
  try {
    url = createAttachmentObjectUrl(blob);
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
