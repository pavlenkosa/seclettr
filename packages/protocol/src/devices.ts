import { z } from "zod";
import {
  DEVICES_PROTOCOL_VERSION,
  type StripVersion,
  versionedWireObject,
  wireObject,
} from "./common.js";

export { DEVICES_PROTOCOL_VERSION } from "./common.js";

const ContactGrantSchema = z.string().min(32).max(2048);

const PublicDeviceSchema = wireObject({
  deviceId: z.string().uuid(),
  identityKeyPublic: z.string(),
  signingKeyPublic: z.string().optional(),
});

export const ContactableUserSchema = wireObject({
  userId: z.string().uuid(),
  username: z.string(),
  contactGrant: ContactGrantSchema,
  contactGrantExpiresAt: z.string().datetime(),
});
export type ContactableUser = z.infer<typeof ContactableUserSchema>;

export const UserSearchResponseSchema = versionedWireObject(
  DEVICES_PROTOCOL_VERSION,
  {
    users: z.array(ContactableUserSchema).max(1),
  }
);
export type UserSearchResponseWire = z.infer<typeof UserSearchResponseSchema>;
export type UserSearchResponse = StripVersion<UserSearchResponseWire>;

export const PreKeyBundleSchema = versionedWireObject(DEVICES_PROTOCOL_VERSION, {
  userId: z.string().uuid(),
  deviceId: z.string().uuid(),
  registrationId: z.number().int(),
  identityKeyPublic: z.string(),
  signingKeyPublic: z.string(),
  signedPreKey: z.object({
    id: z.number().int(),
    publicKey: z.string(),
    signature: z.string(),
  }),
  oneTimePreKey: z
    .object({
      id: z.number().int(),
      publicKey: z.string(),
      reservationToken: ContactGrantSchema,
    })
    .optional(),
  otkCount: z.number().int().min(0),
});
export type PreKeyBundleWire = z.infer<typeof PreKeyBundleSchema>;
export type PreKeyBundle = StripVersion<PreKeyBundleWire>;

export const DeviceSchema = wireObject({
  deviceId: z.string().uuid(),
  name: z.string(),
  identityKeyPublic: z.string(),
  signingKeyPublic: z.string(),
  registrationId: z.number().int(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().optional(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const UserDeviceDirectoryEntrySchema = PublicDeviceSchema;
export type UserDeviceDirectoryEntry = z.infer<typeof UserDeviceDirectoryEntrySchema>;

export const DeviceListResponseSchema = versionedWireObject(
  DEVICES_PROTOCOL_VERSION,
  {
    devices: z.array(DeviceSchema),
  }
);
export type DeviceListResponseWire = z.infer<typeof DeviceListResponseSchema>;
export type DeviceListResponse = StripVersion<DeviceListResponseWire>;

export const UserDeviceDirectoryResponseSchema = versionedWireObject(
  DEVICES_PROTOCOL_VERSION,
  {
    devices: z.array(UserDeviceDirectoryEntrySchema),
  }
);
export type UserDeviceDirectoryResponseWire = z.infer<
  typeof UserDeviceDirectoryResponseSchema
>;
export type UserDeviceDirectoryResponse = StripVersion<
  UserDeviceDirectoryResponseWire
>;

export const UserPresenceResponseSchema = versionedWireObject(
  DEVICES_PROTOCOL_VERSION,
  {
  userId: z.string().uuid(),
  online: z.boolean(),
  lastSeenAt: z.string().datetime().optional(),
  }
);
export type UserPresenceResponseWire = z.infer<
  typeof UserPresenceResponseSchema
>;
export type UserPresenceResponse = StripVersion<UserPresenceResponseWire>;

export const ReplenishPreKeysRequestSchema = versionedWireObject(
  DEVICES_PROTOCOL_VERSION,
  {
  oneTimePreKeys: z
    .array(
      z.object({
        id: z.number().int().min(1).max(2147483647),
        publicKey: z.string().min(43).max(44),
      })
    )
    .min(1)
    .max(100),
  }
);
export type ReplenishPreKeysRequestWire = z.infer<
  typeof ReplenishPreKeysRequestSchema
>;
export type ReplenishPreKeysRequest = StripVersion<
  ReplenishPreKeysRequestWire
>;

export const UpdateCurrentDeviceCryptoMaterialRequestSchema = versionedWireObject(
  DEVICES_PROTOCOL_VERSION,
  {
    identityKeyPublic: z.string().min(43).max(44),
    signingKeyPublic: z.string().min(43).max(44),
    signedPreKey: z.object({
      id: z.number().int().min(1).max(2147483647),
      publicKey: z.string().min(43).max(44),
      signature: z.string().min(86).max(88),
    }),
  }
);
export type UpdateCurrentDeviceCryptoMaterialRequestWire = z.infer<
  typeof UpdateCurrentDeviceCryptoMaterialRequestSchema
>;
export type UpdateCurrentDeviceCryptoMaterialRequest = StripVersion<
  UpdateCurrentDeviceCryptoMaterialRequestWire
>;

export const RotateSignedPreKeyRequestSchema = versionedWireObject(
  DEVICES_PROTOCOL_VERSION,
  {
  signedPreKey: z.object({
    id: z.number().int().min(1).max(2147483647),
    publicKey: z.string().min(43).max(44),
    signature: z.string().min(86).max(88),
  }),
  }
);
export type RotateSignedPreKeyRequestWire = z.infer<
  typeof RotateSignedPreKeyRequestSchema
>;
export type RotateSignedPreKeyRequest = StripVersion<
  RotateSignedPreKeyRequestWire
>;
