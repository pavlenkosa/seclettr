import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import type { PlainGroup } from "./types";
import type { PlainGroupsState } from "./plain-groups-store";
import {
  wireToPlainGroup,
  wireToPlainGroupMessage,
  type WireGroupHistoryResponse,
  type WireGroupListResponse,
} from "./plain-groups-wire";

/**
 * Group bootstrap / history runtime for the plain groups store.
 *
 * Extracted from the `plain-groups-store.ts` factory closure. Owns the group
 * list bootstrap and paginated message history, with the store `set/get` and
 * identity accessor passed in as explicit dependencies.
 *
 * Behavior is byte-for-byte identical to the previous in-store definitions:
 * `loadGroups` toggles `loadingGroups` and merges existing message/history
 * state into fresh group metadata; `loadHistory` is idempotent via
 * `historyLoaded`; `loadMoreHistory` prepends older pages.
 */
export interface PlainGroupsHistoryDeps {
  readonly set: StoreApi<PlainGroupsState>["setState"];
  readonly get: StoreApi<PlainGroupsState>["getState"];
  readonly getMyUserId: () => string | null;
}

export interface PlainGroupsHistoryRuntime {
  loadGroups: () => Promise<void>;
  loadHistory: (groupId: string) => Promise<void>;
  loadMoreHistory: (groupId: string) => Promise<void>;
}

export function createPlainGroupsHistoryRuntime(
  deps: PlainGroupsHistoryDeps
): PlainGroupsHistoryRuntime {
  const { set, get, getMyUserId } = deps;

  async function loadGroups(): Promise<void> {
    set({ loadingGroups: true });
    try {
      const data = await api.get<WireGroupListResponse>("/plain/groups");
      const groups: Record<string, PlainGroup> = {};
      for (const g of data.groups) {
        // Preserve existing messages if already loaded
        const existing = get().groups[g.id];
        groups[g.id] = {
          ...wireToPlainGroup(g),
          messages: existing?.messages ?? [],
          historyLoaded: existing?.historyLoaded ?? false,
          unreadCount: existing?.unreadCount ?? 0,
          nextCursor: existing?.nextCursor,
          hasMore: existing?.hasMore ?? false,
        };
      }
      set({ groups, loadingGroups: false });
    } catch (err) {
      logger.error("[PlainGroups] loadGroups failed", err);
      set({ loadingGroups: false });
    }
  }

  async function loadHistory(groupId: string): Promise<void> {
    const group = get().groups[groupId];
    if (group?.historyLoaded) return;

    try {
      const data = await api.get<WireGroupHistoryResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages?limit=50`
      );
      const myUserId = getMyUserId() ?? "";
      const messages = [...data.messages]
        .reverse()
        .map((w) => wireToPlainGroupMessage(w, myUserId));

      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages,
              lastMessageAt: messages.at(-1)?.timestamp ?? g.lastMessageAt,
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
              historyLoaded: true,
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] loadHistory failed", err);
    }
  }

  async function loadMoreHistory(groupId: string): Promise<void> {
    const group = get().groups[groupId];
    if (!group?.hasMore || !group.nextCursor) return;

    try {
      const data = await api.get<WireGroupHistoryResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages?limit=50&before=${encodeURIComponent(group.nextCursor)}`
      );
      const myUserId = getMyUserId() ?? "";
      const older = [...data.messages].reverse().map((w) => wireToPlainGroupMessage(w, myUserId));

      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: [...older, ...g.messages],
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] loadMoreHistory failed", err);
    }
  }

  return { loadGroups, loadHistory, loadMoreHistory };
}
