import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger.js";
import type { AttachmentMessageMeta } from "@/stores/messages";
import {
  createAttachmentObjectUrl,
  fetchAndDecryptAttachmentBlob,
  resolveChatAttachmentErrorCause,
  revokeAttachmentObjectUrl,
  triggerAttachmentDownload,
  type ChatAttachmentErrorCause,
} from "./chat-attachment-runtime-shared";

interface UseFileAttachmentRuntimeOptions {
  attachment?: AttachmentMessageMeta;
  messageId: string;
}

interface UseFileAttachmentRuntimeResult {
  loading: boolean;
  downloaded: boolean;
  previewUrl: string | null;
  errorCause: ChatAttachmentErrorCause | null;
  /** Decrypt and return a blob URL for in-app preview. URL is revoked on unmount / attachment change. */
  decryptAndPreview: () => Promise<string | null>;
  /** Decrypt (or reuse cached blob) and trigger a browser download. */
  decryptAndDownload: () => Promise<void>;
}

export function useFileAttachmentRuntime({
  attachment,
  messageId,
}: UseFileAttachmentRuntimeOptions): UseFileAttachmentRuntimeResult {
  const [loading, setLoading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<ChatAttachmentErrorCause | null>(null);

  // Keep a cached blob so download can reuse what was already decrypted for preview.
  const cachedBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Cleanup blob URL and cached blob when attachment changes or on unmount.
    return () => {
      if (previewUrlRef.current) {
        revokeAttachmentObjectUrl(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      cachedBlobRef.current = null;
    };
  // Intentionally depend only on attachmentId, not on the full attachment object.
  // Adding `attachment` would re-run the cleanup on every re-render (the object
  // is recreated each time), revoking the blob URL while it's still in use.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.attachmentId]);

  // Reset UI state when attachment identity changes.
  useEffect(() => {
    setDownloaded(false);
    setErrorCause(null);
    setPreviewUrl(null);
  }, [attachment?.attachmentId]);

  const decryptAndPreview = useCallback(async (): Promise<string | null> => {
    if (!attachment) return null;
    // Return cached URL if already loaded.
    if (previewUrlRef.current) return previewUrlRef.current;
    if (loading) return null;

    // For plain attachments with a local blob URL, use it directly without fetching
    if (attachment.isPlain && attachment.localUrl) {
      previewUrlRef.current = attachment.localUrl;
      setPreviewUrl(attachment.localUrl);
      return attachment.localUrl;
    }

    setLoading(true);
    setErrorCause(null);

    try {
      const blob =
        cachedBlobRef.current ??
        await fetchAndDecryptAttachmentBlob(attachment, { messageId });
      cachedBlobRef.current = blob;
      const url = createAttachmentObjectUrl(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      return url;
    } catch (error) {
      setErrorCause(resolveChatAttachmentErrorCause(error, "decryptFailed"));
      logger.error("[MSG] media preview decrypt failed", messageId, error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [attachment, loading, messageId]);

  const decryptAndDownload = useCallback(async () => {
    if (loading || !attachment) return;

    setLoading(true);
    setErrorCause(null);

    try {
      const blob =
        cachedBlobRef.current ??
        await fetchAndDecryptAttachmentBlob(attachment, { messageId });
      cachedBlobRef.current = blob;
      triggerAttachmentDownload(blob, attachment);
      setDownloaded(true);
    } catch (error) {
      setErrorCause(resolveChatAttachmentErrorCause(error, "decryptFailed"));
      logger.error("[MSG] file decrypt failed", messageId, error);
    } finally {
      setLoading(false);
    }
  }, [attachment, loading, messageId]);

  return {
    decryptAndPreview,
    decryptAndDownload,
    previewUrl,
    downloaded,
    errorCause,
    loading,
  };
}
