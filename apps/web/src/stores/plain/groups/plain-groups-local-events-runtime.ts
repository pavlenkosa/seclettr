import type { StoreApi } from "zustand";
import { wsClient } from "@/lib/websocket";
import type { PlainGroupsState } from "./plain-groups-store";

/**
 * Local-events runtime for the plain groups store.
 *
 * Owns the actions that mutate local group state without a server round trip:
 * local unread reset and store reset.
 */
export interface PlainGroupsLocalEventsDeps {
  readonly set: StoreApi<PlainGroupsState>["setState"];
}

export interface PlainGroupsLocalEventsRuntime {
  markRead: (groupId: string) => void;
  reset: () => void;
}

export function createPlainGroupsLocalEventsRuntime(
  deps: PlainGroupsLocalEventsDeps
): PlainGroupsLocalEventsRuntime {
  const { set } = deps;

  function markRead(groupId: string): void {
    set((state) => {
      const g = state.groups[groupId];
      if (!g || g.unreadCount === 0) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, unreadCount: 0 } } };
    });
  }

  function reset(): void {
    set({ groups: {}, loadingGroups: false, wsConnected: wsClient.connected });
  }

  return { markRead, reset };
}
