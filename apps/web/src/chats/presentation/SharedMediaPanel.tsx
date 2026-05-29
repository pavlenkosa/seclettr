import { memo, useMemo, useState } from "react";
import type { Message } from "@/stores/messages";
import { useI18n } from "@/i18n";
import { IconButton } from "@/components/ui";
import { IconClose } from "@/components/ui/icons";
import { MediaLightbox } from "@/components/common/MediaLightbox";
import { formatClock } from "./message-list/message-list-presentation";
import styles from "./SharedMediaPanel.module.css";

type MediaTab = "media" | "voice" | "video" | "files";

interface Props {
  readonly messages: Message[];
  readonly onScrollToMessage: (messageId: string) => void;
  readonly onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms: number, locale: string): string {
  return new Date(ms).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function isMediaAttachment(msg: Message): boolean {
  const mt = msg.attachment?.mimeType ?? "";
  return mt.startsWith("image/") || (mt.startsWith("video/") && msg.attachment?.kind !== "video_note");
}

function isVoiceAttachment(msg: Message): boolean {
  return msg.attachment?.kind === "voice_note" || Boolean(msg.attachment?.mimeType.startsWith("audio/"));
}

function isVideoNoteAttachment(msg: Message): boolean {
  return msg.attachment?.kind === "video_note";
}

function triggerDownload(url: string, fileName?: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName ?? "media";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function MediaGrid({
  messages,
  onOpen,
  locale,
}: {
  readonly messages: Message[];
  readonly onOpen: (index: number) => void;
  readonly locale: string;
}) {
  const { t } = useI18n();
  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <path d="M21 15l-5-5-4 4-2-2-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>{t("chat.media.empty")}</span>
      </div>
    );
  }

  return (
    <div className={styles.grid} role="list">
      {messages.map((msg, index) => {
        const att = msg.attachment!;
        const isGif = att.mimeType === "image/gif";
        const isVideo = att.mimeType.startsWith("video/");
        const hasThumb = Boolean(att.localUrl);

        return (
          <button
            key={msg.id}
            type="button"
            className={styles.gridCell}
            onClick={() => onOpen(index)}
            aria-label={`${isGif ? "GIF" : isVideo ? "Видео" : "Фото"} — ${formatDate(msg.timestamp, locale)}`}

          >
            {hasThumb ? (
              <img
                src={att.localUrl}
                className={styles.gridThumb}
                alt=""
                loading="lazy"
                draggable={false}
              />
            ) : (
              <span className={styles.gridPlaceholder} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                  <path d="M21 15l-5-5-4 4-2-2-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            {isGif ? (
              <span className={styles.gridBadge}>GIF</span>
            ) : null}
            {isVideo ? (
              <span className={styles.gridPlayIcon} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="14" fill="rgb(0 0 0 / 0.42)" />
                  <path d="M11 9.5l9 4.5-9 4.5V9.5Z" fill="white" />
                </svg>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MediaListItem({
  msg,
  locale,
  t,
  onScrollToMessage,
}: {
  readonly msg: Message;
  readonly locale: string;
  readonly t: (key: string) => string;
  readonly onScrollToMessage: (id: string) => void;
}) {
  const att = msg.attachment!;
  const isVoice = isVoiceAttachment(msg);
  const isVideo = isVideoNoteAttachment(msg);
  const label = isVoice
    ? t("chat.media.voiceNote")
    : isVideo
      ? t("chat.media.videoNote")
      : (att.fileName ?? t("chat.media.unknownFile"));
  const meta = att.durationMs
    ? formatClock(Math.floor(att.durationMs / 1000))
    : att.size
      ? formatSize(att.size)
      : null;

  return (
    <li className={styles.item}>
      <span className={styles.itemIcon} aria-hidden="true">
        {isVoice ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : isVideo ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 8.5l6 3.5-6 3.5V8.5Z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className={styles.itemBody}>
        <span className={styles.itemLabel}>{label}</span>
        <span className={styles.itemMeta}>
          {meta ? <span>{meta}</span> : null}
          <span>{formatDate(msg.timestamp, locale)}</span>
        </span>
      </div>
      <button
        type="button"
        className={styles.itemGoBtn}
        onClick={() => onScrollToMessage(msg.id)}
        aria-label={t("chat.media.goTo")}
        title={t("chat.media.goTo")}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </li>
  );
}

export const SharedMediaPanel = memo(function SharedMediaPanel({
  messages,
  onScrollToMessage,
  onClose,
}: Props) {
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<MediaTab>("media");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { mediaMessages, voiceMessages, videoMessages, fileMessages } = useMemo(() => {
    const media: Message[] = [];
    const voice: Message[] = [];
    const video: Message[] = [];
    const files: Message[] = [];
    for (const msg of messages) {
      if (!msg.attachment) continue;
      if (isMediaAttachment(msg)) media.push(msg);
      else if (isVoiceAttachment(msg)) voice.push(msg);
      else if (isVideoNoteAttachment(msg)) video.push(msg);
      else files.push(msg);
    }
    return { mediaMessages: media, voiceMessages: voice, videoMessages: video, fileMessages: files };
  }, [messages]);

  const tabs: { id: MediaTab; labelKey: string; count: number }[] = [
    { id: "media", labelKey: "chat.media.tab.media", count: mediaMessages.length },
    { id: "voice", labelKey: "chat.media.tab.voice", count: voiceMessages.length },
    { id: "video", labelKey: "chat.media.tab.video", count: videoMessages.length },
    { id: "files", labelKey: "chat.media.tab.files", count: fileMessages.length },
  ];

  const activeListMessages = activeTab === "voice"
    ? voiceMessages
    : activeTab === "video"
      ? videoMessages
      : fileMessages;

  // Lightbox
  const lightboxMsg = lightboxIndex !== null ? mediaMessages[lightboxIndex] : null;
  const lightboxAtt = lightboxMsg?.attachment;

  const handleLightboxNavigate = (delta: -1 | 1) => {
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      const next = prev + delta;
      return next >= 0 && next < mediaMessages.length ? next : prev;
    });
  };

  const handleGoToMessage = lightboxMsg
    ? () => {
        setLightboxIndex(null);
        onScrollToMessage(lightboxMsg.id);
      }
    : undefined;

  const handleLightboxDownload = () => {
    if (lightboxAtt?.localUrl) {
      triggerDownload(lightboxAtt.localUrl, lightboxAtt.fileName);
    }
  };

  return (
    <aside className={styles.panel} aria-label={t("chat.media.title")}>
      <div className={styles.header}>
        <span className={styles.title}>{t("chat.media.title")}</span>
        <IconButton
          size={28}
          variant="ghost"
          onClick={onClose}
          aria-label={t("chat.media.close")}
        >
          <IconClose size={13} strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className={styles.tabs} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
            {tab.count > 0 ? (
              <span className={styles.tabCount}>{tab.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={styles.content} role="tabpanel">
        {activeTab === "media" ? (
          <MediaGrid
            messages={mediaMessages}
            onOpen={setLightboxIndex}
            locale={locale}
          />
        ) : activeListMessages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              {activeTab === "voice" ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : activeTab === "video" ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 8.5l6 3.5-6 3.5V8.5Z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span>{t("chat.media.empty")}</span>
          </div>
        ) : (
          <ul className={styles.list}>
            {activeListMessages.map((msg) => (
              <MediaListItem
                key={msg.id}
                msg={msg}
                locale={locale}
                t={t}
                onScrollToMessage={onScrollToMessage}
              />
            ))}
          </ul>
        )}
      </div>

      {lightboxIndex !== null && lightboxAtt?.localUrl ? (
        <MediaLightbox
          isOpen
          url={lightboxAtt.localUrl}
          mimeType={lightboxAtt.mimeType}
          fileName={lightboxAtt.fileName}
          currentIndex={lightboxIndex}
          totalCount={mediaMessages.length}
          onClose={() => setLightboxIndex(null)}
          onDownload={handleLightboxDownload}
          onGoToMessage={handleGoToMessage}
          onNavigate={handleLightboxNavigate}
        />
      ) : null}
    </aside>
  );
});
