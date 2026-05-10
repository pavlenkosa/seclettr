/**
 * Session-scoped cache of fetched plain attachment blobs.
 *
 * Plain attachments are immutable (a verified attachment row never changes
 * its bytes), so once a recipient has downloaded one we can hand back the
 * same Blob URL for the lifetime of the tab — no need to refetch from MinIO
 * every time the message scrolls in and out of view.
 *
 * The cache is bounded by a soft entry count to avoid unbounded memory
 * growth in long-lived sessions; oldest-inserted entries are evicted first
 * (Map iteration order). Each evicted entry has its object URL revoked so
 * the underlying blob can be GC'd.
 *
 * E2EE attachments deliberately bypass this cache — their decrypt path is
 * already covered by per-message refs and the security model expects the
 * decrypted blob to disappear when the row unmounts.
 */

interface CacheEntry {
  blob: Blob;
  objectUrl: string;
}

const MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

export function getPlainAttachmentBlob(attachmentId: string): CacheEntry | null {
  if (!attachmentId) return null;
  const entry = cache.get(attachmentId);
  if (!entry) return null;
  // Touch to mark as most-recently-used.
  cache.delete(attachmentId);
  cache.set(attachmentId, entry);
  return entry;
}

export function setPlainAttachmentBlob(attachmentId: string, blob: Blob): CacheEntry {
  if (!attachmentId) {
    return { blob, objectUrl: URL.createObjectURL(blob) };
  }
  const existing = cache.get(attachmentId);
  if (existing) {
    URL.revokeObjectURL(existing.objectUrl);
    cache.delete(attachmentId);
  }
  const entry: CacheEntry = { blob, objectUrl: URL.createObjectURL(blob) };
  cache.set(attachmentId, entry);

  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = cache.get(oldestKey);
    if (oldest) URL.revokeObjectURL(oldest.objectUrl);
    cache.delete(oldestKey);
  }

  return entry;
}

export function clearPlainAttachmentBlobCache(): void {
  for (const entry of cache.values()) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  cache.clear();
}
