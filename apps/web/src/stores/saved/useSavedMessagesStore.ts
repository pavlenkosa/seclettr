import { create } from "zustand";
import { logger } from "@/lib/logger";

export interface SavedMessage {
  id: string;
  content: string;
  timestamp: number;
}

export interface SavedMessagesState {
  messages: SavedMessage[];
  /** Hydrate from localStorage for the given userId. */
  load: (userId: string) => void;
  /** Append a new note. */
  addMessage: (content: string) => void;
  /** Remove a note by id. */
  deleteMessage: (id: string) => void;
  /** Wipe in-memory state on logout. */
  reset: () => void;
}

function storageKey(userId: string): string {
  return `sc:saved:${userId}`;
}

function persist(userId: string | null, messages: SavedMessage[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(messages));
  } catch (err) {
    logger.error("[SavedMessages] persist failed", err);
  }
}

function load(userId: string): SavedMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedMessage =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as SavedMessage).id === "string" &&
        typeof (item as SavedMessage).content === "string" &&
        typeof (item as SavedMessage).timestamp === "number"
    );
  } catch {
    return [];
  }
}

let currentUserId: string | null = null;

export const useSavedMessagesStore = create<SavedMessagesState>((set, get) => ({
  messages: [],

  load(userId) {
    currentUserId = userId;
    set({ messages: load(userId) });
  },

  addMessage(content) {
    const trimmed = content.trim();
    if (!trimmed) return;
    const next: SavedMessage = {
      id: crypto.randomUUID(),
      content: trimmed,
      timestamp: Date.now(),
    };
    const messages = [...get().messages, next];
    set({ messages });
    persist(currentUserId, messages);
  },

  deleteMessage(id) {
    const messages = get().messages.filter((m) => m.id !== id);
    set({ messages });
    persist(currentUserId, messages);
  },

  reset() {
    currentUserId = null;
    set({ messages: [] });
  },
}));
