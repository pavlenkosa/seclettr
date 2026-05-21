import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";
import { useAnimatedPresence } from "@/lib/hooks";
import { useMediaLightboxInteractions } from "./useMediaLightboxInteractions";
import { MediaLightboxShell } from "./MediaLightboxShell";
import {
  type MediaSize,
  getSequenceState,
  MediaLightboxViewer,
  useResolvedMediaStyle,
  useStageAnimation,
  useViewportSize,
} from "./MediaLightboxViewer";

interface MediaLightboxProps {
  readonly isOpen?: boolean;
  readonly url: string;
  readonly mimeType: string;
  readonly caption?: string;
  readonly fileName?: string;
  readonly downloading?: boolean;
  readonly currentIndex?: number;
  readonly totalCount?: number;
  readonly onClose: () => void;
  readonly onClosed?: () => void;
  readonly onDownload: () => void;
  readonly onGoToMessage?: () => void;
  readonly onNavigate?: (delta: -1 | 1) => void;
}

export function MediaLightbox({
  isOpen = true,
  url,
  mimeType,
  caption,
  fileName,
  downloading = false,
  currentIndex,
  totalCount,
  onClose,
  onClosed,
  onDownload,
  onGoToMessage,
  onNavigate,
}: MediaLightboxProps) {
  const { t } = useI18n();
  const isVideo = mimeType.startsWith("video/");
  const trimmedCaption = caption?.trim() || null;
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
    <MediaLightboxShell
      ariaLabel={t("message.media.lightboxAria")}
      caption={trimmedCaption}
      closeButtonRef={closeButtonRef}
      currentIndex={currentIndex}
      dialogRef={dialogRef}
      downloading={downloading}
      fileName={fileName}
      hasNext={hasNext}
      hasPrev={hasPrev}
      isClosing={isClosing}
      onClose={onClose}
      onDownload={onDownload}
      onGoToMessage={onGoToMessage}
      onNavigate={onNavigate}
      showSequenceUi={showSequenceUi}
      totalCount={totalCount}
      t={t}
    >
      <MediaLightboxViewer
        currentIndex={currentIndex}
        fileName={fileName}
        hasCaption={trimmedCaption !== null}
        isClosing={isClosing}
        isSwiping={isSwiping}
        isVideo={isVideo}
        mediaStageStyle={mediaStageStyle}
        onContentClick={handleContentClick}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        resolvedMediaStyle={resolvedMediaStyle}
        setNaturalSize={setNaturalSize}
        showSequenceUi={showSequenceUi}
        stageAnimationKey={stageAnimationKey}
        stageDirection={stageDirection}
        t={t}
        totalCount={totalCount}
        url={url}
      />
    </MediaLightboxShell>,
    document.body
  );
}
