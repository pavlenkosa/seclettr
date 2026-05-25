import { create } from "zustand";
import { logger } from "@/lib/logger";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export interface SavedMessageAttachment {
  kind: "file" | "voice_note" | "video_note";
  mimeType: string;
  fileName: string;
  size: number;
  durationMs?: number;
  mediaGroupId?: string;
  dataUrl: string;
}

export interface SavedMessage {
  id: string;
  content: string;
  timestamp: number;
  attachment?: SavedMessageAttachment;
}

export interface SavedMessagesState {
  messages: SavedMessage[];
  /** Hydrate from localStorage for the given userId. */
  load: (userId: string) => void;
  /** Append a new text note. */
  addMessage: (content: string) => void;
  /** Append a new message with a file attachment. Resolves false if the file exceeds the size limit. */
  addMessageWithAttachment: (
    file: File,
    options: { kind: "file" | "voice_note" | "video_note"; durationMs?: number; caption?: string; mediaGroupId?: string }
  ) => Promise<boolean>;
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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

  async addMessageWithAttachment(file, { kind, durationMs, caption, mediaGroupId }) {
    if (file.size > MAX_ATTACHMENT_BYTES) return false;
    try {
      const dataUrl = await fileToDataUrl(file);
      const next: SavedMessage = {
        id: crypto.randomUUID(),
        content: caption ?? "",
        timestamp: Date.now(),
        attachment: {
          kind,
          mimeType: file.type,
          fileName: file.name,
          size: file.size,
          durationMs,
          mediaGroupId,
          dataUrl,
        },
      };
      const messages = [...get().messages, next];
      set({ messages });
      persist(currentUserId, messages);
      return true;
    } catch (err) {
      logger.error("[SavedMessages] addMessageWithAttachment failed", err);
      return false;
    }
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
