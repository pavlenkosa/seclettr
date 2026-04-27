import { describe, expect, it } from "vitest";
import { canReceiveRemoteMediaOnTransceiver } from "@/calls/direct/model/call-transceiver-state";

describe("call transceiver state", () => {
  it("treats recvonly and sendrecv as active remote receive states", () => {
    expect(canReceiveRemoteMediaOnTransceiver({
      currentDirection: "recvonly",
      direction: "recvonly",
    })).toBe(true);
    expect(canReceiveRemoteMediaOnTransceiver({
      currentDirection: "sendrecv",
      direction: "recvonly",
    })).toBe(true);
  });

  it("treats inactive and sendonly as non-receiving states", () => {
    expect(canReceiveRemoteMediaOnTransceiver({
      currentDirection: "inactive",
      direction: "recvonly",
    })).toBe(false);
    expect(canReceiveRemoteMediaOnTransceiver({
      currentDirection: "sendonly",
      direction: "recvonly",
    })).toBe(false);
  });

  it("falls back to local direction before currentDirection is negotiated", () => {
    expect(canReceiveRemoteMediaOnTransceiver({
      currentDirection: null,
      direction: "recvonly",
    })).toBe(true);
    expect(canReceiveRemoteMediaOnTransceiver({
      currentDirection: null,
      direction: "inactive",
    })).toBe(false);
  });
});
