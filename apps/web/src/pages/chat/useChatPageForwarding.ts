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
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);

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
    setForwardMessageId(messageId);
  }, []);

  const handleCloseForwardPicker = useCallback(() => {
    setForwardMessageId(null);
  }, []);

  const handleForwardSend = useCallback((target: ForwardTarget) => {
    const message = activeMessages.find((entry) => entry.id === forwardMessageId);
    if (!message || !message.content) return;

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

    setForwardMessageId(null);
  }, [
    activeMessages,
    forwardMessageId,
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
    handleCloseForwardPicker,
    handleForwardSend,
  };
}
