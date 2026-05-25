import { usePlainMessagesStore } from "@/stores/plain/messages/plain-messages-store";
import { usePlainGroupsStore } from "@/stores/plain/groups/plain-groups-store";

type PushActionMessage = {
  type: "push:action";
  action: string;
  data: Record<string, string>;
};

function isBadgingSupported(): boolean {
  return "setAppBadge" in navigator;
}

export function setAppBadge(count: number): void {
  if (!isBadgingSupported()) return;
  if (count > 0) {
    void (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(count);
  } else {
    void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
  }
}

function handleMarkRead(data: Record<string, string>): void {
  if (data.type === "message" && data.fromUserId) {
    usePlainMessagesStore.getState().markRead(data.fromUserId);
  } else if (data.type === "group_message" && data.groupId) {
    usePlainGroupsStore.getState().markRead(data.groupId);
  }
}

export function initPushActionHandler(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const msg = event.data as PushActionMessage | null;
    if (!msg || msg.type !== "push:action") return;
    if (msg.action === "mark-read") {
      handleMarkRead(msg.data);
    }
  });
}

export function getTotalUnreadCount(): number {
  const dmConversations = Object.values(usePlainMessagesStore.getState().conversations);
  const groupConversations = Object.values(usePlainGroupsStore.getState().groups);
  const dmUnread = dmConversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const groupUnread = groupConversations.reduce((sum, g) => sum + g.unreadCount, 0);
  return dmUnread + groupUnread;
}
