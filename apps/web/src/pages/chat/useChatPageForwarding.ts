/**
 * useChatPageForwarding — owns plain/saved forward-overlay state for ChatPage.
 *
 * Owns:
 *   - Pending message id selected for forwarding
 *   - Forward-target projection for saved/plain threads
 *   - Final forwarded text shaping with sender attribution
 *
 * Does not own message-store lookup or modal rendering internals.
 */
import { useCallback, useMemo, useState } from "react";
import type { ForwardTarget } from "@/chats/presentation/modals/ForwardPickerModal";
import type { Message } from "@/stores/messages";
import type { WorkspaceEntryState } from "./chat-page-types";

interface UseChatPageForwardingParams {
  activeMessages: Message[];
  username: string | null;
  groupSenderLabels: WorkspaceEntryState["groupSenderLabels"];
  activePlainConversation: WorkspaceEntryState["activePlainConversation"];
  plainConversationEntries: WorkspaceEntryState["plainConversationEntries"];
  plainGroupEntries: WorkspaceEntryState["plainGroupEntries"];
  sendSavedMessage: WorkspaceEntryState["sendSavedMessage"];
  sendPlainText: WorkspaceEntryState["sendPlainText"];
  sendPlainGroupText: WorkspaceEntryState["sendPlainGroupText"];
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useChatPageForwarding(params: UseChatPageForwardingParams) {
  const {
    activeMessages,
    username,
    groupSenderLabels,
    activePlainConversation,
    plainConversationEntries,
    plainGroupEntries,
    sendSavedMessage,
    sendPlainText,
    sendPlainGroupText,
    t,
  } = params;
  // null → picker closed; array → messages pending forward (1 or many)
  const [forwardMessageIds, setForwardMessageIds] = useState<string[] | null>(null);
  const forwardMessageId = forwardMessageIds?.[0] ?? null;

  const forwardTargets = useMemo<ForwardTarget[]>(() => {
    const savedTarget: ForwardTarget = { kind: "saved", id: "saved", name: t("saved.title") };
    const dmTargets: ForwardTarget[] = plainConversationEntries.map((c) => ({
      kind: "plain-direct" as const,
      id: c.userId,
      name: c.username,
    }));
    const groupTargets: ForwardTarget[] = plainGroupEntries.map((g) => ({
      kind: "plain-group" as const,
      id: g.groupId,
      name: g.name,
    }));
    const rest = [...dmTargets, ...groupTargets].sort((a, b) => a.name.localeCompare(b.name));
    return [savedTarget, ...rest];
  }, [plainConversationEntries, plainGroupEntries, t]);

  const handleForwardMessage = useCallback((messageId: string) => {
    setForwardMessageIds([messageId]);
  }, []);

  const handleBulkForwardMessage = useCallback((messageIds: string[]) => {
    if (messageIds.length > 0) setForwardMessageIds(messageIds);
  }, []);

  const handleCloseForwardPicker = useCallback(() => {
    setForwardMessageIds(null);
  }, []);

  const handleForwardSend = useCallback((target: ForwardTarget) => {
    if (!forwardMessageIds || forwardMessageIds.length === 0) return;

    for (const msgId of forwardMessageIds) {
      const message = activeMessages.find((entry) => entry.id === msgId);
      if (!message || !message.content) continue;

      const senderLabel = message.isOwn
        ? `@${username ?? "me"}`
        : (groupSenderLabels?.[message.id] ?? `@${activePlainConversation?.username ?? "unknown"}`);
      const attribution = t("forward.attribution", { sender: senderLabel });
      const text = `${attribution}\n\n${message.content}`;

      if (target.kind === "saved") {
        void sendSavedMessage(text);
      } else if (target.kind === "plain-direct") {
        void sendPlainText(target.id, target.name, text);
      } else {
        void sendPlainGroupText(target.id, text);
      }
    }

    setForwardMessageIds(null);
  }, [
    activeMessages,
    forwardMessageIds,
    username,
    groupSenderLabels,
    activePlainConversation,
    t,
    sendSavedMessage,
    sendPlainText,
    sendPlainGroupText,
  ]);

  return {
    forwardMessageId,
    forwardTargets,
    handleForwardMessage,
    handleBulkForwardMessage,
    handleCloseForwardPicker,
    handleForwardSend,
  };
}
