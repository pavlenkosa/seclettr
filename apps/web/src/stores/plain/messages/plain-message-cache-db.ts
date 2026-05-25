import type { PlainMessage } from "../types";
import { logger } from "@/lib/logger";

/**
 * IndexedDB-backed cache for plain (non-E2EE) message history.
 *
 * Messages are stored per conversation (DM or group) and survive page reloads.
 * Read: returns cached messages before the API fetch so the UI renders instantly.
 * Write: writes after each successful API fetch, pagination load, or incoming WS message.
 *
 * Two object stores:
 *   messages — individual PlainMessage entries, keyed by composite id
 *   meta     — per-conversation metadata (count, date range, size)
 */

const DB_NAME = "seclettr-plain-cache";
const DB_VERSION = 1;

export type ConvKey = `dm:${string}` | `group:${string}`;

export interface CacheConversationInfo {
  convKey: ConvKey;
  type: "dm" | "group";
  peerName: string;
  messageCount: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  estimatedBytes: number;
}

export interface CacheStats {
  conversationCount: number;
  totalMessages: number;
  estimatedBytes: number;
  conversations: CacheConversationInfo[];
}

// ── Lazy singleton DB connection ────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function resetDb(): void {
  dbPromise = null;
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("messages")) {
        const store = db.createObjectStore("messages", { keyPath: "id" });
        store.createIndex("convKey", "convKey", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "convKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      resetDb();
      reject(req.error);
    };
    req.onblocked = () => {
      resetDb();
      reject(new Error("IndexedDB blocked — another tab has the DB open"));
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function messageId(convKey: ConvKey, clientId: string): string {
  return `${convKey}:${clientId}`;
}

interface CacheRow {
  id: string;
  convKey: ConvKey;
  json: string;
  timestamp: number;
  cachedAt: number;
}

// ── Public API ──────────────────────────────────────────────────────────

/** Load all cached messages for a conversation. Returns empty array if none. */
export async function cacheLoadConversation(convKey: ConvKey): Promise<PlainMessage[]> {
  try {
    const db = await getDb();
    const tx = db.transaction("messages", "readonly");
    const store = tx.objectStore("messages");
    const index = store.index("convKey");
    const range = IDBKeyRange.only(convKey);

    return new Promise((resolve, reject) => {
      const result: PlainMessage[] = [];
      const cursorReq = index.openCursor(range);

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const row = cursor.value as CacheRow;
          try {
            result.push(JSON.parse(row.json) as PlainMessage);
          } catch {
            // skip corrupt entry
          }
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  } catch (err) {
    logger.warn("[PlainCache] load failed", err);
    return [];
  }
}

/** Replace (overwrite) all cached messages for a conversation with a fresh set. */
export async function cacheSaveConversation(
  convKey: ConvKey,
  messages: PlainMessage[],
  peerName: string
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["messages", "meta"], "readwrite");
    const msgStore = tx.objectStore("messages");
    const metaStore = tx.objectStore("meta");

    // Delete existing messages for this conversation
    const index = msgStore.index("convKey");
    const range = IDBKeyRange.only(convKey);
    const delReq = index.openCursor(range);
    delReq.onsuccess = () => {
      const cursor = delReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Insert fresh messages
    const now = Date.now();
    const type = convKey.startsWith("group") ? "group" : "dm";
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;
    let estimatedBytes = 0;

    for (const msg of messages) {
      const json = JSON.stringify(msg);
      const row: CacheRow = {
        id: messageId(convKey, msg.clientId),
        convKey,
        json,
        timestamp: msg.timestamp,
        cachedAt: now,
      };
      msgStore.put(row);
      if (msg.timestamp < oldestTimestamp) oldestTimestamp = msg.timestamp;
      if (msg.timestamp > newestTimestamp) newestTimestamp = msg.timestamp;
      estimatedBytes += json.length;
    }

    // Write meta
    if (messages.length > 0) {
      metaStore.put({
        convKey,
        type,
        peerName,
        messageCount: messages.length,
        oldestTimestamp: oldestTimestamp === Infinity ? 0 : oldestTimestamp,
        newestTimestamp,
        estimatedBytes,
        cachedAt: now,
      });
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    logger.warn("[PlainCache] save failed", err);
  }
}

/** Append messages to an existing cache (e.g., pagination or incoming WS). */
export async function cacheAppendMessages(
  convKey: ConvKey,
  messages: PlainMessage[],
  peerName: string
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["messages", "meta"], "readwrite");
    const msgStore = tx.objectStore("messages");
    const metaStore = tx.objectStore("meta");

    const now = Date.now();
    const type = convKey.startsWith("group") ? "group" : "dm";

    for (const msg of messages) {
      const json = JSON.stringify(msg);
      const row: CacheRow = {
        id: messageId(convKey, msg.clientId),
        convKey,
        json,
        timestamp: msg.timestamp,
        cachedAt: now,
      };
      msgStore.put(row);
    }

    // Update meta
    const getMetaReq = metaStore.get(convKey);
    getMetaReq.onsuccess = () => {
      const existing = getMetaReq.result as {
        messageCount: number;
        oldestTimestamp: number;
        newestTimestamp: number;
        estimatedBytes: number;
      } | undefined;

      let messageCount = messages.length;
      let oldestTimestamp = Infinity;
      let newestTimestamp = 0;
      let estimatedBytes = 0;

      for (const msg of messages) {
        if (msg.timestamp < oldestTimestamp) oldestTimestamp = msg.timestamp;
        if (msg.timestamp > newestTimestamp) newestTimestamp = msg.timestamp;
        estimatedBytes += JSON.stringify(msg).length;
      }

      if (existing) {
        messageCount += existing.messageCount;
        oldestTimestamp = Math.min(oldestTimestamp, existing.oldestTimestamp);
        newestTimestamp = Math.max(newestTimestamp, existing.newestTimestamp);
        estimatedBytes += existing.estimatedBytes;
      }

      metaStore.put({
        convKey,
        type,
        peerName,
        messageCount,
        oldestTimestamp: oldestTimestamp === Infinity ? 0 : oldestTimestamp,
        newestTimestamp,
        estimatedBytes,
        cachedAt: now,
      });
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    logger.warn("[PlainCache] append failed", err);
  }
}

/** Delete all cache data for one conversation. */
export async function cacheRemoveConversation(convKey: ConvKey): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["messages", "meta"], "readwrite");
    const msgStore = tx.objectStore("messages");
    const metaStore = tx.objectStore("meta");

    const index = msgStore.index("convKey");
    const range = IDBKeyRange.only(convKey);
    const cursorReq = index.openCursor(range);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    metaStore.delete(convKey);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    logger.warn("[PlainCache] remove failed", err);
  }
}

