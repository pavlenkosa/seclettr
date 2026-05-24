/**
 * Profile API client.
 *
 * Covers: own profile read/update, avatar upload/delete, public profile lookup.
 * All calls use the shared `request` helper with Bearer auth.
 */
import { z } from "zod";
import { resolveApiBaseUrl } from "./runtime-config";
import { getAccessToken } from "./api";
import { refreshSessionAccessToken } from "./session";

const API_BASE_URL = resolveApiBaseUrl();

// ─── Shared schema ────────────────────────────────────────────────────────────

const ProfileSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(1),
  displayName: z.string().max(64).nullable(),
  bio: z.string().max(200).nullable(),
  avatarKey: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof ProfileSchema>;

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function profileRequest<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry) {
    const newToken = await refreshSessionAccessToken();
    if (newToken) return profileRequest<T>(path, options, false);
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Request failed (${res.status})`;
    try { message = (JSON.parse(text) as { error?: string }).error ?? message; } catch { /* ok */ }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ─── Profile endpoints ────────────────────────────────────────────────────────

/** GET /profile — own profile */
export async function fetchOwnProfile(): Promise<UserProfile> {
  const raw = await profileRequest<unknown>("/profile");
  return ProfileSchema.parse(raw);
}

/** PATCH /profile — update own display name + bio */
export async function updateProfile(patch: {
  displayName: string | null;
  bio: string | null;
}): Promise<UserProfile> {
  const raw = await profileRequest<unknown>("/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return ProfileSchema.parse(raw);
}

/** POST /profile/avatar — upload new avatar image */
export async function uploadAvatar(file: File): Promise<UserProfile> {
  const form = new FormData();
  form.append("file", file);
  const raw = await profileRequest<unknown>("/profile/avatar", {
    method: "POST",
    body: form,
  });
  return ProfileSchema.parse(raw);
}

/** DELETE /profile/avatar — remove avatar */
export async function deleteAvatar(): Promise<UserProfile> {
  const raw = await profileRequest<unknown>("/profile/avatar", { method: "DELETE" });
  return ProfileSchema.parse(raw);
}

/** GET /profile/:username — public profile of another user */
export async function fetchUserProfile(username: string): Promise<UserProfile> {
  const raw = await profileRequest<unknown>(`/profile/${encodeURIComponent(username)}`);
  return ProfileSchema.parse(raw);
}

/** GET /profile/avatar/:userId — avatar image URL (uses Bearer auth via fetch) */
export function avatarUrl(userId: string): string {
  return `${API_BASE_URL}/profile/avatar/${encodeURIComponent(userId)}`;
}

/** GET /plain/groups/:groupId/avatar — group avatar image URL (member-gated) */
export function groupAvatarUrl(groupId: string): string {
  return `${API_BASE_URL}/plain/groups/${encodeURIComponent(groupId)}/avatar`;
}
