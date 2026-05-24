/**
 * Profile API client.
 *
 * Covers: own profile read/update, avatar upload/delete, public profile lookup.
 * Uses the shared `api` helper which handles auth, token refresh, and errors.
 */
import { z } from "zod";
import { resolveApiBaseUrl } from "./runtime-config";
import { api } from "./api";

// ─── Schema ───────────────────────────────────────────────────────────────────

const ProfileSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(1),
  displayName: z.string().max(64).nullable(),
  bio: z.string().max(200).nullable(),
  avatarKey: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof ProfileSchema>;

// ─── Profile endpoints ────────────────────────────────────────────────────────

/** GET /profile — own profile */
export async function fetchOwnProfile(): Promise<UserProfile> {
  return ProfileSchema.parse(await api.get<unknown>("/profile"));
}

/** PATCH /profile — update own display name + bio */
export async function updateProfile(patch: {
  displayName: string | null;
  bio: string | null;
}): Promise<UserProfile> {
  return ProfileSchema.parse(await api.patch<unknown>("/profile", patch));
}

/** POST /profile/avatar — upload new avatar image */
export async function uploadAvatar(file: File): Promise<UserProfile> {
  const form = new FormData();
  form.append("file", file);
  return ProfileSchema.parse(await api.upload<unknown>("/profile/avatar", form));
}

/** DELETE /profile/avatar — remove avatar */
export async function deleteAvatar(): Promise<UserProfile> {
  return ProfileSchema.parse(await api.delete<unknown>("/profile/avatar"));
}

/** GET /profile/:username — public profile of another user */
export async function fetchUserProfile(username: string): Promise<UserProfile> {
  return ProfileSchema.parse(
    await api.get<unknown>(`/profile/${encodeURIComponent(username)}`),
  );
}

// ─── URL builders (no auth required here — auth is injected by useAvatarUrl) ──

/** Authenticated avatar endpoint URL for a given user. */
export function avatarUrl(userId: string): string {
  return `${resolveApiBaseUrl()}/profile/avatar/${encodeURIComponent(userId)}`;
}

/** Authenticated group avatar endpoint URL. */
export function groupAvatarUrl(groupId: string): string {
  return `${resolveApiBaseUrl()}/plain/groups/${encodeURIComponent(groupId)}/avatar`;
}
