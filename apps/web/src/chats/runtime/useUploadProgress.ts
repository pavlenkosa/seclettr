import { useEffect, useState } from "react";
import {
  getUploadProgress,
  subscribeUploadProgress,
  cancelUpload,
} from "@/lib/upload-progress";

interface UseUploadProgressResult {
  /** 0-100 while uploading, null when not in the registry (not uploading). */
  progress: number | null;
  cancel: () => void;
}

export function useUploadProgress(messageId: string): UseUploadProgressResult {
  const [progress, setProgress] = useState<number | null>(() =>
    getUploadProgress(messageId)
  );

  useEffect(() => {
    const initial = getUploadProgress(messageId);
    setProgress(initial);
    if (initial === null) return;
    return subscribeUploadProgress(messageId, setProgress);
  }, [messageId]);

  return {
    progress,
    cancel: () => cancelUpload(messageId),
  };
}
