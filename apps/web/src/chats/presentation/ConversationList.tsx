import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { CallMessageMeta, Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import { usePlainPinsStore, type PlainConversation, type PlainGroup, type PlainPinKind } from "@/stores/plain";
import { useI18n } from "@/i18n";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { Avatar, MessageDeliveryStatusIcon, type MessageDeliveryStatus } from "@/components/ui";

import styles from "./ConversationList.module.css";

interface Props {
  readonly conversations: Conversation[];
  readonly groups?: GroupChat[];
  readonly plainConversations?: PlainConversation[];
  readonly plainGroups?: PlainGroup[];
  readonly activeId: string | null;
  readonly loading?: boolean;
  readonly loadingPlaceholderCount?: number;
  readonly onSelect: (selection: { kind: "direct" | "group" | "plain-direct" | "plain-group"; id: string }) => void;
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
  kind: "direct" | "group" | "plain-direct" | "plain-group";
  name: string;
  lastMessageAt: number;
  unreadCount: number;
  lastMessage?: EntryLastMessage;
  isEncrypted: boolean;
  /** Plain-only: pin overlay timestamp (ms). 0/undefined when not pinned. */
  pinnedAt?: number;
  /** Plain-only: kind to use when toggling the pin via API. */
  pinKind?: PlainPinKind;
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
    && left.isEncrypted === right.isEncrypted
    && left.pinnedAt === right.pinnedAt
    && left.pinKind === right.pinKind
    && areEntryLastMessagesEqual(left.lastMessage, right.lastMessage);
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 6;

const ConversationListItem = memo(function ConversationListItem({
  entry,
  isActive,
  locale,
  nowMs,
  t,
  onSelect,
  onTogglePin,
  enterDelayMs,
}: {
  entry: ConversationEntry;
  isActive: boolean;
  locale: string;
  nowMs: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  onSelect: (selection: { kind: "direct" | "group" | "plain-direct" | "plain-group"; id: string }) => void;
  onTogglePin: (entry: ConversationEntry) => void;
  enterDelayMs: number;
}) {
  const last = entry.lastMessage;
  const previewText = getPreviewText(last, t);
  const showOwnPrefix = Boolean(last?.isOwn && last.type !== "call");
  const isGroup = entry.kind === "group" || entry.kind === "plain-group";
  const senderPrefix = (
    last && !last.isOwn && isGroup && last.senderLabel
      ? `${last.senderLabel}: `
      : ""
  );
  const itemStyle = {
    "--conversation-enter-delay": `${enterDelayMs}ms`,
  } as CSSProperties;

  const [menuOpen, setMenuOpen] = useState(false);
  const canPin = !!entry.pinKind;

  // Long-press on touch / right-click on pointer triggers the pin menu. We
  // skip the menu entirely for E2EE entries until the feature lands there.
  // Stored in a ref so the timer survives re-renders during the gesture.
  const pressStateRef = useRef<{ id: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  const cancelPress = useCallback(() => {
    if (pressStateRef.current) {
      clearTimeout(pressStateRef.current.id);
      pressStateRef.current = null;
    }
  }, []);

  const startPress = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canPin || e.pointerType !== "touch") return;
    cancelPress();
    pressStateRef.current = {
      id: setTimeout(() => {
        setMenuOpen(true);
        pressStateRef.current = null;
        // Light haptic so the user knows the long-press fired before they release.
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          try { navigator.vibrate(8); } catch { /* ignore */ }
        }
      }, LONG_PRESS_MS),
      x: e.clientX,
      y: e.clientY,
    };
  };
  const movePress = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressStateRef.current;
    if (!press) return;
    if (
      Math.abs(e.clientX - press.x) > LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(e.clientY - press.y) > LONG_PRESS_MOVE_TOLERANCE_PX
    ) {
      cancelPress();
    }
  };

  useEffect(() => () => cancelPress(), [cancelPress]);

  const handleContextMenu = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (!canPin) return;
    e.preventDefault();
    setMenuOpen(true);
  };

  const handleTogglePin = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setMenuOpen(false);
    onTogglePin(entry);
  };

  // Close menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    globalThis.addEventListener("click", close);
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("click", close);
      globalThis.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <li className={styles.itemWrap}>
      <button
        className={`${styles.item} ${isActive ? styles.active : ""} ${entry.unreadCount > 0 ? styles.itemUnread : ""}`}
        style={itemStyle}
        onClick={() => onSelect({ kind: entry.kind, id: entry.id })}
        onContextMenu={handleContextMenu}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerMove={movePress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        data-testid={`conversation-entry:${entry.kind}:${entry.id}`}
        aria-current={isActive ? "true" : undefined}
      >
        <Avatar label={entry.name} size={50} fontSize="0.9rem" ariaHidden />

        <div className={styles.content}>
          <div className={styles.row}>
            <span className={styles.name}>
              {entry.name}
              {entry.isEncrypted && (
                <svg
                  className={styles.encryptedBadge}
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-label={t("conversation.encryptedBadgeAria")}
                >
                  <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
              {entry.pinnedAt ? (
                <svg
                  className={styles.pinBadge}
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-label={t("conversation.pinnedBadgeAria")}
                >
                  <path d="M9.55 1.4a.7.7 0 0 0-1.1 0L7.2 2.95l1.85 1.85L10.6 3.25a.7.7 0 0 0 0-1L9.55 1.4ZM6.5 3.65 3.85 6.3a1 1 0 0 0-.27.51l-.42 2.1 1.92-.38L7.7 5.9 6.5 3.65Zm.55 4.5L4.4 10.8l-2.5.5a.6.6 0 0 1-.7-.7l.5-2.5 2.65-2.65 2.7 2.7Zm.93-1.5L9.65 4.95l1.4 1.4-1.65 1.65-1.42-1.35Z" />
                </svg>
              ) : null}
            </span>
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
      {menuOpen && canPin ? (
        <div className={styles.contextMenu} role="menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={handleTogglePin}
            role="menuitem"
          >
            {entry.pinnedAt ? t("conversation.unpin") : t("conversation.pin")}
          </button>
        </div>
      ) : null}
    </li>
  );
}, (prev, next) => {
  return areConversationEntriesEqual(prev.entry, next.entry)
    && prev.isActive === next.isActive
    && prev.locale === next.locale
    && prev.nowMs === next.nowMs
    && prev.t === next.t
    && prev.onSelect === next.onSelect
    && prev.onTogglePin === next.onTogglePin
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
    isEncrypted: true,
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
    isEncrypted: true,
  };
}

