import { describe, expect, it } from "vitest";
import {
  hasAuthoritativeGroupCallDeviceRoster,
  hasMissingRemoteGroupDevices,
  mergeGroupCallDeviceRoster,
  selectAuthoritativeGroupCallParticipantDevices,
  shouldRefreshAuthoritativeGroupCallDeviceRoster,
  toGroupCallDeviceRoster,
  type GroupCallDeviceRoster,
} from "@/calls/group/model/group-call-device-roster";

describe("group-call-device-roster", () => {
  it("merges device lists and preserves known identity keys", () => {
    const currentRoster: GroupCallDeviceRoster = {
      alice: [
        { deviceId: "a-1", identityKeyPublic: "key-a-1" },
      ],
    };
    const incomingRoster: GroupCallDeviceRoster = {
      alice: [
        { deviceId: "a-1" },
        { deviceId: "a-2", identityKeyPublic: "key-a-2" },
      ],
    };

    expect(mergeGroupCallDeviceRoster(currentRoster, incomingRoster)).toEqual({
      alice: [
        { deviceId: "a-1", identityKeyPublic: "key-a-1" },
        { deviceId: "a-2", identityKeyPublic: "key-a-2" },
      ],
    });
  });

  it("detects missing remote active devices while ignoring the local device", () => {
    const roster: GroupCallDeviceRoster = {
      alice: [{ deviceId: "alice-phone", identityKeyPublic: "k1" }],
      bob: [{ deviceId: "bob-phone", identityKeyPublic: "k2" }],
    };

    expect(hasMissingRemoteGroupDevices(
      roster,
      {
        alice: ["alice-phone"],
        bob: ["bob-phone", "bob-laptop"],
      },
      "alice",
      "alice-phone"
    )).toBe(true);

    expect(hasMissingRemoteGroupDevices(
      roster,
      {
        alice: ["alice-phone"],
        bob: ["bob-phone"],
      },
      "alice",
      "alice-phone"
    )).toBe(false);
  });

  it("marks the authoritative roster as present only when active participant devices are known", () => {
    expect(hasAuthoritativeGroupCallDeviceRoster({})).toBe(false);
    expect(
      hasAuthoritativeGroupCallDeviceRoster({
        alice: ["alice-phone"],
      })
    ).toBe(true);
  });

  it("decides when the authoritative roster must be refreshed", () => {
    const roster: GroupCallDeviceRoster = {
      alice: [{ deviceId: "alice-phone", identityKeyPublic: "k1" }],
      bob: [{ deviceId: "bob-phone", identityKeyPublic: "k2" }],
    };

    expect(
      shouldRefreshAuthoritativeGroupCallDeviceRoster({
        currentGroupId: "group-1",
        loadedGroupId: null,
        roster,
        activeParticipantDeviceIdsByUserId: {},
        localUserId: "alice",
        localDeviceId: "alice-phone",
      })
    ).toBe(true);

    expect(
      shouldRefreshAuthoritativeGroupCallDeviceRoster({
        currentGroupId: "group-1",
        loadedGroupId: "group-1",
        roster,
        activeParticipantDeviceIdsByUserId: {
          alice: ["alice-phone"],
          bob: ["bob-phone"],
        },
        localUserId: "alice",
        localDeviceId: "alice-phone",
      })
    ).toBe(false);

    expect(
      shouldRefreshAuthoritativeGroupCallDeviceRoster({
        currentGroupId: "group-1",
        loadedGroupId: "group-1",
        roster,
        activeParticipantDeviceIdsByUserId: {
          alice: ["alice-phone"],
          bob: ["bob-phone", "bob-laptop"],
        },
        localUserId: "alice",
        localDeviceId: "alice-phone",
      })
    ).toBe(true);
  });

  it("selects shareable participant devices from the authoritative roster only", () => {
    const roster: GroupCallDeviceRoster = {
      alice: [
        { deviceId: "alice-phone", identityKeyPublic: "k1" },
        { deviceId: "alice-tablet", identityKeyPublic: "k2" },
      ],
      bob: [
        { deviceId: "bob-phone", identityKeyPublic: "k3" },
        { deviceId: "bob-laptop", identityKeyPublic: "k4" },
      ],
    };

    expect(
      selectAuthoritativeGroupCallParticipantDevices({
        roster,
        participantUserId: "alice",
        activeParticipantDeviceIdsByUserId: {
          alice: ["alice-phone", "alice-tablet"],
        },
        localUserId: "alice",
        localDeviceId: "alice-phone",
      })
    ).toEqual([{ deviceId: "alice-tablet", identityKeyPublic: "k2" }]);

    expect(
      selectAuthoritativeGroupCallParticipantDevices({
        roster,
        participantUserId: "bob",
        activeParticipantDeviceIdsByUserId: {
          bob: ["bob-laptop"],
        },
        localUserId: "alice",
        localDeviceId: "alice-phone",
      })
    ).toEqual([{ deviceId: "bob-laptop", identityKeyPublic: "k4" }]);
  });

  it("converts member-device DTOs into the internal roster shape", () => {
    expect(
      toGroupCallDeviceRoster([
        {
          userId: "alice",
          devices: [{ deviceId: "alice-phone", identityKeyPublic: "k1" }],
        },
        {
          userId: "bob",
          devices: [{ deviceId: "bob-phone", identityKeyPublic: "k2" }],
        },
      ])
    ).toEqual({
      alice: [{ deviceId: "alice-phone", identityKeyPublic: "k1" }],
      bob: [{ deviceId: "bob-phone", identityKeyPublic: "k2" }],
    });
  });
});
