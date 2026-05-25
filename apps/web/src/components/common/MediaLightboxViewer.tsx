import {
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./MediaLightbox.module.css";

type StageDirection = "initial" | "next" | "prev";
type Translate = (key: string) => string;

export interface MediaSize {
  readonly width: number;
  readonly height: number;
}

interface SequenceState {
  readonly showSequenceUi: boolean;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
}

function getInitialViewportSize(): MediaSize {
  return {
    width: globalThis.window === undefined ? 1440 : globalThis.innerWidth,
    height: globalThis.window === undefined ? 900 : globalThis.innerHeight,
  };
}

export function useViewportSize(): MediaSize {
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

export function useStageAnimation(currentIndex?: number) {
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

export function useResolvedMediaStyle(
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

export function getSequenceState(
  currentIndex: number | undefined,
  totalCount: number | undefined,
  onNavigate: ((delta: -1 | 1) => void) | undefined
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
  readonly hasCaption: boolean;
  readonly totalCount: number;
  readonly t: Translate;
}

function MobileSequenceHint({
  currentIndex,
  hasCaption,
  totalCount,
  t,
}: MobileSequenceHintProps) {
  return (
    <div
      className={[
        styles.mobileSequenceHint,
        hasCaption ? styles.mobileSequenceHintWithCaption : "",
      ].join(" ")}
      aria-hidden="true"
    >
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

interface MediaLightboxViewerProps {
  readonly currentIndex?: number;
  readonly fileName?: string;
  readonly hasCaption: boolean;
  readonly isClosing: boolean;
  readonly isSwiping: boolean;
  readonly isVideo: boolean;
  readonly mediaStageStyle?: CSSProperties;
  readonly onContentClick: React.MouseEventHandler<HTMLDivElement>;
  readonly onPointerCancel: React.PointerEventHandler<HTMLDivElement>;
  readonly onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  readonly onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  readonly onPointerUp: React.PointerEventHandler<HTMLDivElement>;
  readonly resolvedMediaStyle?: CSSProperties;
  readonly setNaturalSize: Dispatch<SetStateAction<MediaSize | null>>;
  readonly showSequenceUi: boolean;
  readonly stageAnimationKey: number;
  readonly stageDirection: StageDirection;
  readonly t: Translate;
  readonly totalCount?: number;
  readonly url: string;
}

export function MediaLightboxViewer({
  currentIndex,
  fileName,
  hasCaption,
  isClosing,
  isSwiping,
  isVideo,
  mediaStageStyle,
  onContentClick,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  resolvedMediaStyle,
  setNaturalSize,
  showSequenceUi,
  stageAnimationKey,
  stageDirection,
  t,
  totalCount,
  url,
}: MediaLightboxViewerProps) {
  return (
    <div
      className={`${styles.content} ${isSwiping ? styles.contentSwiping : ""}`}
      role="none"
      onClick={onContentClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
          hasCaption={hasCaption}
          totalCount={totalCount}
          t={t}
        />
      ) : null}
    </div>
  );
}
