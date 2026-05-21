import { type RefObject, type ReactNode } from "react";
import { IconButton, IconClose } from "@/components/ui";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./MediaLightbox.module.css";

type Translate = (key: string) => string;

interface LightboxToolbarProps {
  readonly closeButtonRef: RefObject<HTMLButtonElement>;
  readonly currentIndex?: number;
  readonly downloading: boolean;
  readonly fileName?: string;
  readonly isClosing: boolean;
  readonly onClose: () => void;
  readonly onDownload: () => void;
  readonly onGoToMessage?: () => void;
  readonly showSequenceUi: boolean;
  readonly totalCount?: number;
  readonly t: Translate;
}

function LightboxToolbar({
  closeButtonRef,
  currentIndex,
  downloading,
  fileName,
  isClosing,
  onClose,
  onDownload,
  onGoToMessage,
  showSequenceUi,
  totalCount,
  t,
}: LightboxToolbarProps) {
  const sequenceLabel = showSequenceUi && currentIndex !== undefined && totalCount !== undefined
    ? `${currentIndex + 1} / ${totalCount}`
    : null;

  return (
    <div className={[styles.toolbar, isClosing ? styles.toolbarClosing : ""].join(" ")}>
      <span className={styles.toolbarFileName}>{fileName || t("message.file.unnamed")}</span>
      <div className={styles.toolbarActions}>
        {sequenceLabel ? (
          <span className={styles.toolbarCounter}>{sequenceLabel}</span>
        ) : null}
        {onGoToMessage ? (
          <IconButton
            className={styles.iconBtn}
            onClick={onGoToMessage}
            aria-label={t("message.media.goToMessage")}
            title={t("message.media.goToMessage")}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 9h12M10 4l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        ) : null}
        <IconButton
          className={styles.iconBtn}
          onClick={onDownload}
          disabled={downloading}
          aria-label={t("message.media.download")}
          title={t("message.media.download")}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M9 3v9M5 8.5l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 15h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </IconButton>
        <IconButton
          ref={closeButtonRef}
          className={styles.iconBtn}
          onClick={onClose}
          aria-label={t("message.media.close")}
          title={t("message.media.close")}
          data-testid="media-lightbox-close"
        >
          <IconClose />
        </IconButton>
      </div>
    </div>
  );
}

interface LightboxNavButtonProps {
  readonly direction: -1 | 1;
  readonly label: string;
  readonly onNavigate: (delta: -1 | 1) => void;
}

function LightboxNavButton({ direction, label, onNavigate }: LightboxNavButtonProps) {
  const isPrevious = direction === -1;
  return (
    <IconButton
      className={`${styles.navBtn} ${isPrevious ? styles.navBtnPrev : styles.navBtnNext}`}
      onClick={() => onNavigate(direction)}
      aria-label={label}
      data-testid={isPrevious ? "media-lightbox-prev" : "media-lightbox-next"}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        {isPrevious ? (
          <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </IconButton>
  );
}

interface MediaLightboxShellProps {
  readonly ariaLabel: string;
  readonly caption: string | null;
  readonly children: ReactNode;
  readonly closeButtonRef: RefObject<HTMLButtonElement>;
  readonly currentIndex?: number;
  readonly dialogRef: RefObject<HTMLDialogElement>;
  readonly downloading: boolean;
  readonly fileName?: string;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  readonly isClosing: boolean;
  readonly onClose: () => void;
  readonly onDownload: () => void;
  readonly onGoToMessage?: () => void;
  readonly onNavigate?: (delta: -1 | 1) => void;
  readonly showSequenceUi: boolean;
  readonly totalCount?: number;
  readonly t: Translate;
}

export function MediaLightboxShell({
  ariaLabel,
  caption,
  children,
  closeButtonRef,
  currentIndex,
  dialogRef,
  downloading,
  fileName,
  hasNext,
  hasPrev,
  isClosing,
  onClose,
  onDownload,
  onGoToMessage,
  onNavigate,
  showSequenceUi,
  totalCount,
  t,
}: MediaLightboxShellProps) {
  return (
    <dialog
      ref={dialogRef}
      open
      className={[
        styles.overlay,
        caption ? styles.overlayWithCaption : "",
        isClosing ? motionStyles.fadeOut : motionStyles.fadeIn,
      ].filter(Boolean).join(" ")}
      aria-modal="true"
      aria-label={ariaLabel}
      data-testid="media-lightbox"
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className={styles.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />

      <LightboxToolbar
        closeButtonRef={closeButtonRef}
        currentIndex={currentIndex}
        downloading={downloading}
        fileName={fileName}
        isClosing={isClosing}
        onClose={onClose}
        onDownload={onDownload}
        onGoToMessage={onGoToMessage}
        showSequenceUi={showSequenceUi}
        totalCount={totalCount}
        t={t}
      />

      {hasPrev && onNavigate ? (
        <LightboxNavButton
          direction={-1}
          label={t("message.media.prev")}
          onNavigate={onNavigate}
        />
      ) : null}

      {hasNext && onNavigate ? (
        <LightboxNavButton
          direction={1}
          label={t("message.media.next")}
          onNavigate={onNavigate}
        />
      ) : null}

      {children}

      {caption ? (
        <div className={styles.captionBar}>{caption}</div>
      ) : null}
    </dialog>
  );
}
