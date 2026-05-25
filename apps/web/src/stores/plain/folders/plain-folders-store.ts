import { create } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import type { PlainPinKind } from "../pins/plain-pins-store";

export interface PlainFolder {
  folderId: string;
  name: string;
  displayOrder: number;
  createdAt: string;
}

// "dm:uuid" | "group:uuid" → folderId
type ChatFolderMap = Record<string, string>;

interface WireFolder {
  folderId: string;
  name: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface WireEntry {
  folderId: string;
  peerKind: PlainPinKind;
  peerId: string;
}

interface WireFolderListResponse {
  folders: WireFolder[];
  entries: WireEntry[];
}

function entryKey(peerKind: PlainPinKind, peerId: string): string {
  return `${peerKind}:${peerId}`;
}

function wireToFolder(wire: WireFolder): PlainFolder {
  return {
    folderId: wire.folderId,
    name: wire.name,
    displayOrder: wire.displayOrder,
    createdAt: wire.createdAt,
  };
}

export interface PlainFoldersState {
  /** Ordered by displayOrder then createdAt. */
  folders: PlainFolder[];
  /** Map from `"dm:uuid" | "group:uuid"` → folderId. */
  chatFolderMap: ChatFolderMap;

  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<PlainFolder | null>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  addChatToFolder: (folderId: string, peerKind: PlainPinKind, peerId: string) => Promise<void>;
  removeChatFromFolder: (folderId: string, peerKind: PlainPinKind, peerId: string) => Promise<void>;
  getFolderForChat: (peerKind: PlainPinKind, peerId: string) => string | null;
  reset: () => void;
}

function sortFolders(folders: PlainFolder[]): PlainFolder[] {
  return [...folders].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export const usePlainFoldersStore = create<PlainFoldersState>((set, get) => ({
  folders: [],
  chatFolderMap: {},

  async loadFolders() {
    try {
      const data = await api.get<WireFolderListResponse>("/plain/folders");
      const folders = sortFolders(data.folders.map(wireToFolder));
      const chatFolderMap: ChatFolderMap = {};
      for (const entry of data.entries) {
        chatFolderMap[entryKey(entry.peerKind, entry.peerId)] = entry.folderId;
      }
      set({ folders, chatFolderMap });
    } catch (err) {
      logger.error("[PlainFolders] loadFolders failed", err);
    }
  },

  async createFolder(name) {
    try {
      const wire = await api.post<WireFolder>("/plain/folders", { name });
      const folder = wireToFolder(wire);
      set((state) => ({ folders: sortFolders([...state.folders, folder]) }));
      return folder;
    } catch (err) {
      logger.error("[PlainFolders] createFolder failed", err);
      return null;
    }
  },

  async renameFolder(folderId, name) {
    // Optimistic update
    set((state) => ({
      folders: state.folders.map((f) =>
        f.folderId === folderId ? { ...f, name } : f
      ),
    }));
    try {
      await api.patch(`/plain/folders/${encodeURIComponent(folderId)}`, { name });
    } catch (err) {
      logger.error("[PlainFolders] renameFolder failed", err);
      // Reload to reconcile
      void get().loadFolders();
    }
  },

  async deleteFolder(folderId) {
    const previous = get().folders.find((f) => f.folderId === folderId);
    const previousMap = get().chatFolderMap;

    // Optimistic: remove folder and all its chat assignments
    set((state) => {
      const next = { ...state.chatFolderMap };
      for (const [key, fid] of Object.entries(next)) {
        if (fid === folderId) delete next[key];
      }
      return {
        folders: state.folders.filter((f) => f.folderId !== folderId),
        chatFolderMap: next,
      };
    });

    try {
      await api.delete(`/plain/folders/${encodeURIComponent(folderId)}`);
    } catch (err) {
      logger.error("[PlainFolders] deleteFolder failed", err);
      // Restore
      if (previous) {
        set((state) => ({
          folders: sortFolders([...state.folders, previous]),
          chatFolderMap: previousMap,
        }));
      }
    }
  },

  async addChatToFolder(folderId, peerKind, peerId) {
    const key = entryKey(peerKind, peerId);
    const previousFolderId = get().chatFolderMap[key];
    // Optimistic
    set((state) => ({ chatFolderMap: { ...state.chatFolderMap, [key]: folderId } }));
    try {
      await api.put(
        `/plain/folders/${encodeURIComponent(folderId)}/chats/${peerKind}/${encodeURIComponent(peerId)}`
      );
    } catch (err) {
      logger.error("[PlainFolders] addChatToFolder failed", err);
      // Rollback
      set((state) => {
        const next = { ...state.chatFolderMap };
        if (previousFolderId) {
          next[key] = previousFolderId;
        } else {
          delete next[key];
        }
        return { chatFolderMap: next };
      });
    }
  },

  async removeChatFromFolder(folderId, peerKind, peerId) {
    const key = entryKey(peerKind, peerId);
    // Optimistic
    set((state) => {
      const next = { ...state.chatFolderMap };
      delete next[key];
      return { chatFolderMap: next };
    });
    try {
      await api.delete(
        `/plain/folders/${encodeURIComponent(folderId)}/chats/${peerKind}/${encodeURIComponent(peerId)}`
      );
    } catch (err) {
      logger.error("[PlainFolders] removeChatFromFolder failed", err);
      // Restore
      set((state) => ({ chatFolderMap: { ...state.chatFolderMap, [key]: folderId } }));
    }
  },

  getFolderForChat(peerKind, peerId) {
    return get().chatFolderMap[entryKey(peerKind, peerId)] ?? null;
  },

  reset() {
    set({ folders: [], chatFolderMap: {} });
  },
}));