/** Delete all cache data. */
export async function cacheClearAll(): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["messages", "meta"], "readwrite");
    tx.objectStore("messages").clear();
    tx.objectStore("meta").clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    logger.warn("[PlainCache] clearAll failed", err);
  }
}

/** Delete messages older than `cutoffTimestamp` (ms), keep newer ones. */
export async function cacheClearOlderThan(cutoffTimestamp: number): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["messages", "meta"], "readwrite");
    const msgStore = tx.objectStore("messages");

    const timestampIdx = msgStore.index("timestamp");
    const range = IDBKeyRange.upperBound(cutoffTimestamp, true);
    const cursorReq = timestampIdx.openCursor(range);

    const deletedKeys = new Set<string>();

    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        deletedKeys.add((cursor.value as CacheRow).convKey);
        cursor.delete();
        cursor.continue();
      }
    };

    // Recalculate meta for affected conversations
    tx.oncomplete = () => {
      for (const convKey of deletedKeys) {
        recalcConversationMeta(convKey).catch(() => {});
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    logger.warn("[PlainCache] clearOlderThan failed", err);
  }
}

async function recalcConversationMeta(convKey: string): Promise<void> {
  const messages = await cacheLoadConversation(convKey as ConvKey);
  if (messages.length === 0) {
    const db = await getDb();
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").delete(convKey);
    return;
  }
  const db = await getDb();
  const tx = db.transaction("meta", "readwrite");
  const metaStore = tx.objectStore("meta");
  const existingReq = metaStore.get(convKey);
  existingReq.onsuccess = () => {
    const existing = existingReq.result as { type: string; peerName: string } | undefined;
    let oldest = Infinity;
    let newest = 0;
    let bytes = 0;
    for (const m of messages) {
      if (m.timestamp < oldest) oldest = m.timestamp;
      if (m.timestamp > newest) newest = m.timestamp;
      bytes += JSON.stringify(m).length;
    }
    metaStore.put({
      convKey,
      type: existing?.type ?? "dm",
      peerName: existing?.peerName ?? convKey,
      messageCount: messages.length,
      oldestTimestamp: oldest === Infinity ? 0 : oldest,
      newestTimestamp: newest,
      estimatedBytes: bytes,
      cachedAt: Date.now(),
    });
  };
}

/** Get aggregate cache statistics. */
export async function cacheGetStats(): Promise<CacheStats> {
  const stats: CacheStats = {
    conversationCount: 0,
    totalMessages: 0,
    estimatedBytes: 0,
    conversations: [],
  };

  try {
    const db = await getDb();
    const tx = db.transaction(["messages", "meta"], "readonly");
    const metaStore = tx.objectStore("meta");
    const metaCursorReq = metaStore.openCursor();

    return new Promise((resolve, reject) => {
      metaCursorReq.onsuccess = () => {
        const cursor = metaCursorReq.result;
        if (cursor) {
          const meta = cursor.value as CacheConversationInfo & { cachedAt: number };
          stats.conversationCount++;
          stats.totalMessages += meta.messageCount;
          stats.estimatedBytes += meta.estimatedBytes;
          stats.conversations.push(meta);
          cursor.continue();
        } else {
          resolve(stats);
        }
      };
      metaCursorReq.onerror = () => reject(metaCursorReq.error);
    });
  } catch (err) {
    logger.warn("[PlainCache] getStats failed", err);
    return stats;
  }
}

/** Format bytes to a human-readable string. */
export function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
