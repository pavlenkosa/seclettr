import { api } from "./api";
import { sanitizeDisplayText } from "./display-text";

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolvedUserLabelCache = new Map<string, string>();
const pendingUserLabelRequests = new Map<string, Promise<string | null>>();

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
  resolvedUserLabelCache.set(userId, normalized);
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
      resolvedUserLabelCache.set(userId, normalized);
      return normalized;
    })
    .catch(() => null)
    .finally(() => {
      pendingUserLabelRequests.delete(userId);
    });

  pendingUserLabelRequests.set(userId, request);
  return request;
}
