import { describe, expect, it } from "vitest";
import {
  groupCallStatusReducer,
  type GroupCallStatus,
} from "@/calls/group/model/group-call-types";

function reduce(
  state: GroupCallStatus,
  action: Parameters<typeof groupCallStatusReducer>[1]
): GroupCallStatus {
  return groupCallStatusReducer(state, action);
}

describe("groupCallStatusReducer", () => {
  it("starts a new session from any state", () => {
    expect(reduce("idle", { type: "SESSION_START" })).toBe("starting");
    expect(reduce("ready", { type: "SESSION_START" })).toBe("starting");
    expect(reduce("leaving", { type: "SESSION_START" })).toBe("starting");
    expect(reduce("error", { type: "SESSION_START" })).toBe("starting");
  });

  it("moves ready only from starting, joining, or reconnecting", () => {
    expect(reduce("starting", { type: "SESSION_READY" })).toBe("ready");
    expect(reduce("joining", { type: "SESSION_READY" })).toBe("ready");
    expect(reduce("reconnecting", { type: "SESSION_READY" })).toBe("ready");
    expect(reduce("idle", { type: "SESSION_READY" })).toBe("idle");
  });

  it("maps init/runtime failures to error", () => {
    expect(reduce("idle", { type: "SESSION_INIT_FAILED" })).toBe("error");
    expect(reduce("ready", { type: "SESSION_ERROR" })).toBe("error");
  });

  it("moves live states into leaving for leave/host-ended, and ending for end-for-everyone", () => {
    expect(reduce("ready", { type: "USER_LEAVE" })).toBe("leaving");
    expect(reduce("reconnecting", { type: "CALL_ENDED_BY_HOST" })).toBe("leaving");
    expect(reduce("joining", { type: "USER_END_FOR_EVERYONE" })).toBe("ending");
    expect(reduce("ready", { type: "USER_END_FOR_EVERYONE" })).toBe("ending");
  });

  it("does not overwrite terminal ended/error states with leaving", () => {
    expect(reduce("ended", { type: "USER_LEAVE" })).toBe("ended");
    expect(reduce("error", { type: "CALL_ENDED_BY_HOST" })).toBe("error");
  });

  it("enters reconnecting from the active call state", () => {
    expect(reduce("ready", { type: "RECONNECT_START" })).toBe("reconnecting");
    expect(reduce("reconnecting", { type: "RECONNECT_START" })).toBe("reconnecting");
  });

  it("does not enter reconnecting from non-ready states", () => {
    expect(reduce("idle", { type: "RECONNECT_START" })).toBe("idle");
    expect(reduce("starting", { type: "RECONNECT_START" })).toBe("starting");
    expect(reduce("joining", { type: "RECONNECT_START" })).toBe("joining");
    expect(reduce("error", { type: "RECONNECT_START" })).toBe("error");
    expect(reduce("leaving", { type: "RECONNECT_START" })).toBe("leaving");
  });
});
