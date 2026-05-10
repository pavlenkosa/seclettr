import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n";
import { logger } from "@/lib/logger.js";
import { useMessagesStore } from "@/stores/messages";
import { useGroupsStore } from "@/stores/groups";
import { usePlainGroupsStore, usePlainMessagesStore } from "@/stores/plain";

interface UseChatSessionBootstrapOptions {
  onNotice: (message: string) => void;
}

export function useChatSessionBootstrap({ onNotice }: UseChatSessionBootstrapOptions): {
  historyLoaded: boolean;
  loadingGroups: boolean;
} {
  const { t } = useI18n();

  const {
    historyLoaded,
    loadHistory,
  } = useMessagesStore(useShallow((state) => ({
    historyLoaded: state.historyLoaded,
    loadHistory: state.loadHistory,
  })));

  const {
    loadingGroups,
    loadGroups,
  } = useGroupsStore(useShallow((state) => ({
    loadingGroups: state.loadingGroups,
    loadGroups: state.loadGroups,
  })));

  const { loadPlainGroups } = usePlainGroupsStore(useShallow((state) => ({
    loadPlainGroups: state.loadGroups,
  })));

  const { loadPlainConversationList } = usePlainMessagesStore(useShallow((state) => ({
    loadPlainConversationList: state.loadConversationList,
  })));

  useEffect(() => {
    loadHistory().catch((err) => {
      logger.warn("[ChatPage] loadHistory failed", err);
      onNotice(t("chat.error.loadHistoryFailed"));
    });
    loadGroups().catch((err) => {
      logger.warn("[ChatPage] loadGroups failed", err);
      onNotice(t("chat.error.loadGroupsFailed"));
    });
    loadPlainGroups().catch((err) => {
      logger.warn("[ChatPage] loadPlainGroups failed", err);
    });
    loadPlainConversationList().catch((err) => {
      logger.warn("[ChatPage] loadPlainConversationList failed", err);
    });
  }, [
    loadGroups,
    loadHistory,
    loadPlainGroups,
    loadPlainConversationList,
    onNotice,
    t,
  ]);

  return { historyLoaded, loadingGroups };
}
