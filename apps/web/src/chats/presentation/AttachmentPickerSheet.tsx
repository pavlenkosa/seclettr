/**
 * AttachmentPickerSheet — Telegram-style bottom sheet for choosing
 * how to attach a file: Camera, Gallery, or Document.
 *
 * Only rendered on native platforms (iOS/Android). The web falls back
 * to the hidden <input type="file"> directly, skipping the sheet.
 */
import { useEffect, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./AttachmentPickerSheet.module.css";

// ── Icons ─────────────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="13"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <path
        d="m21 15-5-5L5 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="14 2 14 8 20 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface AttachmentPickerSheetProps {
  readonly isExiting: boolean;
  readonly onCamera: () => void;
  readonly onGallery: () => void;
  readonly onFile: () => void;
  readonly onClose: () => void;
  readonly cameraLabel: string;
  readonly galleryLabel: string;
  readonly fileLabel: string;
  readonly cancelLabel: string;
}

export function AttachmentPickerSheet({
  isExiting,
  onCamera,
  onGallery,
  onFile,
  onClose,
  cameraLabel,
  galleryLabel,
  fileLabel,
  cancelLabel,
}: AttachmentPickerSheetProps) {
  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const animClass = isExiting ? styles.exiting : styles.entering;

  const handleOverlayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div
      className={`${styles.overlay} ${animClass}`}
      onClick={onClose}
      onKeyDown={handleOverlayKeyDown}
      role="presentation"
      tabIndex={-1}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className={`${styles.sheet} ${animClass}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Attach file"
        tabIndex={-1}
      >
        <div className={styles.handle} aria-hidden="true" />

        <div className={styles.grid} role="group">
          <button
            type="button"
            className={styles.item}
            onClick={onCamera}
            aria-label={cameraLabel}
          >
            <span className={`${styles.iconWrap} ${styles.camera}`}>
              <CameraIcon />
            </span>
            <span className={styles.label}>{cameraLabel}</span>
          </button>

          <button
            type="button"
            className={styles.item}
            onClick={onGallery}
            aria-label={galleryLabel}
          >
            <span className={`${styles.iconWrap} ${styles.gallery}`}>
              <GalleryIcon />
            </span>
            <span className={styles.label}>{galleryLabel}</span>
          </button>

          <button
            type="button"
            className={styles.item}
            onClick={onFile}
            aria-label={fileLabel}
          >
            <span className={`${styles.iconWrap} ${styles.file}`}>
              <FileIcon />
            </span>
            <span className={styles.label}>{fileLabel}</span>
          </button>
        </div>

        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onClose}
        >
          {cancelLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}
