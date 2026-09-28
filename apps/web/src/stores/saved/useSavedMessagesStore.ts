import { create } from "zustand";
import {
  clearEncryptedByPrefix,
  loadDecrypted,
  storeEncrypted,
  type StorageLoadError,
} from "@seclettr/crypto";
import { getOrCreateStorageKey } from "@/lib/storage-key";
import { logger } from "@/lib/logger";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export type SavedMessagesStatus = "idle" | "ready" | "locked" | "error";

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
  /** At-rest encryption status: idle until first load, ready when hydrated. */
  status: SavedMessagesStatus;
  /** Hydrate from encrypted storage (IDB) for the given userId. */
  load: (userId: string) => Promise<void>;
  /** Append a new text note. */
  addMessage: (content: string) => void;
  /** Append a new message with a file attachment. Resolves false if the file exceeds the size limit. */
  addMessageWithAttachment: (
    file: File,
    options: { kind: "file" | "voice_note" | "video_note"; durationMs?: number; caption?: string; mediaGroupId?: string }
  ) => Promise<boolean>;
  /** Remove a note by id. */
  deleteMessage: (id: string) => void;
  /** Wipe in-memory state and encrypted storage on logout. */
  reset: () => void;
}

const LEGACY_STORAGE_PREFIX = "sc:saved:";

function legacyStorageKey(userId: string): string {
  return `${LEGACY_STORAGE_PREFIX}${userId}`;
}

function encryptedItemKey(userId: string): string {
  return `saved:${userId}:notes`;
}

function isValidSavedMessage(item: unknown): item is SavedMessage {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof (item as SavedMessage).id === "string" &&
    typeof (item as SavedMessage).content === "string" &&
    typeof (item as SavedMessage).timestamp === "number"
  );
}

function parseLegacyMessages(raw: string | null): SavedMessage[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedMessage);
  } catch {
    return [];
  }
}

interface ResolvedKey {
  key: CryptoKey;
  volatile: boolean;
}

// Module-level session state: the resolved at-rest key and the owning user.
let currentUserId: string | null = null;
let resolvedKey: ResolvedKey | null = null;

function isPersistDisabled(status: SavedMessagesStatus, volatile: boolean): boolean {
  return status === "locked" || status === "error" || volatile;
}

function persist(
  userId: string | null,
  state: ResolvedKey | null,
  status: SavedMessagesStatus,
  messages: SavedMessage[]
): void {
  if (!userId || !state) return;
  if (isPersistDisabled(status, state.volatile)) {
    logger.warn("[SavedMessages] persist skipped (status=" + status + ", volatile=" + state.volatile + ")");
    return;
  }
  void storeEncrypted(state.key, encryptedItemKey(userId), messages).catch((err) => {
    logger.error("[SavedMessages] persist failed", err);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const useSavedMessagesStore = create<SavedMessagesState>((set, get) => ({
  messages: [],
  status: "idle",

  async load(userId) {
    currentUserId = userId;

    let state: ResolvedKey;
    try {
      state = await getOrCreateStorageKey();
    } catch (err) {
      if (err instanceof Error && err.message === "storage_key_locked") {
        // Storage key is passcode-locked: do not read or write anything.
        if (currentUserId !== userId) return;
        resolvedKey = null;
        set({ messages: [], status: "locked" });
        return;
      }
      if (currentUserId !== userId) return;
      resolvedKey = null;
      logger.error("[SavedMessages] storage key unavailable", err);
      set({ messages: [], status: "error" });
      return;
    }

    if (state.volatile) {
      logger.warn("[SavedMessages] storage key is volatile; saved messages stay in-memory only");
    }
    if (currentUserId !== userId) return;
    resolvedKey = state;

    let loadError: StorageLoadError | undefined;
    const stored = await loadDecrypted<SavedMessage[]>(state.key, encryptedItemKey(userId), {
      onError: (error) => {
        loadError = error;
      },
    });

    if (currentUserId !== userId) return;

    if (loadError) {
      // Keep the ciphertext intact (no persist) so the data is not destroyed.
      logger.error("[SavedMessages] load failed (" + loadError.code + ")", loadError.cause);
      set({ messages: [], status: "error" });
      return;
    }

    if (stored !== null) {
      const messages = Array.isArray(stored) ? stored.filter(isValidSavedMessage) : [];
      set({ messages, status: "ready" });
      return;
    }

    // Migration: nothing encrypted yet — adopt the legacy plaintext entry if present.
    let legacyRaw: string | null = null;
    try {
      legacyRaw = localStorage.getItem(legacyStorageKey(userId));
    } catch {
      legacyRaw = null;
    }
    const legacyMessages = parseLegacyMessages(legacyRaw);

    if (legacyMessages.length === 0) {
      set({ messages: [], status: "ready" });
      return;
    }

    try {
      await storeEncrypted(state.key, encryptedItemKey(userId), legacyMessages);
    } catch (err) {
      if (currentUserId !== userId) return;
      // Keep the plaintext entry so data is not lost; do not enable persistence.
      logger.error("[SavedMessages] migration encrypt failed; legacy entry kept", err);
      set({ messages: legacyMessages, status: "error" });
      return;
    }

    if (currentUserId !== userId) return;
    try {
      localStorage.removeItem(legacyStorageKey(userId));
    } catch {
      // best-effort; ciphertext is already durable
    }
    set({ messages: legacyMessages, status: "ready" });
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
    const status = get().status;
    set({ messages });
    persist(currentUserId, resolvedKey, status, messages);
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
      const status = get().status;
      set({ messages });
      persist(currentUserId, resolvedKey, status, messages);
      return true;
    } catch (err) {
      logger.error("[SavedMessages] addMessageWithAttachment failed", err);
      return false;
    }
  },

  deleteMessage(id) {
    const messages = get().messages.filter((m) => m.id !== id);
    const status = get().status;
    set({ messages });
    persist(currentUserId, resolvedKey, status, messages);
  },

  reset() {
    const userId = currentUserId;
    if (userId) {
      void clearEncryptedByPrefix(`saved:${userId}:`).catch((err) => {
        logger.error("[SavedMessages] reset clearEncryptedByPrefix failed", err);
      });
      try {
        localStorage.removeItem(legacyStorageKey(userId));
      } catch {
        // storage may be unavailable; best-effort
      }
    }
    currentUserId = null;
    resolvedKey = null;
    set({ messages: [], status: "idle" });
  },
}));
