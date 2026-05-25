import { useEffect, useRef, useState } from "react";
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

/** Duration the upload overlay stays visible while fading out after completion. */
const UPLOAD_EXIT_MS = 220;

interface UseExitingUploadProgressResult {
  /** Raw progress — null the moment upload is unregistered. Use for logic gates (autoDecrypt etc). */
  progress: number | null;
  /** Display progress — stays non-null for UPLOAD_EXIT_MS after upload finishes so the overlay can fade. */
  displayProgress: number | null;
  /** True during the fade-out window so CSS can apply the exit transition. */
  isExiting: boolean;
  cancel: () => void;
}

/**
 * Like `useUploadProgress` but adds a short exit window so upload overlays can
 * animate out instead of disappearing in a single frame.
 *
 * `displayProgress` stays at its last value for UPLOAD_EXIT_MS after the upload
 * completes, with `isExiting=true` to signal the CSS fade. Once the timer fires,
 * `displayProgress` drops to null and the overlay is removed from the DOM.
 *
 * `progress` is always the real value — use it for autoDecrypt / logic gates so
 * that content loading starts immediately on upload completion, not after the fade.
 */
export function useExitingUploadProgress(messageId: string): UseExitingUploadProgressResult {
  const { progress, cancel } = useUploadProgress(messageId);
  const [displayProgress, setDisplayProgress] = useState<number | null>(
    () => getUploadProgress(messageId)
  );
  const [isExiting, setIsExiting] = useState(false);
  const prevRef = useRef(progress);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = progress;

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (progress !== null) {
      setDisplayProgress(progress);
      setIsExiting(false);
    } else if (prev !== null) {
      // Upload just completed — start the CSS exit animation window.
      setIsExiting(true);
      timerRef.current = setTimeout(() => {
        setDisplayProgress(null);
        setIsExiting(false);
        timerRef.current = null;
      }, UPLOAD_EXIT_MS);
    }
  }, [progress]);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  return { progress, displayProgress, isExiting, cancel };
}
