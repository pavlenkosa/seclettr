import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import { usePlainPinsStore, type PlainConversation, type PlainGroup } from "@/stores/plain";
import { useI18n } from "@/i18n";
import { SeclettrMark } from "@/components/common/SeclettrMark";

import styles from "./ConversationList.module.css";
import { ConversationListRow } from "./conversation-list/ConversationListRow";
import {
  buildConversationEntries,
  clampLoadingPlaceholderCount,
  type ConversationEntry,
  type ConversationSelection,
} from "./conversation-list/conversation-list-helpers";

interface Props {
  readonly conversations: Conversation[];
  readonly groups?: GroupChat[];
  readonly plainConversations?: PlainConversation[];
  readonly plainGroups?: PlainGroup[];
  readonly activeId: string | null;
  readonly loading?: boolean;
  readonly loadingPlaceholderCount?: number;
  readonly onSelect: (selection: ConversationSelection) => void;
}

const CONVERSATION_TIME_REFRESH_MS = 60_000;

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
    return buildConversationEntries({
      conversations,
      groups,
      pins,
      plainConversations,
      plainGroups,
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
          <ConversationListRow
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
