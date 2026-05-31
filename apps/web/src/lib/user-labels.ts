/**
 * @ownedBy user-label-resolution pipeline
 *
 * `resolvedUserLabelCache` accumulates resolved username labels keyed by userId,
 * capped at MAX_LABEL_CACHE_ENTRIES (1024) via FIFO eviction to prevent unbounded
 * growth on long sessions with many unique contacts. Written by `primeUserLabelCache`
 * (called from stores on message receive) and `fetchUserLabel` (on API response).
 * `pendingUserLabelRequests` is self-clearing (entry removed in `.finally()`).
 * Use `__userLabelTestUtils.reset()` in `beforeEach` to prevent cross-test leakage.
 */
import { api } from "./api";
import { sanitizeDisplayText } from "./display-text";

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_LABEL_CACHE_ENTRIES = 1024;
const resolvedUserLabelCache = new Map<string, string>();
const pendingUserLabelRequests = new Map<string, Promise<string | null>>();

function setResolvedLabel(userId: string, label: string): void {
  if (resolvedUserLabelCache.size >= MAX_LABEL_CACHE_ENTRIES) {
    const oldestKey = resolvedUserLabelCache.keys().next().value;
    if (oldestKey !== undefined) {
      resolvedUserLabelCache.delete(oldestKey);
    }
  }
  resolvedUserLabelCache.set(userId, label);
}

function normalizeLabel(label: string | null | undefined): string | null {
  return sanitizeDisplayText(label);
}

function isUuidLike(value: string): boolean {
  return UUID_LIKE_PATTERN.test(value);
}

export function shouldHydrateUserLabel(
  label: string | null | undefined,
  userId: string
): boolean {
  const normalized = normalizeLabel(label);
  if (!normalized) return true;
  return normalized === userId || isUuidLike(normalized);
}

export function primeUserLabelCache(userId: string, label: string | null | undefined): void {
  const normalized = normalizeLabel(label);
  if (!normalized || shouldHydrateUserLabel(normalized, userId)) return;
  setResolvedLabel(userId, normalized);
}

export function getCachedUserLabel(userId: string): string | null {
  return resolvedUserLabelCache.get(userId) ?? null;
}

export async function fetchUserLabel(userId: string): Promise<string | null> {
  const cached = getCachedUserLabel(userId);
  if (cached) return cached;

  const pending = pendingUserLabelRequests.get(userId);
  if (pending) return pending;

  const request = api.get<{ userId: string; username: string }>(
    `/users/${encodeURIComponent(userId)}`
  )
    .then((response) => {
      const normalized = normalizeLabel(response.username);
      if (!normalized) return null;
      setResolvedLabel(userId, normalized);
      return normalized;
    })
    .catch(() => null)
    .finally(() => {
      pendingUserLabelRequests.delete(userId);
    });

  pendingUserLabelRequests.set(userId, request);
  return request;
}

function resetUserLabels(): void {
  resolvedUserLabelCache.clear();
  pendingUserLabelRequests.clear();
}

export const __userLabelTestUtils = {
  reset: resetUserLabels,
} as const;
