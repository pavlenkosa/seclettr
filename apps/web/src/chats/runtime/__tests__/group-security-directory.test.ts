import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGroupSecurityTarget,
  createGroupSecurityDirectory,
} from "@/chats/runtime/group-security-directory";

describe("createGroupSecurityDirectory", () => {
  const fetchMemberDevices = vi.fn();
  let currentTime = 1_000;

  beforeEach(() => {
    currentTime = 1_000;
    fetchMemberDevices.mockReset();
  });

  it("reuses the cached group security device roster within the TTL", async () => {
    const directory = createGroupSecurityDirectory({
      ttlMs: 2_000,
      now: () => currentTime,
      fetchMemberDevices,
    });
    fetchMemberDevices.mockResolvedValue([
      {
        userId: "user-1",
        devices: [{ deviceId: "device-1", identityKeyPublic: "key-1" }],
      },
    ]);

    await directory.fetchGroupSecurityDevices("group-1");
    await directory.fetchGroupSecurityDevices("group-1");

    expect(fetchMemberDevices).toHaveBeenCalledTimes(1);

    currentTime += 2_001;
    await directory.fetchGroupSecurityDevices("group-1");

    expect(fetchMemberDevices).toHaveBeenCalledTimes(2);
  });

  it("shares the in-flight request for concurrent readers", async () => {
    const directory = createGroupSecurityDirectory({
      now: () => currentTime,
      fetchMemberDevices,
    });
    let resolveRequest!: (
      value: Array<{
        userId: string;
        devices: Array<{ deviceId: string; identityKeyPublic: string }>;
      }>
    ) => void;
    fetchMemberDevices.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const first = directory.fetchGroupSecurityDevices("group-2");
    const second = directory.fetchGroupSecurityDevices("group-2");

    resolveRequest([
      {
        userId: "user-2",
        devices: [{ deviceId: "device-2", identityKeyPublic: "key-2" }],
      },
    ]);

    await expect(first).resolves.toEqual({
      "user-2": [{ deviceId: "device-2", identityKeyPublic: "key-2" }],
    });
    await expect(second).resolves.toEqual({
      "user-2": [{ deviceId: "device-2", identityKeyPublic: "key-2" }],
    });
    expect(fetchMemberDevices).toHaveBeenCalledTimes(1);
  });

  it("builds a deterministic security target from the cached group roster", () => {
    expect(
      buildGroupSecurityTarget(
        {
          userId: "user-2",
          username: "bob",
        },
        {
          "user-2": [
            { deviceId: "device-2b", identityKeyPublic: "key-2b" },
            { deviceId: "device-2a", identityKeyPublic: "key-2a" },
          ],
        }
      )
    ).toEqual({
      recipientUserId: "user-2",
      recipientUsername: "bob",
      peerIdentityByDevice: {
        "device-2a": "key-2a",
        "device-2b": "key-2b",
      },
      preferredDeviceId: "device-2a",
    });
  });
});
