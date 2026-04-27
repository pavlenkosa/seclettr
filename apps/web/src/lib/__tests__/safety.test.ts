import { describe, expect, it } from "vitest";
import {
  computeSafetyCodes,
  selectPeerDeviceId,
} from "@/lib/safety";

describe("computeSafetyCodes", () => {
  const keyA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const keyB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  const userA = "00000000-0000-4000-8000-000000000001";
  const userB = "00000000-0000-4000-8000-000000000002";

  it("is deterministic for the same inputs", async () => {
    const first = await computeSafetyCodes(keyA, keyB, userA, userB);
    const second = await computeSafetyCodes(keyA, keyB, userA, userB);
    expect(first).toEqual(second);
  });

  it("is invariant to participant order", async () => {
    const ab = await computeSafetyCodes(keyA, keyB, userA, userB);
    const ba = await computeSafetyCodes(keyB, keyA, userB, userA);
    expect(ab).toEqual(ba);
  });

  it("changes when identity key changes", async () => {
    const base = await computeSafetyCodes(keyA, keyB, userA, userB);
    const changed = await computeSafetyCodes(
      keyA,
      "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      userA,
      userB
    );
    expect(changed.safetyHash).not.toBe(base.safetyHash);
  });
});

describe("selectPeerDeviceId", () => {
  const peerIdentityByDevice = {
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": "key-b",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": "key-a",
  };

  it("keeps previous selection when still available", () => {
    const selected = selectPeerDeviceId({
      peerIdentityByDevice,
      previousDeviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      preferredDeviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(selected).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });

  it("uses preferred selection when previous is missing", () => {
    const selected = selectPeerDeviceId({
      peerIdentityByDevice,
      previousDeviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      preferredDeviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(selected).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("requires explicit selection for ambiguous multi-device peer", () => {
    const selected = selectPeerDeviceId({
      peerIdentityByDevice,
    });
    expect(selected).toBeNull();
  });

  it("auto-selects single peer device", () => {
    const selected = selectPeerDeviceId({
      peerIdentityByDevice: {
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd": "key-d",
      },
    });
    expect(selected).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });
});
