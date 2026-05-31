/**
 * @ownedBy user-search / contact-grant header injection
 *
 * Three module-level Maps share state across all `searchUsers` and
 * `getUserContactGrantHeaders` call sites: `searchCache` (query results, max 128
 * entries, 30 s TTL), `contactGrantCache` (userId→grant, TTL-pruned on access),
 * and `inFlightSearches` (self-clearing on resolve/reject). Use
 * `__userSearchTestUtils.reset()` in `beforeEach` to clear all caches between
 * tests instead of relying on `vi.resetModules()`.
 */
import { api } from "./api";
import {
  type UserSearchResponse,
} from "@seclettr/protocol";

export interface UserSearchResult {
  userId: string;
  username: string;
  contactGrant?: string;
  contactGrantExpiresAt?: string;
}

interface CacheEntry {
  expiresAt: number;
  users: UserSearchResult[];
}

const USER_SEARCH_CACHE_TTL_MS = 30_000;
const USER_SEARCH_CACHE_MAX_ENTRIES = 128;
export const USER_SEARCH_MIN_QUERY_LENGTH = 3;
const contactGrantCache = new Map<
  string,
  { contactGrant: string; expiresAt: number }
>();

const searchCache = new Map<string, CacheEntry>();
const inFlightSearches = new Map<string, Promise<UserSearchResult[]>>();

function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function pruneSearchCache(now: number): void {
  for (const [query, entry] of searchCache) {
    if (entry.expiresAt <= now) {
      searchCache.delete(query);
    }
  }

  while (searchCache.size > USER_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestQuery = searchCache.keys().next().value;
    if (!oldestQuery) break;
    searchCache.delete(oldestQuery);
  }
}

function cacheContactGrant(
  userId: string,
  contactGrant: string | undefined,
  contactGrantExpiresAt: string | undefined
): void {
  if (!contactGrant || !contactGrantExpiresAt) {
    return;
  }
  const expiresAt = new Date(contactGrantExpiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return;
  }
  contactGrantCache.set(userId, {
    contactGrant,
    expiresAt,
  });
}

function pruneContactGrantCache(now: number): void {
  for (const [userId, entry] of contactGrantCache) {
    if (entry.expiresAt <= now) {
      contactGrantCache.delete(userId);
    }
  }
}

export function getUserContactGrantHeaders(
  userId: string
): HeadersInit | undefined {
  pruneContactGrantCache(Date.now());
  const cached = contactGrantCache.get(userId);
  if (!cached) {
    return undefined;
  }
  return {
    "X-Seclettr-Contact-Grant": cached.contactGrant,
  };
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < USER_SEARCH_MIN_QUERY_LENGTH) {
    return [];
  }

  const now = Date.now();
  const cached = searchCache.get(normalizedQuery);
  if (cached && cached.expiresAt > now) {
    return cached.users;
  }
  if (cached) {
    searchCache.delete(normalizedQuery);
  }

  const pendingSearch = inFlightSearches.get(normalizedQuery);
  if (pendingSearch) {
    return pendingSearch;
  }

  const searchPromise = api
    .get<UserSearchResponse>(
      `/users/search?q=${encodeURIComponent(normalizedQuery)}`
    )
    .then(({ users }) => {
      const cachedUsers = users.map((user) => {
        cacheContactGrant(
          user.userId,
          user.contactGrant,
          user.contactGrantExpiresAt
        );
        return { ...user };
      });
      const expiresAt = Date.now() + USER_SEARCH_CACHE_TTL_MS;
      searchCache.set(normalizedQuery, { expiresAt, users: cachedUsers });
      pruneSearchCache(Date.now());
      pruneContactGrantCache(Date.now());
      return cachedUsers;
    })
    .finally(() => {
      inFlightSearches.delete(normalizedQuery);
    });

  inFlightSearches.set(normalizedQuery, searchPromise);
  return searchPromise;
}

function resetUserSearch(): void {
  searchCache.clear();
  contactGrantCache.clear();
  inFlightSearches.clear();
}

export const __userSearchTestUtils = {
  reset: resetUserSearch,
} as const;
