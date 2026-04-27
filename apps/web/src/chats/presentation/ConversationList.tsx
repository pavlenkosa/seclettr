import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CallMessageMeta, Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import { useI18n } from "@/i18n";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { Avatar, MessageDeliveryStatusIcon, type MessageDeliveryStatus } from "@/components/ui";

import styles from "./ConversationList.module.css";

interface Props {
  readonly conversations: Conversation[];
  readonly groups?: GroupChat[];
  readonly activeId: string | null;
  readonly loading?: boolean;
  readonly loadingPlaceholderCount?: number;
  readonly onSelect: (selection: { kind: "direct" | "group"; id: string }) => void;
}

type PreviewStatus = "sending" | "sent" | "delivered" | "read" | "error";

interface EntryLastMessage {
  type: "text" | "attachment" | "call";
  content: string;
  attachment?: {
    kind?: "file" | "voice_note" | "video_note";
    mimeType: string;
  };
  call?: CallMessageMeta;
  isOwn: boolean;
  status: PreviewStatus;
  senderLabel?: string;
}

interface ConversationEntry {
  key: string;
  id: string;
  kind: "direct" | "group";
  name: string;
  lastMessageAt: number;
  unreadCount: number;
  lastMessage?: EntryLastMessage;
}

const CONVERSATION_TIME_REFRESH_MS = 60_000;
type DirectConversationMessage = Conversation["messages"][number];
type GroupConversationMessage = GroupChat["messages"][number];
type ConversationTranslateFn = (key: string, params?: Record<string, string | number>) => string;

function formatTime(
  ms: number,
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  nowMs = Date.now()
): string {
  if (!ms) return "";
  const diff = nowMs - ms;
  if (diff < 60_000) return t("conversation.now");
  if (diff < 3_600_000) return t("conversation.minutesShort", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) {
    return new Date(ms).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  }
  return new Date(ms).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function getPreviewText(
  last: EntryLastMessage | undefined,
  t: ConversationTranslateFn
): string {
  if (!last) return "";

  if (last.type === "call" && last.call) {
    return getCallPreviewText(last.call, t);
  }

  if (last.type === "attachment") {
    return getAttachmentPreviewText(last, t);
  }

  if (last.content === "[encrypted message]" || last.content === "[encrypted group message]") {
    return t("conversation.encryptedMessagePreview");
  }

  return last.content;
}

function getCallPreviewText(call: NonNullable<EntryLastMessage["call"]>, t: ConversationTranslateFn): string {
  const directionLabel = call.direction === "outbound"
    ? t("call.log.outbound")
    : t("call.log.inbound");
  const modeLabel = call.mode === "video"
    ? t("call.videoCall")
    : t("call.voiceCall");
  const outcomeLabel = t(`call.log.${call.outcome}`);
  return `${directionLabel} ${modeLabel}: ${outcomeLabel}`;
}

function getAttachmentPreviewText(last: EntryLastMessage, t: ConversationTranslateFn): string {
  const attachment = last.attachment;

  if (attachment?.kind === "voice_note" || attachment?.mimeType.startsWith("audio/")) {
    return t("conversation.voiceNotePreview");
  }

  if (attachment?.kind === "video_note" || attachment?.mimeType.startsWith("video/")) {
    return t("conversation.videoNotePreview");
  }

  if (last.content === "[attachment]") {
    return t("conversation.attachmentPreview");
  }

  return last.content === "[invalid attachment]"
    ? t("conversation.invalidAttachmentPreview")
    : last.content;
}

function renderPreviewStatus(status: PreviewStatus) {
  if (status === "error") {
    return <span className={`${styles.previewStatus} ${styles.previewStatusError}`} aria-hidden="true">!</span>;
  }

  return (
    <span className={styles.previewStatus} aria-hidden="true">
      <MessageDeliveryStatusIcon status={status as MessageDeliveryStatus} size={12} />
    </span>
  );
}

function areEntryLastMessagesEqual(left?: EntryLastMessage, right?: EntryLastMessage): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return left.type === right.type
    && left.content === right.content
    && left.attachment?.kind === right.attachment?.kind
    && left.attachment?.mimeType === right.attachment?.mimeType
    && left.call === right.call
    && left.isOwn === right.isOwn
    && left.status === right.status
    && left.senderLabel === right.senderLabel;
}

