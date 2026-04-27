import { memo, useMemo, useState } from "react";
import type { Message } from "@/stores/messages";
import { useI18n } from "@/i18n";
import { formatClock } from "./message-list/message-list-presentation";
import styles from "./SharedMediaPanel.module.css";

type MediaTab = "voice" | "video" | "files";

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

type MediaKind = "voice" | "video" | "files";

function EmptyTabIcon({ kind }: { readonly kind: MediaKind }) {
  if (kind === "voice") {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 10l6-3v10l-6-3V10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ItemIcon({ isVoice, isVideo }: { readonly isVoice: boolean; readonly isVideo: boolean }) {
  if (isVoice) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (isVideo) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 10l6-3v10l-6-3V10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export const SharedMediaPanel = memo(function SharedMediaPanel({
  messages,
  onScrollToMessage,
  onClose,
}: Props) {
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<MediaTab>("voice");

  const { voiceMessages, videoMessages, fileMessages } = useMemo(() => {
    const voice: Message[] = [];
    const video: Message[] = [];
    const files: Message[] = [];

    for (const message of messages) {
      if (message.attachment?.kind === "voice_note") {
        voice.push(message);
      } else if (message.attachment?.kind === "video_note") {
        video.push(message);
      } else if (message.attachment?.kind === "file") {
        files.push(message);
      }
    }

    return {
      voiceMessages: voice,
      videoMessages: video,
      fileMessages: files,
    };
  }, [messages]);

  const tabs: { id: MediaTab; labelKey: string; count: number }[] = [
    { id: "voice", labelKey: "chat.media.tab.voice", count: voiceMessages.length },
    { id: "video", labelKey: "chat.media.tab.video", count: videoMessages.length },
    { id: "files", labelKey: "chat.media.tab.files", count: fileMessages.length },
  ];

  let activeMessages: typeof voiceMessages;
  if (activeTab === "voice") {
    activeMessages = voiceMessages;
  } else if (activeTab === "video") {
    activeMessages = videoMessages;
  } else {
    activeMessages = fileMessages;
  }

  return (
    <aside className={styles.panel} aria-label={t("chat.media.title")}>
      <div className={styles.header}>
        <span className={styles.title}>{t("chat.media.title")}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t("chat.media.close")}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
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
            {tab.count > 0 && (
              <span className={styles.tabCount}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.content} role="tabpanel">
        {activeMessages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <EmptyTabIcon kind={activeTab} />
            </span>
            <span>{t("chat.media.empty")}</span>
          </div>
        ) : (
          <ul className={styles.list}>
            {activeMessages.map((msg) => {
              const att = msg.attachment;
              if (!att) return null;
              const isVoice = att.kind === "voice_note";
              const isVideo = att.kind === "video_note";
              let label: string;
              if (isVoice) {
                label = t("chat.media.voiceNote");
              } else if (isVideo) {
                label = t("chat.media.videoNote");
              } else {
                label = att.fileName ?? t("chat.media.unknownFile");
              }
              let meta: string | null;
              if (att.durationMs) {
                meta = formatClock(Math.floor(att.durationMs / 1000));
              } else if (att.size) {
                meta = formatSize(att.size);
              } else {
                meta = null;
              }

              return (
                <li key={msg.id} className={styles.item}>
                  <span className={styles.itemIcon} aria-hidden="true">
                    <ItemIcon isVoice={isVoice} isVideo={isVideo} />
                  </span>
                  <div className={styles.itemBody}>
                    <span className={styles.itemLabel}>{label}</span>
                    <span className={styles.itemMeta}>
                      {meta && <span>{meta}</span>}
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
            })}
          </ul>
        )}
      </div>
    </aside>
  );
});
