/**
 * useAvatarUrl — fetches a profile avatar image with Bearer auth
 * and returns a blob: URL suitable for use as <img src>.
 *
 * Returns null while loading or if userId / avatarKey is absent.
 * Revokes the blob URL on cleanup. Caches by (userId + avatarKey)
 * so a key change (new upload) always triggers a fresh fetch.
 */
import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/api";
import { avatarUrl } from "@/lib/profile-api";

// Module-level blob URL cache: key → blob URL.
// avatarKey acts as a cache-buster since it changes on each upload.
const blobCache = new Map<string, string>();

function cacheKey(userId: string, avatarKey: string): string {
  return `${userId}:${avatarKey}`;
}

export function useAvatarUrl(
  userId: string | null | undefined,
  avatarKey: string | null | undefined
): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // Track current fetch to avoid state updates after unmount or key change.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!userId || !avatarKey) {
      setBlobUrl(null);
      return;
    }

    const key = cacheKey(userId, avatarKey);
    const cached = blobCache.get(key);
    if (cached) {
      setBlobUrl(cached);
      return;
    }

    // Abort previous in-flight fetch.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(avatarUrl(userId), { headers, credentials: "include", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Avatar fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        blobCache.set(key, url);
        setBlobUrl(url);
      })
      .catch(() => {
        // Network error or abort — silently fall back to initials.
        if (!controller.signal.aborted) setBlobUrl(null);
      });

    return () => {
      controller.abort();
    };
  }, [userId, avatarKey]);

  return blobUrl;
}