function areConversationEntriesEqual(left: ConversationEntry, right: ConversationEntry): boolean {
  return left.key === right.key
    && left.id === right.id
    && left.kind === right.kind
    && left.name === right.name
    && left.lastMessageAt === right.lastMessageAt
    && left.unreadCount === right.unreadCount
    && areEntryLastMessagesEqual(left.lastMessage, right.lastMessage);
}

const ConversationListItem = memo(function ConversationListItem({
  entry,
  isActive,
  locale,
  nowMs,
  t,
  onSelect,
  enterDelayMs,
}: {
  entry: ConversationEntry;
  isActive: boolean;
  locale: string;
  nowMs: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  onSelect: (selection: { kind: "direct" | "group"; id: string }) => void;
  enterDelayMs: number;
}) {
  const last = entry.lastMessage;
  const previewText = getPreviewText(last, t);
  const showOwnPrefix = Boolean(last?.isOwn && last.type !== "call");
  const senderPrefix = (
    last && !last.isOwn && entry.kind === "group" && last.senderLabel
      ? `${last.senderLabel}: `
      : ""
  );
  const itemStyle = {
    "--conversation-enter-delay": `${enterDelayMs}ms`,
  } as CSSProperties;

  return (
    <li role="none">
      <button
        className={`${styles.item} ${isActive ? styles.active : ""} ${entry.unreadCount > 0 ? styles.itemUnread : ""}`}
        style={itemStyle}
        onClick={() => onSelect({ kind: entry.kind, id: entry.id })}
        data-testid={`conversation-entry:${entry.kind}:${entry.id}`}
        role="option"
        aria-selected={isActive}
      >
        <Avatar label={entry.name} size={50} fontSize="0.9rem" ariaHidden />

        <div className={styles.content}>
          <div className={styles.row}>
            <span className={styles.name}>{entry.name}</span>
            {entry.lastMessageAt > 0 && (
              <span className={styles.time}>{formatTime(entry.lastMessageAt, locale, t, nowMs)}</span>
            )}
          </div>
          {last && (
            <div className={styles.row}>
              <span className={`${styles.preview} truncate`}>
                {showOwnPrefix ? (
                  <span className={styles.previewOwn}>
                    {renderPreviewStatus(last.status)}
                    {t("conversation.youPrefix")}
                  </span>
                ) : null}
                {!last.isOwn && senderPrefix}
                {previewText}
              </span>
              {entry.unreadCount > 0 && (
                <span className={styles.badge}>{entry.unreadCount}</span>
              )}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}, (prev, next) => {
  return areConversationEntriesEqual(prev.entry, next.entry)
    && prev.isActive === next.isActive
    && prev.locale === next.locale
    && prev.nowMs === next.nowMs
    && prev.t === next.t
    && prev.onSelect === next.onSelect
    && prev.enterDelayMs === next.enterDelayMs;
});

const MIN_LOADING_PLACEHOLDERS = 3;
const DEFAULT_LOADING_PLACEHOLDERS = 5;
const MAX_LOADING_PLACEHOLDERS = 8;

function clampLoadingPlaceholderCount(count: number | undefined): number {
  if (!count || !Number.isFinite(count)) {
    return DEFAULT_LOADING_PLACEHOLDERS;
  }
  return Math.min(
    MAX_LOADING_PLACEHOLDERS,
    Math.max(MIN_LOADING_PLACEHOLDERS, Math.round(count))
  );
}

function mapDirectLastMessage(last: DirectConversationMessage | undefined): EntryLastMessage | undefined {
  if (!last) {
    return undefined;
  }

  return {
    type: last.type,
    content: last.content,
    attachment: last.attachment
      ? {
        kind: last.attachment.kind,
        mimeType: last.attachment.mimeType,
      }
      : undefined,
    call: last.call,
    isOwn: last.isOwn,
    status: last.status,
  };
}

function mapGroupLastMessage(last: GroupConversationMessage | undefined): EntryLastMessage | undefined {
  if (!last) {
    return undefined;
  }

  return {
    type: "text",
    content: last.content,
    isOwn: last.isOwn,
    status: last.status,
    senderLabel: last.senderLabel,
  };
}

function mapDirectConversation(conversation: Conversation): ConversationEntry {
  return {
    key: `direct:${conversation.userId}`,
    id: conversation.userId,
    kind: "direct",
    name: conversation.username,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
    lastMessage: mapDirectLastMessage(conversation.messages.at(-1)),
  };
}

function mapGroupConversation(group: GroupChat): ConversationEntry {
  return {
    key: `group:${group.groupId}`,
    id: group.groupId,
    kind: "group",
    name: group.name,
    lastMessageAt: group.lastMessageAt,
    unreadCount: group.unreadCount,
    lastMessage: mapGroupLastMessage(group.messages.at(-1)),
  };
}

export function ConversationList({
  conversations,
  groups = [],
  activeId,
  loading,
  loadingPlaceholderCount,
  onSelect,
}: Props) {
  const { t, locale } = useI18n();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sorted = useMemo<ConversationEntry[]>(() => {
    const directEntries = conversations.map(mapDirectConversation);
    const groupEntries = groups.map(mapGroupConversation);

    return [...directEntries, ...groupEntries].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [conversations, groups]);
  const hasRelativeTimeLabels = useMemo(
    () => sorted.some((entry) => entry.lastMessageAt > 0 && nowMs - entry.lastMessageAt < 3_600_000),
    [nowMs, sorted]
  );
  const [rememberedListSize, setRememberedListSize] = useState(() =>
    clampLoadingPlaceholderCount(loadingPlaceholderCount)
  );

  useEffect(() => {
    if (!hasRelativeTimeLabels) return;
    const timerId = setInterval(() => {
      setNowMs(Date.now());
    }, CONVERSATION_TIME_REFRESH_MS);
    return () => clearInterval(timerId);
  }, [hasRelativeTimeLabels]);

  useEffect(() => {
    if (sorted.length > 0) {
      setRememberedListSize(clampLoadingPlaceholderCount(sorted.length));
    }
  }, [sorted.length]);

  const resolvedLoadingPlaceholderCount = clampLoadingPlaceholderCount(
    Math.max(loadingPlaceholderCount ?? 0, rememberedListSize)
  );

  if (sorted.length === 0 && loading) {
    return (
      <ul className={styles.list} aria-busy="true" aria-label={t("conversation.loading")} data-testid="chat-thread-list">
        {Array.from({ length: resolvedLoadingPlaceholderCount }, (_, i) => (
          <li key={i} className={styles.skeletonItem} aria-hidden="true">
            <div className={styles.skeletonAvatar} />
            <div className={styles.skeletonContent}>
              <div className={styles.skeletonLine} style={{ width: `${56 + i * 14}%` }} />
              <div className={styles.skeletonLine} style={{ width: `${38 + i * 8}%`, opacity: 0.6 }} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyMark} aria-hidden="true">
          <SeclettrMark decorative />
        </span>
        <span>{t("conversation.empty.line1")}</span>
        <span>{t("conversation.empty.line2")}</span>
      </div>
    );
  }

  return (
    <div className={styles.list} role="listbox" aria-label={t("conversation.listLabel")} data-testid="chat-thread-list">
      {sorted.map((entry, index) => (
        <ConversationListItem
          key={entry.key}
          entry={entry}
          isActive={activeId === entry.key}
          locale={locale}
          nowMs={nowMs}
          t={t}
          onSelect={onSelect}
          enterDelayMs={Math.min(index, 10) * 16}
        />
      ))}
    </div>
  );
}
