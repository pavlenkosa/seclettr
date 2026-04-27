import {
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";
import { IconButton } from "@/components/ui";
import { useAnimatedPresence } from "@/lib/hooks";
import { useMediaLightboxInteractions } from "./useMediaLightboxInteractions";
import styles from "./MediaLightbox.module.css";

interface MediaLightboxProps {
  readonly isOpen?: boolean;
  readonly url: string;
  readonly mimeType: string;
  readonly fileName?: string;
  readonly downloading?: boolean;
  readonly currentIndex?: number;
  readonly totalCount?: number;
  readonly onClose: () => void;
  readonly onClosed?: () => void;
  readonly onDownload: () => void;
  readonly onNavigate?: (delta: -1 | 1) => void;
}


type StageDirection = "initial" | "next" | "prev";

interface MediaSize {
  readonly width: number;
  readonly height: number;
}

interface SequenceState {
  readonly showSequenceUi: boolean;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
}

type Translate = (key: string) => string;

function getInitialViewportSize(): MediaSize {
  return {
    width: globalThis.window === undefined ? 1440 : globalThis.innerWidth,
    height: globalThis.window === undefined ? 900 : globalThis.innerHeight,
  };
}

function useViewportSize(): MediaSize {
  const [viewportSize, setViewportSize] = useState(getInitialViewportSize);

  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const handleResize = () => {
      setViewportSize({
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      });
    };

    globalThis.addEventListener("resize", handleResize);
    return () => globalThis.removeEventListener("resize", handleResize);
  }, []);

  return viewportSize;
}

