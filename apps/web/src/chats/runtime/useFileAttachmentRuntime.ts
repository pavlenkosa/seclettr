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
import {
  getPlainAttachmentBlob,
  setPlainAttachmentBlob,
} from "./plain-attachment-blob-cache";

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
  // Eager plain hit: if the same attachment was fetched anywhere in this tab,
  // the blob URL is still alive in the module cache. Use it as the initial
  // previewUrl so a re-mounted row (scroll out + back in, navigation) shows
  // the image immediately instead of flashing the placeholder.
  const initialCachedUrl = attachment?.isPlain && attachment.attachmentId
    ? getPlainAttachmentBlob(attachment.attachmentId)?.objectUrl ?? null
    : null;

  const [loading, setLoading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialCachedUrl);
  const [errorCause, setErrorCause] = useState<ChatAttachmentErrorCause | null>(null);

  // Keep a cached blob so download can reuse what was already decrypted for preview.
  const cachedBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(initialCachedUrl);
  // Plain blob URLs come from the module-level cache and must NOT be revoked
  // on unmount — other rows / lightboxes may still be using them.
  const previewUrlOwnedRef = useRef<boolean>(false);

  useEffect(() => {
    // Cleanup blob URL and cached blob when attachment changes or on unmount.
    return () => {
      if (previewUrlRef.current && previewUrlOwnedRef.current) {
        revokeAttachmentObjectUrl(previewUrlRef.current);
      }
      previewUrlRef.current = null;
      previewUrlOwnedRef.current = false;
      cachedBlobRef.current = null;
    };
  // Intentionally depend only on attachmentId, not on the full attachment object.
  // Adding `attachment` would re-run the cleanup on every re-render (the object
  // is recreated each time), revoking the blob URL while it's still in use.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.attachmentId]);

  // Reset UI state when attachment identity changes — but seed previewUrl
  // from the plain blob cache so a known-cached attachment stays visible.
  useEffect(() => {
    setDownloaded(false);
    setErrorCause(null);
    const cached = attachment?.isPlain && attachment.attachmentId
      ? getPlainAttachmentBlob(attachment.attachmentId)?.objectUrl ?? null
      : null;
    previewUrlRef.current = cached;
    previewUrlOwnedRef.current = false;
    setPreviewUrl(cached);
  }, [attachment?.attachmentId, attachment?.isPlain]);

  // For plain attachments, the localUrl is the preview directly — no decryption
  // needed. Surface it eagerly so the UI doesn't show a "tap to decrypt" lock.
  useEffect(() => {
    if (attachment?.isPlain && attachment.localUrl && !previewUrlRef.current) {
      previewUrlRef.current = attachment.localUrl;
      previewUrlOwnedRef.current = false; // localUrl is owned by the optimistic store
      setPreviewUrl(attachment.localUrl);
    }
  }, [attachment?.isPlain, attachment?.localUrl]);

  const decryptAndPreview = useCallback(async (): Promise<string | null> => {
    if (!attachment) return null;
    // Return cached URL if already loaded.
    if (previewUrlRef.current) return previewUrlRef.current;
    if (loading) return null;

    // For plain attachments with a local blob URL, use it directly without fetching
    if (attachment.isPlain && attachment.localUrl) {
      previewUrlRef.current = attachment.localUrl;
      previewUrlOwnedRef.current = false;
      setPreviewUrl(attachment.localUrl);
      return attachment.localUrl;
    }

    // Plain module cache check (covers the "scrolled away then back" case).
    if (attachment.isPlain && attachment.attachmentId) {
      const cached = getPlainAttachmentBlob(attachment.attachmentId);
      if (cached) {
        previewUrlRef.current = cached.objectUrl;
        previewUrlOwnedRef.current = false;
        setPreviewUrl(cached.objectUrl);
        return cached.objectUrl;
      }
    }

    setLoading(true);
    setErrorCause(null);

    try {
      const blob =
        cachedBlobRef.current ??
        await fetchAndDecryptAttachmentBlob(attachment, { messageId });
      cachedBlobRef.current = blob;
      let url: string;
      if (attachment.isPlain && attachment.attachmentId) {
        // Plain blobs go into the shared session cache — other rows reuse them.
        url = setPlainAttachmentBlob(attachment.attachmentId, blob).objectUrl;
        previewUrlOwnedRef.current = false;
      } else {
        url = createAttachmentObjectUrl(blob);
        previewUrlOwnedRef.current = true;
      }
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
      await triggerAttachmentDownload(blob, attachment);
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
