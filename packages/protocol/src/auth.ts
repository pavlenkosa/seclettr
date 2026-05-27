import { z } from "zod";
import {
  AUTH_PROTOCOL_VERSION,
  type StripVersion,
  versionedWireObject,
} from "./common.js";

export { AUTH_PROTOCOL_VERSION } from "./common.js";

const DeviceProvisioningSchema = z.object({
  name: z.string().min(1).max(64),
  identityKeyPublic: z.string().min(43).max(44),
  signingKeyPublic: z.string().min(43).max(44),
  registrationId: z.number().int().min(1).max(16383),
  signedPreKey: z.object({
    id: z.number().int().min(1).max(2147483647),
    publicKey: z.string().min(43).max(44),
    signature: z.string().min(86).max(88),
  }),
  oneTimePreKeys: z
    .array(
      z.object({
        id: z.number().int().min(1).max(2147483647),
        publicKey: z.string().min(43).max(44),
      })
    )
    .min(1)
    .max(100),
});

export const RegisterRequestSchema = versionedWireObject(AUTH_PROTOCOL_VERSION, {
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, _, ., -"),
  password: z.string().min(8).max(128),
  device: DeviceProvisioningSchema,
});
export type RegisterRequestWire = z.infer<typeof RegisterRequestSchema>;
export type RegisterRequest = StripVersion<RegisterRequestWire>;

export const RegisterResponseSchema = versionedWireObject(AUTH_PROTOCOL_VERSION, {
  userId: z.string().uuid(),
  deviceId: z.string().uuid(),
  accessToken: z.string(),
  /** Present only when the server detects a native client (Capacitor WebView origin).
   *  Clients should persist this to native Preferences so the session can survive
   *  Android process-kill cookie loss. */
  refreshToken: z.string().optional(),
});
export type RegisterResponseWire = z.infer<typeof RegisterResponseSchema>;
export type RegisterResponse = StripVersion<RegisterResponseWire>;

export const LoginRequestSchema = versionedWireObject(AUTH_PROTOCOL_VERSION, {
  username: z.string().min(3).max(32),
  password: z.string().min(1).max(128),
  device: DeviceProvisioningSchema,
});
export type LoginRequestWire = z.infer<typeof LoginRequestSchema>;
export type LoginRequest = StripVersion<LoginRequestWire>;

export const LoginResponseSchema = versionedWireObject(AUTH_PROTOCOL_VERSION, {
  userId: z.string().uuid(),
  deviceId: z.string().uuid(),
  accessToken: z.string(),
  user: z.object({ username: z.string() }),
  /** Present only when the server detects a native client. See RegisterResponseSchema. */
  refreshToken: z.string().optional(),
});
export type LoginResponseWire = z.infer<typeof LoginResponseSchema>;
export type LoginResponse = StripVersion<LoginResponseWire>;

export const RefreshResponseSchema = versionedWireObject(AUTH_PROTOCOL_VERSION, {
  accessToken: z.string(),
  /** Rotated refresh token — present only for native clients. See RegisterResponseSchema. */
  refreshToken: z.string().optional(),
});
export type RefreshResponseWire = z.infer<typeof RefreshResponseSchema>;
export type RefreshResponse = StripVersion<RefreshResponseWire>;
