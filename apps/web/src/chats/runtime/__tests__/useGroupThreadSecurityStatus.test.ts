import { beforeEach, describe, expect, it, vi } from "vitest";

const computeSafetyCodesMock = vi.fn();
const getSafetyVerificationRecordMock = vi.fn();

vi.mock("@/lib/safety", () => ({
  computeSafetyCodes: computeSafetyCodesMock,
  getSafetyVerificationRecord: getSafetyVerificationRecordMock,
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
}));

describe("resolveGroupThreadSecurityStatus", () => {
  beforeEach(() => {
    computeSafetyCodesMock.mockReset();
    getSafetyVerificationRecordMock.mockReset();
  });

  it("returns verified when every peer member has at least one verified device", async () => {
    const { resolveGroupThreadSecurityStatus } = await import(
      "@/chats/runtime/useGroupThreadSecurityStatus"
    );
    const fetchGroupSecurityDevices = vi.fn().mockResolvedValue({
      "user-a": [{ deviceId: "device-a", identityKeyPublic: "identity-a" }],
      "user-b": [{ deviceId: "device-b", identityKeyPublic: "identity-b" }],
    });
    computeSafetyCodesMock
      .mockResolvedValueOnce({ safetyHash: "hash-a" })
      .mockResolvedValueOnce({ safetyHash: "hash-b" });
    getSafetyVerificationRecordMock
      .mockResolvedValueOnce({ safetyHash: "hash-a" })
      .mockResolvedValueOnce({ safetyHash: "hash-b" });

    await expect(
      resolveGroupThreadSecurityStatus({
        activeGroup: {
          groupId: "group-1",
          members: [
            {
              userId: "user-self",
              username: "self",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
            {
              userId: "user-a",
              username: "A",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
            {
              userId: "user-b",
              username: "B",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
          ],
        },
        identityDhKeyPair: { publicKey: new Uint8Array(32).fill(1) },
        userId: "user-self",
        deviceId: "device-self",
        fetchGroupSecurityDevices,
      })
    ).resolves.toBe("verified");

    expect(fetchGroupSecurityDevices).toHaveBeenCalledWith("group-1");
  });

  it("returns unverified when any peer member lacks a verified device", async () => {
    const { resolveGroupThreadSecurityStatus } = await import(
      "@/chats/runtime/useGroupThreadSecurityStatus"
    );
    const fetchGroupSecurityDevices = vi.fn().mockResolvedValue({
      "user-a": [{ deviceId: "device-a", identityKeyPublic: "identity-a" }],
    });
    computeSafetyCodesMock.mockResolvedValue({ safetyHash: "hash-a" });
    getSafetyVerificationRecordMock.mockResolvedValue(null);

    await expect(
      resolveGroupThreadSecurityStatus({
        activeGroup: {
          groupId: "group-1",
          members: [
            {
              userId: "user-self",
              username: "self",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
            {
              userId: "user-a",
              username: "A",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
          ],
        },
        identityDhKeyPair: { publicKey: new Uint8Array(32).fill(1) },
        userId: "user-self",
        deviceId: "device-self",
        fetchGroupSecurityDevices,
      })
    ).resolves.toBe("unverified");
  });

  it("returns verified when each peer member has one verified device among multiple devices", async () => {
    const { resolveGroupThreadSecurityStatus } = await import(
      "@/chats/runtime/useGroupThreadSecurityStatus"
    );
    const fetchGroupSecurityDevices = vi.fn().mockResolvedValue({
      "user-a": [
        { deviceId: "device-a-1", identityKeyPublic: "identity-a-1" },
        { deviceId: "device-a-2", identityKeyPublic: "identity-a-2" },
      ],
      "user-b": [
        { deviceId: "device-b-1", identityKeyPublic: "identity-b-1" },
      ],
    });
    computeSafetyCodesMock
      .mockResolvedValueOnce({ safetyHash: "hash-a-1" })
      .mockResolvedValueOnce({ safetyHash: "hash-a-2" })
      .mockResolvedValueOnce({ safetyHash: "hash-b-1" });
    getSafetyVerificationRecordMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ safetyHash: "hash-a-2" })
      .mockResolvedValueOnce({ safetyHash: "hash-b-1" });

    await expect(
      resolveGroupThreadSecurityStatus({
        activeGroup: {
          groupId: "group-1",
          members: [
            {
              userId: "user-self",
              username: "self",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
            {
              userId: "user-a",
              username: "A",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
            {
              userId: "user-b",
              username: "B",
              role: "member",
              joinedAt: new Date(0).toISOString(),
            },
          ],
        },
        identityDhKeyPair: { publicKey: new Uint8Array(32).fill(1) },
        userId: "user-self",
        deviceId: "device-self",
        fetchGroupSecurityDevices,
      })
    ).resolves.toBe("verified");
  });
});
