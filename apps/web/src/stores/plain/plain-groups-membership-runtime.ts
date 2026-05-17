import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type { PlainGroupsState } from "./plain-groups-store";
import { wireToPlainGroup, type WirePlainGroup } from "./plain-groups-wire";

/**
 * Group membership / domain-mutation runtime for the plain groups store.
 *
 * Extracted from the `plain-groups-store.ts` factory closure. Owns group
 * creation, rename, and member add/remove/role changes, with the store
 * `set/get` and identity accessor passed in as explicit dependencies.
 *
 * Behavior is byte-for-byte identical to the previous in-store definitions:
 * `renameGroup` updates optimistically and rolls back on failure;
 * `updateMemberRole` mirrors the server's owner-transfer demotion locally and
 * rolls back on failure; `removeMember` drops the whole group on self-leave but
 * only filters membership when removing another member.
 */
export interface PlainGroupsMembershipDeps {
  readonly set: StoreApi<PlainGroupsState>["setState"];
  readonly get: StoreApi<PlainGroupsState>["getState"];
  readonly getMyUserId: () => string | null;
}

export interface PlainGroupsMembershipRuntime {
  createGroup: (name: string, memberUserIds: string[]) => Promise<string>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  addMember: (groupId: string, userId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  updateMemberRole: (groupId: string, userId: string, role: "owner" | "admin" | "member") => Promise<void>;
}

export function createPlainGroupsMembershipRuntime(
  deps: PlainGroupsMembershipDeps
): PlainGroupsMembershipRuntime {
  const { set, get, getMyUserId } = deps;

  async function createGroup(name: string, memberUserIds: string[]): Promise<string> {
    const data = await api.post<WirePlainGroup>("/plain/groups", {
      version: PLAIN_PROTOCOL_VERSION,
      name,
      memberUserIds,
    });
    const group = wireToPlainGroup(data);
    set((state) => ({
      groups: { ...state.groups, [group.groupId]: group },
    }));
    return group.groupId;
  }

  async function addMember(groupId: string, userId: string): Promise<void> {
    await api.post(`/plain/groups/${encodeURIComponent(groupId)}/members`, { userId });
    // Reload group to get updated member list
    const data = await api.get<WirePlainGroup>(`/plain/groups/${encodeURIComponent(groupId)}`);
    const updated = wireToPlainGroup(data);
    set((state) => {
      const existing = state.groups[groupId];
      if (!existing) return state;
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...existing,
            members: updated.members,
          },
        },
      };
    });
  }

  async function renameGroup(groupId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = get().groups[groupId];
    // Optimistic update so the modal header / sidebar entry feel snappy.
    if (previous) {
      set((state) => ({
        groups: { ...state.groups, [groupId]: { ...previous, name: trimmed } },
      }));
    }
    try {
      await api.patch<{ id: string; name: string; updatedAt: string }>(
        `/plain/groups/${encodeURIComponent(groupId)}`,
        { name: trimmed }
      );
    } catch (err) {
      logger.error("[PlainGroups] renameGroup failed", err);
      // Roll back on failure.
      if (previous) {
        set((state) => ({
          groups: { ...state.groups, [groupId]: previous },
        }));
      }
      throw err;
    }
  }

  async function updateMemberRole(
    groupId: string,
    userId: string,
    role: "owner" | "admin" | "member"
  ): Promise<void> {
    const previous = get().groups[groupId];
    const myUserId = getMyUserId();
    if (previous) {
      // Promoting someone else to owner is a transfer — the server demotes the
      // current owner to admin in the same transaction. Mirror that locally
      // so the UI doesn't briefly show two owners.
      const isTransfer = role === "owner" && myUserId !== null && userId !== myUserId;
      set((state) => ({
        groups: {
          ...state.groups,
          [groupId]: {
            ...previous,
            members: previous.members.map((m) => {
              if (m.userId === userId) return { ...m, role };
              if (isTransfer && m.userId === myUserId && m.role === "owner") {
                return { ...m, role: "admin" as const };
              }
              return m;
            }),
          },
        },
      }));
    }
    try {
      await api.patch(
        `/plain/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
        { role }
      );
    } catch (err) {
      logger.error("[PlainGroups] updateMemberRole failed", err);
      if (previous) {
        set((state) => ({ groups: { ...state.groups, [groupId]: previous } }));
      }
      throw err;
    }
  }

  async function removeMember(groupId: string, userId: string): Promise<void> {
    await api.delete(
      `/plain/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`
    );
    const myUserId = getMyUserId();
    if (userId === myUserId) {
      // Left group — remove from store
      set((state) => {
        const { [groupId]: _removed, ...rest } = state.groups;
        return { groups: rest };
      });
    } else {
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              members: g.members.filter((m) => m.userId !== userId),
            },
          },
        };
      });
    }
  }

  return { createGroup, renameGroup, addMember, removeMember, updateMemberRole };
}
