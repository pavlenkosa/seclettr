import { memo, useId, useMemo, useState } from "react";
import type { Message } from "@/stores/messages";
import { useI18n } from "@/i18n";
import { IconButton } from "@/components/ui";
import {
  IconArrowRight,
  IconClose,
  IconFileDocument,
  IconImage,
  IconMic,
  IconVideoCircle,
  IconVideoPlay,
} from "@/components/ui/icons";
import { MediaLightbox } from "@/components/common/MediaLightbox";
import { formatClock } from "./message-list/message-list-presentation";
import styles from "./SharedMediaPanel.module.css";

type MediaTab = "media" | "voice" | "video" | "files";

interface Props {
  readonly messages: Message[];
  readonly onScrollToMessage: (messageId: string) => void;
  readonly onClose: () => void;
}

function categorizeMessages(messages: Message[]) {
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
            <IconImage size={32} />
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
                <IconImage size={20} />
              </span>
            )}
            {isGif ? (
              <span className={styles.gridBadge}>GIF</span>
            ) : null}
            {isVideo ? (
              <span className={styles.gridPlayIcon} aria-hidden="true">
                <IconVideoPlay />
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
          <IconMic size={18} />
        ) : isVideo ? (
          <IconVideoCircle size={18} />
        ) : (
          <IconFileDocument size={18} />
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
        <IconArrowRight />
      </button>
    </li>
  );
}

function TabBar({
  tabs,
  activeTab,
  onSetTab,
  tabIdPrefix,
  tabPanelId,
  label,
}: {
  readonly tabs: { id: MediaTab; labelKey: string; count: number }[];
  readonly activeTab: MediaTab;
  readonly onSetTab: (id: MediaTab) => void;
  readonly tabIdPrefix: string;
  readonly tabPanelId: string;
  readonly label: string;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`${tabIdPrefix}-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={tabPanelId}
          className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
          onClick={() => onSetTab(tab.id)}
        >
          {t(tab.labelKey)}
          {tab.count > 0 ? (
            <span className={styles.tabCount}>{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function EmptyTabState({ activeTab }: { readonly activeTab: MediaTab }) {
  const { t } = useI18n();
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        {activeTab === "voice" ? (
          <IconMic size={32} />
        ) : activeTab === "video" ? (
          <IconVideoCircle size={32} />
        ) : (
          <IconFileDocument size={32} />
        )}
      </span>
      <span>{t("chat.media.empty")}</span>
    </div>
  );
}

export const SharedMediaPanel = memo(function SharedMediaPanel({
  messages,
  onScrollToMessage,
  onClose,
}: Props) {
  const id = useId();
  const tabPanelId = `${id}-panel`;
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<MediaTab>("media");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { mediaMessages, voiceMessages, videoMessages, fileMessages } = useMemo(
    () => categorizeMessages(messages),
    [messages],
  );

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

      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onSetTab={setActiveTab}
        tabIdPrefix={id}
        tabPanelId={tabPanelId}
        label={t("chat.media.title")}
      />

      <div
        className={styles.content}
        role="tabpanel"
        id={tabPanelId}
        aria-labelledby={`${id}-tab-${activeTab}`}
      >
        {activeTab === "media" ? (
          <MediaGrid
            messages={mediaMessages}
            onOpen={setLightboxIndex}
            locale={locale}
          />
        ) : activeListMessages.length === 0 ? (
          <EmptyTabState activeTab={activeTab} />
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
