import { z } from "zod";
import { wireObject } from "./common.js";

export const PROFILE_MAX_DISPLAY_NAME = 64;
export const PROFILE_MAX_BIO = 200;

// ─── Own profile ─────────────────────────────────────────────────────────────

/** Shape returned by GET /profile and used inside auth session responses. */
export const OwnProfileSchema = wireObject({
  userId: z.string().uuid(),
  username: z.string().min(1).max(32),
  displayName: z.string().max(PROFILE_MAX_DISPLAY_NAME).nullable(),
  bio: z.string().max(PROFILE_MAX_BIO).nullable(),
  avatarKey: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type OwnProfile = z.infer<typeof OwnProfileSchema>;

/** PATCH /profile body. */
export const UpdateProfileRequestSchema = wireObject({
  displayName: z.string().max(PROFILE_MAX_DISPLAY_NAME).nullable(),
  bio: z.string().max(PROFILE_MAX_BIO).nullable(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

// ─── Public profile (any authenticated user) ─────────────────────────────────

/** Shape returned by GET /profile/:username. */
export const PublicProfileSchema = wireObject({
  userId: z.string().uuid(),
  username: z.string().min(1).max(32),
  displayName: z.string().max(PROFILE_MAX_DISPLAY_NAME).nullable(),
  bio: z.string().max(PROFILE_MAX_BIO).nullable(),
  avatarKey: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
