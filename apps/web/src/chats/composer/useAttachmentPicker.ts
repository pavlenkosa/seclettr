/**
 * useAttachmentPicker — manages the attachment source selection sheet.
 *
 * On native platforms (iOS / Android) the attachment button shows a bottom
 * sheet with Camera, Gallery, and File options.
 * On web the hidden <input type="file"> is clicked directly — no sheet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isNativePlatform } from "@/lib/native-platform";
import { capturePhoto, pickPhotos } from "@/lib/native-camera";
import { pickFiles } from "@/lib/native-file-picker";

const SHEET_EXIT_MS = 180;

export interface UseAttachmentPickerResult {
  /** Show the attachment source sheet (native only). */
  openPicker: () => void;
  /** Whether the sheet is currently visible. */
  isSheetOpen: boolean;
  /** Whether the sheet is playing its exit animation. */
  isSheetExiting: boolean;
  /** Close the sheet (with exit animation). */
  closeSheet: () => void;
  /** Called when the user picks the Camera option. */
  onCamera: () => void;
  /** Called when the user picks the Gallery option. */
  onGallery: () => void;
  /** Called when the user picks the File option. */
  onFile: () => void;
}

interface Options {
  /** Called with the resolved files after the user finishes picking. */
  onFilesReady: (files: File[]) => void;
  /** Ref to the hidden <input type="file"> used on web. */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useAttachmentPicker({
  onFilesReady,
  fileInputRef,
}: Options): UseAttachmentPickerResult {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSheetExiting, setIsSheetExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  const closeSheet = useCallback(() => {
    setIsSheetExiting(true);
    exitTimerRef.current = setTimeout(() => {
      setIsSheetOpen(false);
      setIsSheetExiting(false);
    }, SHEET_EXIT_MS);
  }, []);

  const openPicker = useCallback(() => {
    // On web — just click the hidden input directly.
    if (!isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }

    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setIsSheetExiting(false);
    setIsSheetOpen(true);
  }, [fileInputRef]);

  const closeAndRun = useCallback((action: () => Promise<void>) => {
    closeSheet();
    // Small delay so the sheet is visually dismissed before the OS picker appears.
    setTimeout(() => { void action(); }, SHEET_EXIT_MS + 40);
  }, [closeSheet]);

  const onCamera = useCallback(() => {
    closeAndRun(async () => {
      const file = await capturePhoto();
      if (file) onFilesReady([file]);
    });
  }, [closeAndRun, onFilesReady]);

  const onGallery = useCallback(() => {
    closeAndRun(async () => {
      const files = await pickPhotos(10);
      if (files.length > 0) onFilesReady(files);
    });
  }, [closeAndRun, onFilesReady]);

  const onFile = useCallback(() => {
    closeAndRun(async () => {
      const picked = await pickFiles({ multiple: true });
      if (picked.length > 0) {
        // Convert PickedFile → File
        const files = picked.map(
          (pf) => new File([pf.blob], pf.name, { type: pf.mimeType })
        );
        onFilesReady(files);
      }
    });
  }, [closeAndRun, onFilesReady]);

  return {
    openPicker,
    isSheetOpen,
    isSheetExiting,
    closeSheet,
    onCamera,
    onGallery,
    onFile,
  };
}
