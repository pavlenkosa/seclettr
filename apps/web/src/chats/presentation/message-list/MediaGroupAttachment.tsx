import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { MediaLightbox } from "@/components/common/MediaLightbox";
import type { Message } from "@/stores/messages";
import {
  buildAbsoluteMediaGroupPlan,
  clampMediaRatio,
  DEFAULT_MEDIA_GROUP_WIDTH_PX,
  MAX_COLLAPSED,
  resolveMediaGroupLayout,
} from "./media-group-layout";
import { MediaGroupCell, type CellPreviewController } from "./MediaGroupCell";
import styles from "./MessageListAttachments.module.css";

// Re-exported for message-list tests that assert layout bucketing.
export { resolveMediaGroupLayout } from "./media-group-layout";

interface Props {
  readonly messages: Message[];
  readonly isOwn: boolean;
  readonly timeLabel: string;
}

/**
 * Album orchestration for a run of media attachments: owns expand/lightbox
 * state, per-cell aspect-ratio collection, width measurement, and absolute
 * cell placement. Geometry math lives in `media-group-layout.ts`; per-cell
 * decrypt/upload runtime lives in `MediaGroupCell.tsx`.
 */
export function MediaGroupAttachment({ messages, isOwn, timeLabel }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxMessageId, setLightboxMessageId] = useState<string | null>(null);
  const [aspectRatiosByMessageId, setAspectRatiosByMessageId] = useState<Record<string, number>>({});
  const [measuredWidth, setMeasuredWidth] = useState(DEFAULT_MEDIA_GROUP_WIDTH_PX);
  const controllerRef = useRef<Map<string, CellPreviewController>>(new Map());
  const mediaGroupRef = useRef<HTMLDivElement | null>(null);

  const fallbackCaption = useMemo(() => {
    const source = messages.find((message) => message.attachment?.caption?.trim());
    return source?.attachment?.caption;
  }, [messages]);
  const needsExpand = messages.length > MAX_COLLAPSED;
  const visible = needsExpand && !expanded ? messages.slice(0, MAX_COLLAPSED) : messages;
  const hiddenCount = messages.length - visible.length;
  const dataCount = visible.length;
  const layout = resolveMediaGroupLayout(dataCount);
  const absoluteLayoutPlan = useMemo(() => {
    const ratios = visible.map((message) => aspectRatiosByMessageId[message.id] ?? 1);
    return buildAbsoluteMediaGroupPlan(layout, measuredWidth, ratios);
  }, [aspectRatiosByMessageId, layout, measuredWidth, visible]);
  const lightboxMessages = expanded ? messages : visible;
  const lightboxIndex = lightboxMessageId
    ? lightboxMessages.findIndex((message) => message.id === lightboxMessageId)
    : -1;

  const handleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
  }, []);

  const handleCellOpen = useCallback((messageId: string) => {
    setLightboxMessageId(messageId);
    setIsLightboxOpen(true);
  }, []);

  const handleControllerUpdate = useCallback((
    messageId: string,
    controller: CellPreviewController | null
  ) => {
    if (controller) {
      controllerRef.current.set(messageId, controller);
    } else {
      controllerRef.current.delete(messageId);
    }
  }, []);

  const handleAspectRatioUpdate = useCallback((messageId: string, ratio: number) => {
    const nextRatio = clampMediaRatio(ratio);
    setAspectRatiosByMessageId((current) => {
      if (current[messageId] && Math.abs(current[messageId] - nextRatio) < 0.01) {
        return current;
      }
      return {
        ...current,
        [messageId]: nextRatio,
      };
    });
  }, []);

  const handleLightboxClose = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  const handleLightboxNavigate = useCallback(async (delta: -1 | 1) => {
    if (lightboxIndex < 0) return;
    const nextIndex = lightboxIndex + delta;
    if (nextIndex < 0 || nextIndex >= lightboxMessages.length) return;

    const nextMessage = lightboxMessages[nextIndex];
    if (!nextMessage) return;

    const controller = controllerRef.current.get(nextMessage.id);
    if (!controller) return;

    const previewData = controller.getPreviewData() ?? await controller.ensurePreviewData();
    if (previewData) {
      setLightboxMessageId(nextMessage.id);
    }
  }, [lightboxIndex, lightboxMessages]);

  const lightboxData = lightboxMessageId
    ? controllerRef.current.get(lightboxMessageId)?.getPreviewData()
    : undefined;

  useEffect(() => {
    const node = mediaGroupRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? DEFAULT_MEDIA_GROUP_WIDTH_PX;
      setMeasuredWidth(nextWidth > 0 ? nextWidth : DEFAULT_MEDIA_GROUP_WIDTH_PX);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible.length]);

  const mediaGroupStyle = absoluteLayoutPlan
    ? {
      display: "block",
      position: "relative",
      height: `${absoluteLayoutPlan.height}px`,
    } satisfies CSSProperties
    : undefined;

  return (
    <>
      <div
        ref={mediaGroupRef}
        className={styles.mediaGroup}
        data-layout={layout}
        style={mediaGroupStyle}
      >
        {visible.map((msg, idx) => {
          const isLast = idx === visible.length - 1;
          const absoluteCellStyle = absoluteLayoutPlan?.cells[idx]
            ? {
              position: "absolute",
              left: `${absoluteLayoutPlan.cells[idx].left}px`,
              top: `${absoluteLayoutPlan.cells[idx].top}px`,
              width: `${absoluteLayoutPlan.cells[idx].width}px`,
              height: `${absoluteLayoutPlan.cells[idx].height}px`,
            } satisfies CSSProperties
            : { position: "relative" } satisfies CSSProperties;
          return (
            <div key={msg.id} style={absoluteCellStyle}>
              <MediaGroupCell
                msg={msg}
                fallbackCaption={fallbackCaption}
                isLast={isLast && hiddenCount === 0}
                isOwn={isOwn}
                timeLabel={timeLabel}
                onOpen={handleCellOpen}
                onControllerUpdate={handleControllerUpdate}
                onAspectRatioUpdate={handleAspectRatioUpdate}
              />
              {isLast && hiddenCount > 0 ? (
                <button
                  type="button"
                  className={styles.mediaGroupMore}
                  onClick={handleExpand}
                  aria-label={t("message.media.showMore", { count: hiddenCount })}
                >
                  +{hiddenCount}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {lightboxMessageId !== null && lightboxIndex >= 0 && lightboxData ? (
        <MediaLightbox
          isOpen={isLightboxOpen}
          url={lightboxData.url}
          mimeType={lightboxData.mimeType}
          caption={lightboxData.caption}
          fileName={lightboxData.fileName}
          downloading={lightboxData.downloading}
          onClose={handleLightboxClose}
          onClosed={() => {
            setLightboxMessageId(null);
          }}
          onDownload={lightboxData.onDownload}
          currentIndex={lightboxIndex}
          totalCount={lightboxMessages.length}
          onNavigate={lightboxMessages.length > 1 ? handleLightboxNavigate : undefined}
        />
      ) : null}
    </>
  );
}
