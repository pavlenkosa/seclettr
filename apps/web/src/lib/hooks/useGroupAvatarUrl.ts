import { useBlobUrl } from "./useBlobUrl";
import { groupAvatarUrl } from "@/lib/profile-api";

/**
 * Fetches a plain group avatar with Bearer auth and returns a blob: URL.
 * Returns null while loading, on error, or when groupId / avatarKey is absent.
 * avatarKey acts as a cache-buster — a new upload always triggers a fresh fetch.
 */
export function useGroupAvatarUrl(
  groupId: string | null | undefined,
  avatarKey: string | null | undefined,
): string | null {
  const cacheKey = groupId && avatarKey ? `group:${groupId}:${avatarKey}` : null;
  const resourceUrl = groupId ? groupAvatarUrl(groupId) : null;
  return useBlobUrl(cacheKey, resourceUrl);
}
