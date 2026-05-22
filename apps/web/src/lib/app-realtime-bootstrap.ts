/**
 * app-realtime-bootstrap — app-boot listener attachment for chat/group/plain stores.
 *
 * Owns:
 *   - attaching the long-lived websocket listeners used by encrypted chats,
 *     encrypted groups, plain chats, and plain groups
 *   - app-badge refresh subscriptions that mirror unread totals from plain stores
 *   - returning one cleanup function that mirrors exactly what this module attached
 *
 * Does not own:
 *   - auth/session restore orchestration
 *   - websocket connection establishment
 *   - store business logic or message/group runtime behavior
 */
import { useGroupsStore } from "@/stores/groups";
import { useMessagesStore } from "@/stores/messages";
import { usePlainGroupsStore, usePlainMessagesStore } from "@/stores/plain";

function isBadgingSupported(): boolean {
  return "setAppBadge" in navigator;
}

function setAppBadge(count: number): void {
  if (!isBadgingSupported()) return;
  if (count > 0) {
    void (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(count);
  } else {
    void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
  }
}

function getTotalUnreadCount(): number {
  const dmConversations = Object.values(usePlainMessagesStore.getState().conversations);
  const groupConversations = Object.values(usePlainGroupsStore.getState().groups);
  const dmUnread = dmConversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const groupUnread = groupConversations.reduce((sum, group) => sum + group.unreadCount, 0);
  return dmUnread + groupUnread;
}

export function startAppRealtimeListeners(): () => void {
  const stopMessagesListening = useMessagesStore.getState().startListening();
  const stopGroupsListening = useGroupsStore.getState().startListening();
  const stopPlainMessagesListening = usePlainMessagesStore.getState().subscribe();
  const stopPlainGroupsListening = usePlainGroupsStore.getState().subscribe();

  const unsubBadgeDm = usePlainMessagesStore.subscribe(() => {
    setAppBadge(getTotalUnreadCount());
  });
  const unsubBadgeGroups = usePlainGroupsStore.subscribe(() => {
    setAppBadge(getTotalUnreadCount());
  });

  return () => {
    stopMessagesListening();
    stopGroupsListening();
    stopPlainMessagesListening();
    stopPlainGroupsListening();
    unsubBadgeDm();
    unsubBadgeGroups();
  };
}
