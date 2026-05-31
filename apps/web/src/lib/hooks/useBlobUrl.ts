/**
 * @ownedBy avatar-and-media-attachment blob URL lifecycle
 *
 * `cache` is module-level LRU state shared by all `useBlobUrl` call sites.
 * Entries persist for the page lifetime up to MAX_ENTRIES (60), after which
 * the LRU entry is evicted and its blob URL is revoked. The sole write path
 * is `cacheSet`. Use `__blobUrlCacheTestUtils.reset()` in `beforeEach` to
 * prevent cross-test blob URL leakage.
 *
 * useBlobUrl — generic hook that fetches an authenticated image URL and
 * returns a blob: URL safe for use as <img src>.
 *
 * Caches by `cacheKey` so a key change (e.g. a new avatar upload) always
 * triggers a fresh fetch. The cache is module-level LRU-bounded (MAX_ENTRIES)
 * to prevent unbounded blob URL accumulation on long sessions.
 *
 * Returns null while loading, on error, or when either argument is absent.
 * Aborts in-flight fetches on key change or unmount.
 */
import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/api";

const MAX_ENTRIES = 60;

// LRU cache: ordered map — oldest entries at the front.
const cache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    // Move to most-recently-used position.
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, blobUrl: string): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_ENTRIES) {
    // Evict the least-recently-used entry and revoke its blob URL.
    const lruKey = cache.keys().next().value;
    if (lruKey !== undefined) {
      const lruUrl = cache.get(lruKey);
      cache.delete(lruKey);
      if (lruUrl) URL.revokeObjectURL(lruUrl);
    }
  }
  cache.set(key, blobUrl);
}

function resetBlobUrlCache(): void {
  for (const url of cache.values()) {
    URL.revokeObjectURL(url);
  }
  cache.clear();
}

export const __blobUrlCacheTestUtils = {
  reset: resetBlobUrlCache,
} as const;

export function useBlobUrl(
  /** Stable cache key that changes when the underlying resource changes. */
  cacheKey: string | null | undefined,
  /** Authenticated URL to fetch from. Must be non-null when cacheKey is non-null. */
  resourceUrl: string | null | undefined,
): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!cacheKey || !resourceUrl) {
      setBlobUrl(null);
      return;
    }

    const cached = cacheGet(cacheKey);
    if (cached) {
      setBlobUrl(cached);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(resourceUrl, { headers, credentials: "include", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        cacheSet(cacheKey, url);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setBlobUrl(null);
      });

    return () => {
      controller.abort();
    };
  }, [cacheKey, resourceUrl]);

  return blobUrl;
}
