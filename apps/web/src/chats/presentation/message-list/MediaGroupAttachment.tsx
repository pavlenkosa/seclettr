import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useSecuritySettings } from "@/ui-settings";
import { useFileAttachmentRuntime } from "@/chats/runtime/useFileAttachmentRuntime";
import { useUploadProgress } from "@/chats/runtime/useUploadProgress";
import { MediaLightbox } from "@/components/common/MediaLightbox";
import type { Message } from "@/stores/messages";
import { MessageStatusIcon } from "./MessageListAttachments";
import { InlineAttachmentUploadOverlay } from "./AttachmentUploadProgress";
import styles from "../MessageList.module.css";

const MAX_COLLAPSED = 5;
const MEDIA_GROUP_GAP_PX = 2;
const DEFAULT_MEDIA_GROUP_WIDTH_PX = 320;
type MediaGroupLayout = "single" | "pair" | "triple" | "quad" | "quint" | "grid";

export function resolveMediaGroupLayout(count: number): MediaGroupLayout {
  if (count <= 1) return "single";
  if (count === 2) return "pair";
  if (count === 3) return "triple";
  if (count === 4) return "quad";
  if (count === 5) return "quint";
  return "grid";
}

interface AbsoluteMediaGroupCellFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AbsoluteMediaGroupPlan {
  height: number;
  cells: AbsoluteMediaGroupCellFrame[];
}

function clampMediaRatio(ratio?: number | null): number {
  if (!ratio || !Number.isFinite(ratio)) return 1;
  return Math.max(0.58, Math.min(1.91, ratio));
}

function toVisualMediaRatio(ratio?: number | null): number {
  return Math.pow(clampMediaRatio(ratio), 0.74);
}

function roundMediaPixels(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildTripleTopPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [heroRatio = 1, leftRatio = 1, rightRatio = 1] = ratios.map(toVisualMediaRatio);
  const bottomHeight = (width - MEDIA_GROUP_GAP_PX) / (leftRatio + rightRatio);
  const topHeight = width / heroRatio;
  const leftWidth = leftRatio * bottomHeight;
  const rightWidth = width - MEDIA_GROUP_GAP_PX - leftWidth;

  return {
    height: roundMediaPixels(topHeight + MEDIA_GROUP_GAP_PX + bottomHeight),
    cells: [
      { left: 0, top: 0, width, height: topHeight },
      { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: leftWidth, height: bottomHeight },
      { left: leftWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: rightWidth, height: bottomHeight },
    ],
  };
}

function buildTripleSidePlan(
  width: number,
  heroRatio: number,
  topRatio: number,
  bottomRatio: number,
  heroOnRight: boolean
): AbsoluteMediaGroupPlan {
  const heroVisualRatio = toVisualMediaRatio(heroRatio);
  const topVisualRatio = toVisualMediaRatio(topRatio);
  const bottomVisualRatio = toVisualMediaRatio(bottomRatio);
  const inverseStack = (1 / topVisualRatio) + (1 / bottomVisualRatio);
  const stackWidth = (
    width - MEDIA_GROUP_GAP_PX * (1 + heroVisualRatio)
  ) / (
    1 + heroVisualRatio * inverseStack
  );
  const totalHeight = stackWidth * inverseStack + MEDIA_GROUP_GAP_PX;
  const heroWidth = width - MEDIA_GROUP_GAP_PX - stackWidth;
  const topHeight = stackWidth / topVisualRatio;
  const bottomHeight = stackWidth / bottomVisualRatio;

  if (heroOnRight) {
    return {
      height: roundMediaPixels(totalHeight),
      cells: [
        { left: 0, top: 0, width: stackWidth, height: topHeight },
        { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: stackWidth, height: bottomHeight },
        { left: stackWidth + MEDIA_GROUP_GAP_PX, top: 0, width: heroWidth, height: totalHeight },
      ],
    };
  }

  return {
    height: roundMediaPixels(totalHeight),
    cells: [
      { left: 0, top: 0, width: heroWidth, height: totalHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: 0, width: stackWidth, height: topHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: stackWidth, height: bottomHeight },
    ],
  };
}

function buildTriplePlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [firstRatio = 1, secondRatio = 1, thirdRatio = 1] = ratios.map(clampMediaRatio);
  if (firstRatio < 0.82 && secondRatio > 0.95 && thirdRatio > 0.95) {
    return buildTripleSidePlan(width, firstRatio, secondRatio, thirdRatio, false);
  }
  if (thirdRatio < 0.82 && firstRatio > 0.95 && secondRatio > 0.95) {
    return buildTripleSidePlan(width, thirdRatio, firstRatio, secondRatio, true);
  }
  return buildTripleTopPlan(width, ratios);
}

function buildQuadPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [topLeftRatio = 1, topRightRatio = 1, bottomLeftRatio = 1, bottomRightRatio = 1] = ratios.map(toVisualMediaRatio);
  const topHeight = (width - MEDIA_GROUP_GAP_PX) / (topLeftRatio + topRightRatio);
  const bottomHeight = (width - MEDIA_GROUP_GAP_PX) / (bottomLeftRatio + bottomRightRatio);
  const topLeftWidth = topLeftRatio * topHeight;
  const topRightWidth = width - MEDIA_GROUP_GAP_PX - topLeftWidth;
  const bottomLeftWidth = bottomLeftRatio * bottomHeight;
  const bottomRightWidth = width - MEDIA_GROUP_GAP_PX - bottomLeftWidth;

  return {
    height: roundMediaPixels(topHeight + MEDIA_GROUP_GAP_PX + bottomHeight),
    cells: [
      { left: 0, top: 0, width: topLeftWidth, height: topHeight },
      { left: topLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: topRightWidth, height: topHeight },
      { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomLeftWidth, height: bottomHeight },
      { left: bottomLeftWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomRightWidth, height: bottomHeight },
    ],
  };
}

function buildQuintTopPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [r1 = 1, r2 = 1, r3 = 1, r4 = 1, r5 = 1] = ratios.map(toVisualMediaRatio);
  const topHeight = (width - MEDIA_GROUP_GAP_PX) / (r1 + r2);
  const bottomHeight = (width - MEDIA_GROUP_GAP_PX * 2) / (r3 + r4 + r5);
  const topLeftWidth = r1 * topHeight;
  const topRightWidth = width - MEDIA_GROUP_GAP_PX - topLeftWidth;
  const bottomLeftWidth = r3 * bottomHeight;
  const bottomCenterWidth = r4 * bottomHeight;
  const bottomRightWidth = width - MEDIA_GROUP_GAP_PX * 2 - bottomLeftWidth - bottomCenterWidth;

  return {
    height: roundMediaPixels(topHeight + MEDIA_GROUP_GAP_PX + bottomHeight),
    cells: [
      { left: 0, top: 0, width: topLeftWidth, height: topHeight },
      { left: topLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: topRightWidth, height: topHeight },
      { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomLeftWidth, height: bottomHeight },
      { left: bottomLeftWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomCenterWidth, height: bottomHeight },
      { left: bottomLeftWidth + bottomCenterWidth + MEDIA_GROUP_GAP_PX * 2, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomRightWidth, height: bottomHeight },
    ],
  };
}

function buildQuintSidePlan(
  width: number,
  heroRatio: number,
  rowOneLeftRatio: number,
  rowOneRightRatio: number,
  rowTwoLeftRatio: number,
  rowTwoRightRatio: number,
  heroOnRight: boolean
): AbsoluteMediaGroupPlan {
  const heroVisualRatio = toVisualMediaRatio(heroRatio);
  const rowOneLeftVisualRatio = toVisualMediaRatio(rowOneLeftRatio);
  const rowOneRightVisualRatio = toVisualMediaRatio(rowOneRightRatio);
  const rowTwoLeftVisualRatio = toVisualMediaRatio(rowTwoLeftRatio);
  const rowTwoRightVisualRatio = toVisualMediaRatio(rowTwoRightRatio);
  const rowOneSum = rowOneLeftVisualRatio + rowOneRightVisualRatio;
  const rowTwoSum = rowTwoLeftVisualRatio + rowTwoRightVisualRatio;
  const inverseRows = (1 / rowOneSum) + (1 / rowTwoSum);
  const stackWidth = (
    width - MEDIA_GROUP_GAP_PX * (1 + heroVisualRatio * (1 - inverseRows))
  ) / (
    1 + heroVisualRatio * inverseRows
  );
  const rowOneHeight = (stackWidth - MEDIA_GROUP_GAP_PX) / rowOneSum;
  const rowTwoHeight = (stackWidth - MEDIA_GROUP_GAP_PX) / rowTwoSum;
  const totalHeight = rowOneHeight + MEDIA_GROUP_GAP_PX + rowTwoHeight;
  const heroWidth = width - MEDIA_GROUP_GAP_PX - stackWidth;
  const rowOneLeftWidth = rowOneLeftVisualRatio * rowOneHeight;
  const rowOneRightWidth = stackWidth - MEDIA_GROUP_GAP_PX - rowOneLeftWidth;
  const rowTwoLeftWidth = rowTwoLeftVisualRatio * rowTwoHeight;
  const rowTwoRightWidth = stackWidth - MEDIA_GROUP_GAP_PX - rowTwoLeftWidth;

  if (heroOnRight) {
    return {
      height: roundMediaPixels(totalHeight),
      cells: [
        { left: 0, top: 0, width: rowOneLeftWidth, height: rowOneHeight },
        { left: rowOneLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: rowOneRightWidth, height: rowOneHeight },
        { left: 0, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoLeftWidth, height: rowTwoHeight },
        { left: rowTwoLeftWidth + MEDIA_GROUP_GAP_PX, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoRightWidth, height: rowTwoHeight },
        { left: stackWidth + MEDIA_GROUP_GAP_PX, top: 0, width: heroWidth, height: totalHeight },
      ],
    };
  }

  return {
    height: roundMediaPixels(totalHeight),
    cells: [
      { left: 0, top: 0, width: heroWidth, height: totalHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: 0, width: rowOneLeftWidth, height: rowOneHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX + rowOneLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: rowOneRightWidth, height: rowOneHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoLeftWidth, height: rowTwoHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX + rowTwoLeftWidth + MEDIA_GROUP_GAP_PX, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoRightWidth, height: rowTwoHeight },
    ],
  };
}

function buildQuintPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [r1 = 1, r2 = 1, r3 = 1, r4 = 1, r5 = 1] = ratios.map(clampMediaRatio);
  if (r1 < 0.82 && r2 > 0.9 && r3 > 0.9 && r4 > 0.9 && r5 > 0.9) {
    return buildQuintSidePlan(width, r1, r2, r3, r4, r5, false);
  }
  if (r5 < 0.82 && r1 > 0.9 && r2 > 0.9 && r3 > 0.9 && r4 > 0.9) {
    return buildQuintSidePlan(width, r5, r1, r2, r3, r4, true);
  }
  return buildQuintTopPlan(width, ratios);
}

function buildAbsoluteMediaGroupPlan(
  layout: MediaGroupLayout,
  width: number,
  ratios: number[]
): AbsoluteMediaGroupPlan | null {
  if (width <= 0) return null;
  if (layout === "triple" && ratios.length === 3) {
    return buildTriplePlan(width, ratios);
  }
  if (layout === "quad" && ratios.length === 4) {
    return buildQuadPlan(width, ratios);
  }
  if (layout === "quint" && ratios.length === 5) {
    return buildQuintPlan(width, ratios);
  }
  return null;
}

interface CellPreviewData {
  url: string;
  mimeType: string;
  caption?: string;
  fileName?: string;
  onDownload: () => void;
  downloading: boolean;
}

interface CellPreviewController {
  getPreviewData: () => CellPreviewData | null;
  ensurePreviewData: () => Promise<CellPreviewData | null>;
}

interface MediaGroupCellProps {
  readonly msg: Message;
  readonly fallbackCaption: string | undefined;
  readonly isLast: boolean;
  readonly isOwn: boolean;
  readonly timeLabel: string;
  readonly onOpen: (messageId: string) => void;
  readonly onControllerUpdate: (messageId: string, controller: CellPreviewController | null) => void;
  readonly onAspectRatioUpdate: (messageId: string, ratio: number) => void;
}

