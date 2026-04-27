import { describe, expect, it } from "vitest";
import {
  AUTH_PROTOCOL_VERSION,
  LoginRequestSchema,
  RegisterRequestSchema,
} from "../auth.js";
import {
  DEVICES_PROTOCOL_VERSION,
  DeviceListResponseSchema,
  PreKeyBundleSchema,
  ReplenishPreKeysRequestSchema,
  UpdateCurrentDeviceCryptoMaterialRequestSchema,
  UserSearchResponseSchema,
} from "../devices.js";
import {
  CreateGroupRequestSchema,
  GROUPS_PROTOCOL_VERSION,
  GroupMutationResponseSchema,
  GroupResponseSchema,
} from "../groups.js";

const uuidA = "11111111-1111-4111-8111-111111111111";
const key43 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const sig88 =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("auth wire contracts", () => {
  it("requires an explicit auth protocol version on register", () => {
    const parsed = RegisterRequestSchema.safeParse({
      version: AUTH_PROTOCOL_VERSION,
      username: "alice_test",
      password: "StrongPass123!",
      device: {
        name: "Test Device",
        identityKeyPublic: key43,
        signingKeyPublic: key43,
        registrationId: 1234,
        signedPreKey: {
          id: 1,
          publicKey: key43,
          signature: sig88,
        },
        oneTimePreKeys: [{ id: 1, publicKey: key43 }],
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects unknown auth protocol versions on login", () => {
    const parsed = LoginRequestSchema.safeParse({
      version: AUTH_PROTOCOL_VERSION + 1,
      username: "alice_test",
      password: "StrongPass123!",
      device: {
        name: "Test Device",
        identityKeyPublic: key43,
        signingKeyPublic: key43,
        registrationId: 1234,
        signedPreKey: {
          id: 1,
          publicKey: key43,
          signature: sig88,
        },
        oneTimePreKeys: [{ id: 1, publicKey: key43 }],
      },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("devices wire contracts", () => {
  it("accepts exact-match search results with a contact grant", () => {
    const parsed = UserSearchResponseSchema.safeParse({
      version: DEVICES_PROTOCOL_VERSION,
      users: [
        {
          userId: uuidA,
          username: "alice_test",
          contactGrant: "a".repeat(64),
          contactGrantExpiresAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a reserved OTK in the prekey bundle", () => {
    const parsed = PreKeyBundleSchema.safeParse({
      version: DEVICES_PROTOCOL_VERSION,
      userId: uuidA,
      deviceId: "22222222-2222-4222-8222-222222222222",
      registrationId: 1337,
      identityKeyPublic: key43,
      signingKeyPublic: key43,
      signedPreKey: {
        id: 7,
        publicKey: key43,
        signature: sig88,
      },
      oneTimePreKey: {
        id: 3,
        publicKey: key43,
        reservationToken: "b".repeat(64),
      },
      otkCount: 4,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects unversioned device replenish payloads", () => {
    const parsed = ReplenishPreKeysRequestSchema.safeParse({
      oneTimePreKeys: [{ id: 1, publicKey: key43 }],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts versioned current-device crypto material update payloads", () => {
    const parsed = UpdateCurrentDeviceCryptoMaterialRequestSchema.safeParse({
      version: DEVICES_PROTOCOL_VERSION,
      identityKeyPublic: key43,
      signingKeyPublic: key43,
      signedPreKey: {
        id: 1,
        publicKey: key43,
        signature: sig88,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects extra fields on the public device list", () => {
    const parsed = DeviceListResponseSchema.safeParse({
      version: DEVICES_PROTOCOL_VERSION,
      devices: [
        {
          deviceId: uuidA,
          name: "Laptop",
          identityKeyPublic: key43,
          signingKeyPublic: key43,
          registrationId: 1,
          createdAt: "2026-03-20T00:00:00.000Z",
          debug: true,
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("group wire contracts", () => {
  it("requires an explicit protocol version on create-group", () => {
    const parsed = CreateGroupRequestSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      name: "Launch",
      memberUserIds: [uuidA],
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a versioned group response", () => {
    const parsed = GroupResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      groupId: uuidA,
      name: "Launch",
      createdAt: "2026-03-20T00:00:00.000Z",
      members: [
        {
          userId: uuidA,
          username: "alice_test",
          joinedAt: "2026-03-20T00:00:00.000Z",
          role: "owner",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects malformed group mutation responses", () => {
    const parsed = GroupMutationResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      ok: false,
    });

    expect(parsed.success).toBe(false);
  });
});
