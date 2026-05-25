import { useBlobUrl } from "./useBlobUrl";
import { avatarUrl } from "@/lib/profile-api";

/**
 * Fetches a user profile avatar with Bearer auth and returns a blob: URL.
 * Returns null while loading, on error, or when userId / avatarKey is absent.
 * avatarKey acts as a cache-buster — a new upload always triggers a fresh fetch.
 */
export function useAvatarUrl(
  userId: string | null | undefined,
  avatarKey: string | null | undefined,
): string | null {
  const cacheKey = userId && avatarKey ? `user:${userId}:${avatarKey}` : null;
  const resourceUrl = userId ? avatarUrl(userId) : null;
  return useBlobUrl(cacheKey, resourceUrl);
}