function mapPlainLastMessage(last: PlainConversation["messages"][number] | undefined): EntryLastMessage | undefined {
  if (!last) return undefined;
  if (last.type === "call" && last.call) {
    return {
      type: "call",
      content: "",
      call: { mode: last.call.mode, direction: last.call.direction, outcome: last.call.outcome, durationSec: last.call.durationSec },
      isOwn: last.isOwn,
      status: last.status,
    };
  }
  return {
    type: last.type === "text" ? "text" : "attachment",
    content: last.content,
    attachment: last.attachment
      ? { kind: (["voice_note", "video_note"].includes(last.type) ? last.type : "file") as "file" | "voice_note" | "video_note", mimeType: last.attachment.contentType }
      : undefined,
    isOwn: last.isOwn,
    status: last.status,
  };
}

function mapPlainConversation(
  conv: PlainConversation,
  pinnedAt: number | undefined
): ConversationEntry {
  return {
    key: `plain-direct:${conv.userId}`,
    id: conv.userId,
    kind: "plain-direct",
    name: conv.username,
    lastMessageAt: conv.lastMessageAt,
    unreadCount: conv.unreadCount,
    lastMessage: mapPlainLastMessage(conv.messages.at(-1)),
    isEncrypted: false,
    pinnedAt,
    pinKind: "dm",
  };
}

function mapPlainGroupLastMessage(last: PlainGroup["messages"][number] | undefined): EntryLastMessage | undefined {
  if (!last) return undefined;
  return {
    type: last.type === "text" ? "text" : "attachment",
    content: last.content,
    isOwn: last.isOwn,
    status: last.status,
    senderLabel: last.isOwn ? undefined : last.senderName,
  };
}

function mapPlainGroup(
  group: PlainGroup,
  pinnedAt: number | undefined
): ConversationEntry {
  return {
    key: `plain-group:${group.groupId}`,
    id: group.groupId,
    kind: "plain-group",
    name: group.name,
    lastMessageAt: group.lastMessageAt,
    unreadCount: group.unreadCount,
    lastMessage: mapPlainGroupLastMessage(group.messages.at(-1)),
    isEncrypted: false,
    pinnedAt,
    pinKind: "group",
  };
}

export function ConversationList({
  conversations,
  groups = [],
  plainConversations = [],
  plainGroups = [],
  activeId,
  loading,
  loadingPlaceholderCount,
  onSelect,
}: Props) {
  const { t, locale } = useI18n();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pins = usePlainPinsStore((state) => state.pins);
  const pinChat = usePlainPinsStore((state) => state.pinChat);
  const unpinChat = usePlainPinsStore((state) => state.unpinChat);
  const sorted = useMemo<ConversationEntry[]>(() => {
    const directEntries = conversations.map(mapDirectConversation);
    const groupEntries = groups.map(mapGroupConversation);
    const plainDirectEntries = plainConversations.map((c) =>
      mapPlainConversation(c, pins[`dm:${c.userId}`]?.pinnedAt)
    );
    const plainGroupEntries = plainGroups.map((g) =>
      mapPlainGroup(g, pins[`group:${g.groupId}`]?.pinnedAt)
    );

    // Pinned entries float to the top, sorted by `pinnedAt DESC`. The rest of
    // the list keeps the existing recency order.
    return [...directEntries, ...groupEntries, ...plainDirectEntries, ...plainGroupEntries]
      .sort((a, b) => {
        const aPin = a.pinnedAt ?? 0;
        const bPin = b.pinnedAt ?? 0;
        if (aPin !== bPin) return bPin - aPin;
        return b.lastMessageAt - a.lastMessageAt;
      });
  }, [conversations, groups, pins, plainConversations, plainGroups]);

  const handleTogglePin = useCallback((entry: ConversationEntry) => {
    if (!entry.pinKind) return;
    if (entry.pinnedAt) {
      void unpinChat(entry.pinKind, entry.id);
    } else {
      void pinChat(entry.pinKind, entry.id);
    }
  }, [pinChat, unpinChat]);
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
    <ul className={styles.list} aria-label={t("conversation.listLabel")} data-testid="chat-thread-list">
      {sorted.map((entry, index) => (
        <ConversationListItem
          key={entry.key}
          entry={entry}
          isActive={activeId === entry.key}
          locale={locale}
          nowMs={nowMs}
          t={t}
          onSelect={onSelect}
          onTogglePin={handleTogglePin}
          enterDelayMs={Math.min(index, 10) * 16}
        />
      ))}
    </ul>
  );
}
