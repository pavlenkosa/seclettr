import { z } from "zod";
import { parseLocalPayload, request } from "./client";

const MeResponseSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(1),
  displayName: z.string().max(64).nullable().optional(),
  bio: z.string().max(200).nullable().optional(),
  avatarKey: z.string().nullable().optional(),
});

export async function getMeUser(): Promise<{
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarKey: string | null;
} | null> {
  try {
    const raw = await request<unknown>("/users/me", { method: "GET" });
    const parsed = parseLocalPayload(MeResponseSchema, raw);
    return {
      userId: parsed.userId,
      username: parsed.username,
      displayName: parsed.displayName ?? null,
      bio: parsed.bio ?? null,
      avatarKey: parsed.avatarKey ?? null,
    };
  } catch {
    return null;
  }
}
