/**
 * Client-side storage health checks.
 *
 * - requestPersistentStorage: asks the browser to never evict IDB/localStorage
 *   without explicit user action.  Must be called from within an authenticated
 *   session (not from a cold-start); some browsers honour it based on site
 *   engagement (bookmarked, frequently visited) even without a user gesture.
 *
 * - checkStorageQuota: reads navigator.storage.estimate() and warns when
 *   usage exceeds the warning threshold.  Non-blocking — call fire-and-forget.
 */
import { logger } from "@/lib/logger.js";

const QUOTA_WARN_RATIO = 0.75; // warn at 75 % used

/**
 * Request that the browser persist this origin's storage (IDB, localStorage,
 * Cache API) and not evict it under quota pressure.
 *
 * Returns true if the browser grants persistence, false otherwise.
 * Always resolves — never throws.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    const granted = await navigator.storage.persist();
    if (!granted) {
      logger.warn(
        "[storage-health] persistent storage not granted — browser may evict IDB under quota pressure"
      );
    }
    return granted;
  } catch (error) {
    logger.warn("[storage-health] navigator.storage.persist() threw", error);
    return false;
  }
}

/**
 * Estimate storage usage and emit a warning if it exceeds QUOTA_WARN_RATIO.
 * Always resolves — never throws.
 */
export async function checkStorageQuota(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (quota === 0) return;

    const ratio = usage / quota;
    const usedMb = (usage / 1024 / 1024).toFixed(1);
    const quotaMb = (quota / 1024 / 1024).toFixed(1);

    if (ratio >= QUOTA_WARN_RATIO) {
      logger.warn(
        `[storage-health] storage quota at ${(ratio * 100).toFixed(0)}% — ` +
        `${usedMb} MB used of ${quotaMb} MB available. ` +
        "Old messages or attachments may not be saveable."
      );
    }
  } catch (error) {
    logger.warn("[storage-health] navigator.storage.estimate() threw", error);
  }
}
