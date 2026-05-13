import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";
import { PillButton } from "@/components/ui";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import { formatBytes } from "../composer/compressImage";
import type { PendingFile, SendQuality, UseMediaSendDialogResult } from "../composer/useMediaSendDialog";
import styles from "./MediaSendDialog.module.css";

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="14 2 14 8 20 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 9l5-3v12l-5-3V9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.spinner}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 22" />
    </svg>
  );
}

// ─── File thumbnail ───────────────────────────────────────────────────────────

function FileThumbnail({
  pf,
  onRemove,
  removeLabel,
}: {
  readonly pf: PendingFile;
  readonly onRemove: () => void;
  readonly removeLabel: string;
}) {
  if (pf.isImage && pf.previewUrl) {
    return (
      <div className={styles.thumb}>
        <img src={pf.previewUrl} alt={pf.file.name} className={styles.thumbImg} draggable={false} />
        <button
          type="button"
          className={styles.thumbRemove}
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  if (pf.isVideo && pf.previewUrl) {
    return (
      <div className={styles.thumb}>
        <video
          src={pf.previewUrl}
          className={styles.thumbImg}
          muted
          playsInline
          preload="metadata"
        />
        <span className={styles.thumbVideoOverlay}>
          <VideoIcon />
        </span>
        <button
          type="button"
          className={styles.thumbRemove}
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  return null;
}

// ─── File list row ────────────────────────────────────────────────────────────

function FileRow({
  pf,
  onRemove,
  removeLabel,
}: {
  readonly pf: PendingFile;
  readonly onRemove: () => void;
  readonly removeLabel: string;
}) {
  return (
    <div className={styles.fileRow}>
      <span className={styles.fileRowIcon}>
        {pf.isVideo ? <VideoIcon /> : <FileIcon />}
      </span>
      <span className={styles.fileRowName}>{pf.file.name}</span>
      <span className={styles.fileRowSize}>{formatBytes(pf.size)}</span>
      <button
        type="button"
        className={styles.fileRowRemove}
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

// ─── Quality option ───────────────────────────────────────────────────────────

function QualityOption({
  value,
  current,
  label,
  sublabel,
  onChange,
}: {
  readonly value: SendQuality;
  readonly current: SendQuality;
  readonly label: string;
  readonly sublabel: string;
  readonly onChange: (v: SendQuality) => void;
}) {
  const checked = value === current;
  return (
    <label className={`${styles.qualityOption} ${checked ? styles.qualityOptionChecked : ""}`} aria-label={label}>
      <input
        type="radio"
        name="send-quality"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className={styles.qualityRadio}
      />
      <span className={styles.qualityDot} aria-hidden="true" />
      <span className={styles.qualityText}>
        <span className={styles.qualityLabel}>{label}</span>
        <span className={styles.qualitySubLabel}>{sublabel}</span>
      </span>
    </label>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export interface MediaSendDialogProps
  extends Pick<
    UseMediaSendDialogResult,
    | "pendingFiles"
    | "caption"
    | "quality"
    | "isSending"
    | "totalOriginalSize"
    | "totalCompressedSize"
    | "hasCompressible"
    | "canConfirmSend"
    | "removeFile"
    | "setCaption"
    | "setQuality"
    | "confirmSend"
    | "closeDialog"
  > {
  readonly isExiting?: boolean;
}

export function MediaSendDialog({
  pendingFiles,
  caption,
  quality,
  isSending,
  totalOriginalSize,
  totalCompressedSize,
  hasCompressible,
  canConfirmSend,
  removeFile,
  setCaption,
  setQuality,
  confirmSend,
  closeDialog,
  isExiting = false,
}: MediaSendDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // Focus caption on open; also sync initial height for JS resize
  useEffect(() => {
    const el = captionRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
    const id = setTimeout(() => captionRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  // Auto-resize caption textarea (replaces field-sizing: content)
  const handleCaptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    setCaption(el.value);
  }, [setCaption]);

  function onCaptionKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void confirmSend();
    }
  }

  function onOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      closeDialog();
    }
  }

  const mediaThumbs = pendingFiles.filter((f) => f.isImage || (f.isVideo && f.previewUrl));
  const otherFiles = pendingFiles.filter((f) => !f.isImage && !(f.isVideo && f.previewUrl));

  const compressedSizeLabel =
    totalCompressedSize === null
      ? t("mediaSend.estimating")
      : formatBytes(totalCompressedSize);

  const originalSizeLabel = formatBytes(totalOriginalSize);

  const compressedSizeHint = totalCompressedSize === null
    ? <><SpinnerIcon />&thinsp;{t("mediaSend.estimating")}</>
    : compressedSizeLabel;
  const sizeHintContent = quality === "compressed" && hasCompressible
    ? compressedSizeHint
    : originalSizeLabel;

  const fileCount = pendingFiles.length;
  const title = fileCount === 1
    ? t("mediaSend.title.one")
    : t("mediaSend.title.many", { count: fileCount });

  return createPortal(
    <div
      className={`${styles.overlay} ${isExiting ? motionStyles.fadeOut : motionStyles.fadeIn}`}
      onClick={onOverlayClick}
      role="presentation"
    >
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        aria-label={title}
        className={`${styles.surface} ${isExiting ? motionStyles.surfaceOut : motionStyles.surfaceIn}`}
        onCancel={(e) => { e.preventDefault(); closeDialog(); }}
        tabIndex={-1}
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>{title}</span>
          <button
            type="button"
            className={styles.headerClose}
            onClick={closeDialog}
            aria-label={t("mediaSend.close")}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Media grid */}
        {mediaThumbs.length > 0 && (
          <div className={`${styles.thumbGrid} ${mediaThumbs.length === 1 ? styles.thumbGridSingle : ""}`}>
            {mediaThumbs.map((pf) => (
              <FileThumbnail
                key={pf.id}
                pf={pf}
                onRemove={() => removeFile(pf.id)}
                removeLabel={t("mediaSend.remove")}
              />
            ))}
          </div>
        )}

        {/* File list (non-previewable) */}
        {otherFiles.length > 0 && (
          <div className={styles.fileList}>
            {otherFiles.map((pf) => (
              <FileRow
                key={pf.id}
                pf={pf}
                onRemove={() => removeFile(pf.id)}
                removeLabel={t("mediaSend.remove")}
              />
            ))}
          </div>
        )}

        {/* Caption */}
        <div className={styles.captionWrap}>
          <textarea
            ref={captionRef}
            className={styles.caption}
            value={caption}
            onChange={handleCaptionChange}
            onKeyDown={onCaptionKeyDown}
            placeholder={t("mediaSend.captionPlaceholder")}
            rows={1}
            maxLength={1000}
          />
        </div>

        {/* Compression options — only when at least one file can be compressed */}
        {hasCompressible && (
          <div className={styles.qualityBlock}>
            <QualityOption
              value="compressed"
              current={quality}
              label={t("mediaSend.quality.compressed")}
              sublabel={compressedSizeLabel}
              onChange={setQuality}
            />
            <QualityOption
              value="original"
              current={quality}
              label={t("mediaSend.quality.original")}
              sublabel={originalSizeLabel}
              onChange={setQuality}
            />
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          {/* Size hint */}
          <span className={styles.sizeHint}>{sizeHintContent}</span>

          <div className={styles.footerActions}>
            <PillButton
              type="button"
              tone="neutral"
              appearance="soft"
              size="md"
              onClick={closeDialog}
              disabled={isSending}
            >
              {t("mediaSend.cancel")}
            </PillButton>
            <PillButton
              type="button"
              tone="accent"
              appearance="strong"
              size="md"
              onClick={() => { void confirmSend(); }}
              disabled={!canConfirmSend}
            >
              {isSending ? t("mediaSend.sending") : t("mediaSend.send")}
            </PillButton>
          </div>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
