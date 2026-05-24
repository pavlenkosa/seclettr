/**
 * useGroupAvatarUrl — fetches a plain group avatar image with Bearer auth
 * and returns a blob: URL suitable for use as <img src>.
 *
 * Returns null while loading or if groupId / avatarKey is absent.
 * Caches by (groupId + avatarKey) so a key change triggers a fresh fetch.
 */
import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/api";
import { groupAvatarUrl } from "@/lib/profile-api";

// Module-level blob URL cache keyed by "groupId:avatarKey".
const blobCache = new Map<string, string>();

function cacheKey(groupId: string, avatarKey: string): string {
  return `group:${groupId}:${avatarKey}`;
}

export function useGroupAvatarUrl(
  groupId: string | null | undefined,
  avatarKey: string | null | undefined
): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!groupId || !avatarKey) {
      setBlobUrl(null);
      return;
    }

    const key = cacheKey(groupId, avatarKey);
    const cached = blobCache.get(key);
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

    fetch(groupAvatarUrl(groupId), { headers, credentials: "include", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Group avatar fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        blobCache.set(key, url);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setBlobUrl(null);
      });

    return () => {
      controller.abort();
    };
  }, [groupId, avatarKey]);

  return blobUrl;
}
