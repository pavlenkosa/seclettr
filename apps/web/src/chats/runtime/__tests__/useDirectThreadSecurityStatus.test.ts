import { beforeEach, describe, expect, it, vi } from "vitest";

const computeSafetyCodesMock = vi.fn();
const getSafetyVerificationRecordMock = vi.fn();
const getSafetyTrustIntegrityStateMock = vi.fn();
const selectPeerDeviceIdMock = vi.fn();

vi.mock("@/lib/safety", () => ({
  computeSafetyCodes: computeSafetyCodesMock,
  getSafetyVerificationRecord: getSafetyVerificationRecordMock,
  getSafetyTrustIntegrityState: getSafetyTrustIntegrityStateMock,
  selectPeerDeviceId: selectPeerDeviceIdMock,
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
}));

describe("resolveDirectThreadSecurityStatus", () => {
  beforeEach(() => {
    computeSafetyCodesMock.mockReset();
    getSafetyVerificationRecordMock.mockReset();
    getSafetyTrustIntegrityStateMock.mockReset();
    selectPeerDeviceIdMock.mockReset();
    getSafetyTrustIntegrityStateMock.mockResolvedValue({ degradedAt: null, issues: [] });
  });

  it("requires explicit re-verification when a peer identity alert exists", async () => {
    const { resolveDirectThreadSecurityStatus } = await import(
      "@/chats/runtime/useDirectThreadSecurityStatus"
    );

    await expect(
      resolveDirectThreadSecurityStatus({
        activeConversationUserId: "user-peer",
        activePeerIdentityAlertCount: 1,
        activePeerIdentityKey: "identity-peer",
        identityDhKeyPair: { publicKey: new Uint8Array(32).fill(1) },
        userId: "user-self",
        deviceId: "device-self",
      })
    ).resolves.toBe("reverify_required");

    expect(computeSafetyCodesMock).not.toHaveBeenCalled();
  });

  it("returns verified when the active peer device matches the stored safety record", async () => {
    const { resolveDirectThreadSecurityStatus } = await import(
      "@/chats/runtime/useDirectThreadSecurityStatus"
    );

    selectPeerDeviceIdMock.mockReturnValue("device-peer");
    computeSafetyCodesMock.mockResolvedValue({ safetyHash: "hash-1" });
    getSafetyVerificationRecordMock.mockResolvedValue({ safetyHash: "hash-1" });

    await expect(
      resolveDirectThreadSecurityStatus({
        activeConversationUserId: "user-peer",
        activePeerIdentityAlertCount: 0,
        activePeerIdentityKey: "identity-fallback",
        activePeerIdentityDeviceId: "device-peer",
        activePeerIdentityByDevice: {
          "device-peer": "identity-peer",
        },
        identityDhKeyPair: { publicKey: new Uint8Array(32).fill(1) },
        userId: "user-self",
        deviceId: "device-self",
      })
    ).resolves.toBe("verified");

    expect(computeSafetyCodesMock).toHaveBeenCalledWith(
      Buffer.alloc(32, 1).toString("base64url"),
      "identity-peer",
      "user-self",
      "user-peer"
    );
    expect(getSafetyVerificationRecordMock).toHaveBeenCalledWith(
      "user-self",
      "device-self",
      "user-peer",
      "device-peer"
    );
  });

  it("downgrades to reverify_required when browser trust history was degraded and no fresh verification exists", async () => {
    const { resolveDirectThreadSecurityStatus } = await import(
      "@/chats/runtime/useDirectThreadSecurityStatus"
    );

    selectPeerDeviceIdMock.mockReturnValue("device-peer");
    computeSafetyCodesMock.mockResolvedValue({ safetyHash: "hash-1" });
    getSafetyVerificationRecordMock.mockResolvedValue(null);
    getSafetyTrustIntegrityStateMock.mockResolvedValue({
      degradedAt: "2026-03-26T12:00:00.000Z",
      issues: ["persisted_peer_identity_invalid"],
    });

    await expect(
      resolveDirectThreadSecurityStatus({
        activeConversationUserId: "user-peer",
        activePeerIdentityAlertCount: 0,
        activePeerIdentityDeviceId: "device-peer",
        activePeerIdentityByDevice: {
          "device-peer": "identity-peer",
        },
        identityDhKeyPair: { publicKey: new Uint8Array(32).fill(1) },
        userId: "user-self",
        deviceId: "device-self",
      })
    ).resolves.toBe("reverify_required");
  });
});
