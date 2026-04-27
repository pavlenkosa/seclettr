import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { compressImageFile, isCompressibleImage } from "./compressImage";

export type SendQuality = "compressed" | "original";

export interface PendingFile {
  /** Stable per-session id for list keys and removal. */
  id: string;
  file: File;
  /** Object URL for image/video preview — revoked when dialog closes. */
  previewUrl: string | null;
  isImage: boolean;
  isVideo: boolean;
  /** Can be re-encoded by the browser. */
  canCompress: boolean;
  /** Original file size in bytes. */
  size: number;
  /** Compressed File — null while being built, same as `file` if compression gained nothing. */
  compressed: File | null;
}

export interface UseMediaSendDialogResult {
  isOpen: boolean;
  pendingFiles: PendingFile[];
  caption: string;
  quality: SendQuality;
  isSending: boolean;
  /** Total original bytes across all pending files. */
  totalOriginalSize: number;
  /** Total bytes after compression — null while still estimating. */
  totalCompressedSize: number | null;
  /** At least one file supports compression. */
  hasCompressible: boolean;
  openDialog: (files: File[]) => void;
  removeFile: (id: string) => void;
  setCaption: (caption: string) => void;
  setQuality: (quality: SendQuality) => void;
  confirmSend: () => Promise<void>;
  closeDialog: () => void;
}

interface Options {
  /** Called with the final (possibly compressed) files and an optional caption. */
  onSendFiles: (files: File[], caption?: string) => Promise<void>;
}

const DIALOG_CLOSE_ANIMATION_MS = 220;

function buildPendingFile(file: File): PendingFile {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const canCompress = isCompressibleImage(file);

  let previewUrl: string | null = null;
  if (isImage || isVideo) {
    try {
      previewUrl = URL.createObjectURL(file);
    } catch { /* ignore */ }
  }

  return {
    id: crypto.randomUUID(),
    file,
    previewUrl,
    isImage,
    isVideo,
    canCompress,
    size: file.size,
    compressed: null,
  };
}

function updatePendingCompressedFile(
  pendingFiles: PendingFile[],
  fileId: string,
  compressed: File
): PendingFile[] {
  return pendingFiles.map((pendingFile) =>
    pendingFile.id === fileId ? { ...pendingFile, compressed } : pendingFile
  );
}

function markPendingCompressionFallback(
  pendingFiles: PendingFile[],
  fileId: string
): PendingFile[] {
  return pendingFiles.map((pendingFile) =>
    pendingFile.id === fileId
      ? { ...pendingFile, compressed: pendingFile.file }
      : pendingFile
  );
}

function startPendingFileCompression(
  pendingFile: PendingFile,
  signal: AbortSignal,
  setPendingFiles: Dispatch<SetStateAction<PendingFile[]>>
): void {
  compressImageFile(pendingFile.file).then((compressed) => {
    if (signal.aborted) return;
    setPendingFiles((current) =>
      updatePendingCompressedFile(current, pendingFile.id, compressed)
    );
  }).catch(() => {
    // Compression failed — use original as fallback.
    if (signal.aborted) return;
    setPendingFiles((current) =>
      markPendingCompressionFallback(current, pendingFile.id)
    );
  });
}

export function useMediaSendDialog({ onSendFiles }: Options): UseMediaSendDialogResult {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [caption, setCaption] = useState("");
  const [quality, setQuality] = useState<SendQuality>("compressed");
  const [isSending, setIsSending] = useState(false);

  // Track outstanding compression tasks so we can cancel on dialog close.
  const compressionAbortRef = useRef<AbortController | null>(null);
  const pendingFilesRef = useRef<PendingFile[]>([]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  const revokeAllUrls = useCallback((files: PendingFile[]) => {
    for (const f of files) {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    }
  }, []);

  const closeDialog = useCallback(() => {
    compressionAbortRef.current?.abort();
    compressionAbortRef.current = null;
    setPendingFiles((prev) => {
      revokeAllUrls(prev);
      return [];
    });
    setCaption("");
    setQuality("compressed");
    setIsSending(false);
    setIsOpen(false);
  }, [revokeAllUrls]);

  const openDialog = useCallback((files: File[]) => {
    if (!files.length) return;
    compressionAbortRef.current?.abort();
    compressionAbortRef.current = null;

    const pending = files.map(buildPendingFile);
    setPendingFiles((prev) => {
      revokeAllUrls(prev);
      return pending;
    });
    setCaption("");
    setIsSending(false);
    setIsOpen(true);

    // Kick off background compression for compressible images.
    const controller = new AbortController();
    compressionAbortRef.current = controller;

    const { signal } = controller;
    for (const pf of pending) {
      if (!pf.canCompress) continue;
      startPendingFileCompression(pf, signal, setPendingFiles);
    }
  }, [revokeAllUrls]);

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      const next = prev.filter((p) => p.id !== id);
      // Auto-close if list becomes empty.
      if (!next.length) {
        compressionAbortRef.current?.abort();
        compressionAbortRef.current = null;
        setIsOpen(false);
        setCaption("");
      }
      return next;
    });
  }, []);

  const confirmSend = useCallback(async () => {
    if (!pendingFiles.length || isSending) return;
    const resolvedFiles = pendingFiles.map((pf) => {
      if (quality === "compressed" && pf.canCompress && pf.compressed) {
        return pf.compressed;
      }
      return pf.file;
    });
    const trimmedCaption = caption.trim() || undefined;

    setIsSending(true);
    // Trigger closing animation first so upload starts only after the modal
    // visibly leaves the screen.
    setIsOpen(false);

    try {
      await new Promise((resolve) => setTimeout(resolve, DIALOG_CLOSE_ANIMATION_MS));
      await onSendFiles(resolvedFiles, trimmedCaption);
      // Close only after successful send (errors handled by onSendFiles/composer).
      closeDialog();
    } catch {
      // Restore the dialog with the same selection so the user can retry.
      setIsOpen(true);
      setIsSending(false);
    }
  }, [pendingFiles, isSending, quality, caption, onSendFiles, closeDialog]);

  // Cleanup object URLs when the component unmounts.
  useEffect(() => {
    return () => {
      compressionAbortRef.current?.abort();
      compressionAbortRef.current = null;
      revokeAllUrls(pendingFilesRef.current);
    };
  }, [revokeAllUrls]);

  // Derived values
  const totalOriginalSize = pendingFiles.reduce((s, f) => s + f.size, 0);

  const allCompressionsReady = pendingFiles
    .filter((f) => f.canCompress)
    .every((f) => f.compressed !== null);

  const totalCompressedSize = allCompressionsReady
    ? pendingFiles.reduce((s, f) => {
        if (f.canCompress && f.compressed) return s + f.compressed.size;
        return s + f.size;
      }, 0)
    : null;

  const hasCompressible = pendingFiles.some((f) => f.canCompress);

  return {
    isOpen,
    pendingFiles,
    caption,
    quality,
    isSending,
    totalOriginalSize,
    totalCompressedSize,
    hasCompressible,
    openDialog,
    removeFile,
    setCaption,
    setQuality,
    confirmSend,
    closeDialog,
  };
}
