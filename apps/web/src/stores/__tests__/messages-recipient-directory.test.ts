import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRecipientDeviceDirectory,
  type RecipientDeviceInfo,
} from "@/stores/messages/recipient-directory";

describe("createRecipientDeviceDirectory", () => {
  const fetchRecipientDevicesMock = vi.fn();
  const establishDirectRelationshipMock = vi.fn();
  let currentTime = 10_000;

  const createDirectory = () =>
    createRecipientDeviceDirectory({
      getRequesterUserId: () => "user-self",
      fetchRecipientDevices: async (recipientUserId) =>
        (await fetchRecipientDevicesMock(recipientUserId)) as RecipientDeviceInfo[],
      establishDirectRelationship: async (recipientUserId) => {
        await establishDirectRelationshipMock(recipientUserId);
      },
      recipientDeviceCacheTtlMs: 5_000,
      directRelationshipCacheTtlMs: 3_000,
      now: () => currentTime,
    });

  beforeEach(() => {
    currentTime = 10_000;
    fetchRecipientDevicesMock.mockReset();
    establishDirectRelationshipMock.mockReset();
  });

  it("reuses the cached device list until the TTL expires", async () => {
    const directory = createDirectory();
    fetchRecipientDevicesMock.mockResolvedValue([
      { deviceId: "device-b", identityKeyPublic: "key-b" },
      { deviceId: "device-a", identityKeyPublic: "key-a" },
    ]);

    await expect(directory.getRecipientDevices("user-peer")).resolves.toEqual([
      { deviceId: "device-a", identityKeyPublic: "key-a" },
      { deviceId: "device-b", identityKeyPublic: "key-b" },
    ]);
    await directory.getRecipientDevices("user-peer");

    expect(fetchRecipientDevicesMock).toHaveBeenCalledTimes(1);

    currentTime += 5_001;
    await directory.getRecipientDevices("user-peer");

    expect(fetchRecipientDevicesMock).toHaveBeenCalledTimes(2);
  });

  it("forces a refresh when only the local device is present", async () => {
    const directory = createDirectory();
    fetchRecipientDevicesMock
      .mockResolvedValueOnce([
        { deviceId: "device-self", identityKeyPublic: "key-self" },
      ])
      .mockResolvedValueOnce([
        { deviceId: "device-self", identityKeyPublic: "key-self" },
        { deviceId: "device-peer", identityKeyPublic: "key-peer" },
      ]);

    await expect(
      directory.getDeliverableRecipientDevices("user-peer", "device-self")
    ).resolves.toEqual([
      { deviceId: "device-peer", identityKeyPublic: "key-peer" },
    ]);

    expect(fetchRecipientDevicesMock).toHaveBeenCalledTimes(2);
  });

  it("caches direct relationship bootstrap separately from device fetches", async () => {
    const directory = createDirectory();
    establishDirectRelationshipMock.mockResolvedValue(undefined);

    await directory.ensureDirectRelationship("user-peer");
    await directory.ensureDirectRelationship("user-peer");

    expect(establishDirectRelationshipMock).toHaveBeenCalledTimes(1);

    currentTime += 3_001;
    await directory.ensureDirectRelationship("user-peer");

    expect(establishDirectRelationshipMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates cached device lists for the requested recipient", async () => {
    const directory = createDirectory();
    fetchRecipientDevicesMock
      .mockResolvedValueOnce([
        { deviceId: "device-peer", identityKeyPublic: "key-peer" },
      ])
      .mockResolvedValueOnce([
        { deviceId: "device-peer", identityKeyPublic: "key-peer-next" },
      ]);

    await directory.getRecipientDevices("user-peer");
    directory.invalidateRecipientDeviceCache("user-peer");
    await expect(directory.getRecipientDevices("user-peer")).resolves.toEqual([
      { deviceId: "device-peer", identityKeyPublic: "key-peer-next" },
    ]);

    expect(fetchRecipientDevicesMock).toHaveBeenCalledTimes(2);
  });
});