function useStageAnimation(currentIndex?: number) {
  const previousIndexRef = useRef<number | undefined>(currentIndex);
  const [stageAnimationKey, setStageAnimationKey] = useState(0);
  const [stageDirection, setStageDirection] = useState<StageDirection>("initial");

  useEffect(() => {
    if (currentIndex === undefined || previousIndexRef.current === undefined) {
      previousIndexRef.current = currentIndex;
      return;
    }

    if (previousIndexRef.current !== currentIndex) {
      setStageDirection(currentIndex > previousIndexRef.current ? "next" : "prev");
      setStageAnimationKey((value) => value + 1);
      previousIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  return { stageAnimationKey, stageDirection };
}

function useResolvedMediaStyle(
  naturalSize: MediaSize | null,
  viewportSize: MediaSize
): CSSProperties | undefined {
  return useMemo(() => {
    if (!naturalSize) return undefined;

    const isCompactViewport = viewportSize.width <= 720;
    const maxWidth = isCompactViewport
      ? Math.max(220, viewportSize.width - 28)
      : Math.min(viewportSize.width * 0.54, 880);
    const maxHeight = isCompactViewport
      ? Math.max(260, viewportSize.height - 168)
      : Math.min(viewportSize.height * 0.72, viewportSize.height - 176, 760);
    const scale = Math.min(
      maxWidth / naturalSize.width,
      maxHeight / naturalSize.height,
      1
    );

    return {
      width: `${Math.round(naturalSize.width * scale)}px`,
      height: `${Math.round(naturalSize.height * scale)}px`,
    };
  }, [naturalSize, viewportSize.height, viewportSize.width]);
}

function getSequenceState(
  currentIndex: number | undefined,
  totalCount: number | undefined,
  onNavigate: MediaLightboxProps["onNavigate"]
): SequenceState {
  const showSequenceUi = totalCount !== undefined && totalCount > 1 && currentIndex !== undefined;
  const hasPrev = onNavigate !== undefined && currentIndex !== undefined && currentIndex > 0;
  const hasNext = (
    onNavigate !== undefined &&
    currentIndex !== undefined &&
    totalCount !== undefined &&
    currentIndex < totalCount - 1
  );
  return { showSequenceUi, hasPrev, hasNext };
}

function getStageDirectionClass(stageDirection: StageDirection): string {
  if (stageDirection === "next") return styles.mediaStageSlideNext ?? "";
  if (stageDirection === "prev") return styles.mediaStageSlidePrev ?? "";
  return styles.mediaStageEnter ?? "";
}

function readVideoSize(video: HTMLVideoElement): MediaSize | null {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null;
  return { width: video.videoWidth, height: video.videoHeight };
}

function readImageSize(image: HTMLImageElement): MediaSize | null {
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function updateNaturalSize(
  nextSize: MediaSize | null,
  setNaturalSize: Dispatch<SetStateAction<MediaSize | null>>
): void {
  if (nextSize) {
    setNaturalSize(nextSize);
  }
}

interface LightboxToolbarProps {
  readonly closeButtonRef: RefObject<HTMLButtonElement>;
  readonly currentIndex?: number;
  readonly downloading: boolean;
  readonly fileName?: string;
  readonly isClosing: boolean;
  readonly onClose: () => void;
  readonly onDownload: () => void;
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
        <IconButton
          variant="glass"
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
          variant="glass"
          className={styles.iconBtn}
          onClick={onClose}
          aria-label={t("message.media.close")}
          title={t("message.media.close")}
          data-testid="media-lightbox-close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
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
      variant="glass"
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

interface LightboxMediaPreviewProps {
  readonly fileName?: string;
  readonly isVideo: boolean;
  readonly resolvedMediaStyle?: CSSProperties;
  readonly setNaturalSize: Dispatch<SetStateAction<MediaSize | null>>;
  readonly url: string;
}

function LightboxMediaPreview({
  fileName,
  isVideo,
  resolvedMediaStyle,
  setNaturalSize,
  url,
}: LightboxMediaPreviewProps) {
  if (isVideo) {
    return (
      <video
        src={url}
        className={styles.video}
        controls
        autoPlay
        playsInline
        style={resolvedMediaStyle}
        onLoadedMetadata={(event) => updateNaturalSize(
          readVideoSize(event.currentTarget),
          setNaturalSize
        )}
      >
        <track kind="captions" />
      </video>
    );
  }

  return (
    <img
      src={url}
      className={styles.image}
      alt={fileName || ""}
      style={resolvedMediaStyle}
      onLoad={(event) => updateNaturalSize(
        readImageSize(event.currentTarget),
        setNaturalSize
      )}
      draggable={false}
    />
  );
}

interface MobileSequenceHintProps {
  readonly currentIndex: number;
  readonly totalCount: number;
  readonly t: Translate;
}

function MobileSequenceHint({ currentIndex, totalCount, t }: MobileSequenceHintProps) {
  return (
    <div className={styles.mobileSequenceHint} aria-hidden="true">
      <div className={styles.mobileSequenceDots}>
        {Array.from({ length: totalCount }, (_, index) => (
          <span
            key={index}
            className={`${styles.mobileSequenceDot} ${index === currentIndex ? styles.mobileSequenceDotActive : ""}`}
          />
        ))}
      </div>
      <div className={styles.mobileSwipeHint}>
        <span className={styles.mobileSwipeChevron}>‹</span>
        <span>{t("message.media.swipeHint")}</span>
        <span className={styles.mobileSwipeChevron}>›</span>
      </div>
    </div>
  );
}

export function MediaLightbox({
  isOpen = true,
  url,
  mimeType,
  fileName,
  downloading = false,
  currentIndex,
  totalCount,
  onClose,
  onClosed,
  onDownload,
  onNavigate,
}: MediaLightboxProps) {
  const { t } = useI18n();
  const isVideo = mimeType.startsWith("video/");
  const { isMounted, isClosing } = useAnimatedPresence({
    isOpen,
    durationMs: 180,
    onHidden: onClosed,
  });
  const [naturalSize, setNaturalSize] = useState<MediaSize | null>(null);
  const viewportSize = useViewportSize();
  const { stageAnimationKey, stageDirection } = useStageAnimation(currentIndex);
  const { showSequenceUi, hasPrev, hasNext } = getSequenceState(
    currentIndex,
    totalCount,
    onNavigate
  );
  const {
    closeButtonRef,
    dialogRef,
    handleContentClick,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isSwiping,
    mediaStageStyle,
  } = useMediaLightboxInteractions({
    isActive: isOpen && !isClosing,
    hasNext,
    hasPrev,
    onClose,
    onNavigate,
  });

  useEffect(() => {
    setNaturalSize(null);
  }, [mimeType, url]);

  const resolvedMediaStyle = useResolvedMediaStyle(naturalSize, viewportSize);

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      open
      className={[styles.overlay, isClosing ? styles.overlayClosing : ""].join(" ")}
      aria-modal="true"
      aria-label={t("message.media.lightboxAria")}
      data-testid="media-lightbox"
      tabIndex={-1}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className={[styles.backdrop, isClosing ? styles.backdropClosing : ""].join(" ")}
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

      <div
        className={`${styles.content} ${isSwiping ? styles.contentSwiping : ""}`}
        role="none"
        onClick={handleContentClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        data-testid="media-lightbox-content"
      >
        <div
          key={`${stageAnimationKey}:${currentIndex ?? "single"}:${url}`}
          className={[
            styles.mediaStage,
            isClosing ? styles.mediaStageClosing : "",
            getStageDirectionClass(stageDirection),
          ].join(" ")}
          style={mediaStageStyle}
        >
          <LightboxMediaPreview
            fileName={fileName}
            isVideo={isVideo}
            resolvedMediaStyle={resolvedMediaStyle}
            setNaturalSize={setNaturalSize}
            url={url}
          />
        </div>

        {showSequenceUi && currentIndex !== undefined && totalCount !== undefined ? (
          <MobileSequenceHint
            currentIndex={currentIndex}
            totalCount={totalCount}
            t={t}
          />
        ) : null}
      </div>
    </dialog>,
    document.body
  );
}