function MediaGroupCell({
  msg,
  fallbackCaption,
  isLast,
  isOwn,
  timeLabel,
  onOpen,
  onControllerUpdate,
  onAspectRatioUpdate,
}: MediaGroupCellProps) {
  const { t } = useI18n();
  const { autoDecryptMedia } = useSecuritySettings();
  const {
    loading,
    previewUrl,
    decryptAndPreview,
    decryptAndDownload,
  } = useFileAttachmentRuntime({
    attachment: msg.attachment,
    messageId: msg.id,
  });
  const { progress: uploadProgress, cancel: cancelUpload } = useUploadProgress(msg.id);
  const isVideo = msg.attachment?.mimeType.startsWith("video/") ?? false;
  const previewDataRef = useRef<CellPreviewData | null>(null);
  const previewMediaElement = isVideo ? (
    <video
      src={previewUrl ?? undefined}
      className={styles.mediaGroupThumb}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => {
        if (e.currentTarget.videoWidth > 0 && e.currentTarget.videoHeight > 0) {
          onAspectRatioUpdate(msg.id, e.currentTarget.videoWidth / e.currentTarget.videoHeight);
        }
        e.currentTarget.currentTime = 0.001;
      }}
    />
  ) : (
    <img
      src={previewUrl ?? undefined}
      className={styles.mediaGroupThumb}
      alt={msg.attachment?.fileName || ""}
      draggable={false}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalHeight > 0) {
          onAspectRatioUpdate(msg.id, e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
        }
      }}
    />
  );

  const buildPreviewData = useCallback((url: string, downloading: boolean): CellPreviewData => {
    const caption = msg.attachment?.caption?.trim()
      ? msg.attachment.caption
      : fallbackCaption;

    return {
      url,
      mimeType: msg.attachment?.mimeType ?? "",
      caption,
      fileName: msg.attachment?.fileName,
      onDownload: () => void decryptAndDownload(),
      downloading,
    };
  }, [
    decryptAndDownload,
    fallbackCaption,
    msg.attachment?.caption,
    msg.attachment?.fileName,
    msg.attachment?.mimeType,
  ]);

  useEffect(() => {
    previewDataRef.current = previewUrl
      ? buildPreviewData(previewUrl, loading)
      : null;
  }, [buildPreviewData, loading, previewUrl]);

  const getPreviewData = useCallback((): CellPreviewData | null => previewDataRef.current, []);

  const ensurePreviewData = useCallback(async (): Promise<CellPreviewData | null> => {
    if (uploadProgress !== null) return null;
    const existing = getPreviewData();
    if (existing) return existing;
    const url = await decryptAndPreview();
    if (!url) return null;
    const nextData = buildPreviewData(url, false);
    previewDataRef.current = nextData;
    return nextData;
  }, [
    buildPreviewData,
    decryptAndPreview,
    getPreviewData,
    uploadProgress,
  ]);

  useEffect(() => {
    if (
      autoDecryptMedia === "on" &&
      uploadProgress === null &&
      !previewUrl &&
      !loading
    ) {
      void decryptAndPreview();
    }
  }, [autoDecryptMedia, decryptAndPreview, loading, msg.attachment?.attachmentId, previewUrl, uploadProgress]);

  useEffect(() => {
    onControllerUpdate(msg.id, {
      getPreviewData,
      ensurePreviewData,
    });
    return () => {
      onControllerUpdate(msg.id, null);
    };
  }, [ensurePreviewData, getPreviewData, msg.id, onControllerUpdate]);

  const handleTap = async () => {
    const previewData = await ensurePreviewData();
    if (previewData) {
      onOpen(msg.id);
    }
  };

  const cellMetaOverlay = isLast ? (
    <div className={styles.mediaGroupMeta} aria-hidden="true">
      <span>{timeLabel}</span>
      {isOwn ? <MessageStatusIcon status={msg.status} /> : null}
    </div>
  ) : null;

  return (
    <button
      type="button"
      className={styles.mediaGroupCell}
      tabIndex={uploadProgress === null ? 0 : -1}
      aria-disabled={uploadProgress !== null}
      aria-label={t(isVideo ? "message.media.tapToPlayVideo" : "message.media.tapToViewImage")}
      onClick={() => { if (uploadProgress === null) void handleTap(); }}
      onKeyDown={(e) => { if (uploadProgress === null && (e.key === "Enter" || e.key === " ")) void handleTap(); }}
    >
      {previewUrl ? (
        previewMediaElement
      ) : (
        <div className={styles.mediaGroupPlaceholder}>
          {loading ? (
            <span className={styles.mediaGroupSpinner} aria-hidden="true" />
          ) : (
            <span className={styles.inlineMediaLock} aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="M6.5 9V7a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <rect x="4.5" y="9" width="11" height="7.5" rx="2.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="10" cy="12.8" r="1.1" fill="currentColor" />
              </svg>
            </span>
          )}
        </div>
      )}

      {previewUrl && isVideo ? (
        <div className={styles.mediaGroupPlayOverlay} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" fill="rgb(0 0 0 / 0.48)" />
            <path d="M10 8.5l6 3.5-6 3.5V8.5Z" fill="currentColor" />
          </svg>
        </div>
      ) : null}

      {uploadProgress === null ? cellMetaOverlay : (
        <InlineAttachmentUploadOverlay
          progress={uploadProgress}
          onCancel={cancelUpload}
          ariaLabel={t("message.upload.cancel")}
        />
      )}
    </button>
  );
}

interface Props {
  readonly messages: Message[];
  readonly isOwn: boolean;
  readonly timeLabel: string;
}

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
