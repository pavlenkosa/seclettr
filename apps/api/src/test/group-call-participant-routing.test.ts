import { describe, expect, it } from "vitest";
import {
  buildParticipantLifecycleEvents,
  type ParticipantLifecycleInput,
} from "../services/group-call-participant-routing.js";

const BASE_INPUT: ParticipantLifecycleInput = {
  groupId: "group-1",
  callId: "call-1",
  userId: "user-1",
  deviceId: "device-1",
  sessionId: "session-1",
  timestamp: "2026-06-10T12:00:00.000Z",
  includeUserEvent: false,
};

describe("buildParticipantLifecycleEvents", () => {
  it("builds device-level joined event when includeUserEvent is false", () => {
    const events = buildParticipantLifecycleEvents("joined", BASE_INPUT);

    expect(events).toHaveLength(1);
    expect(events[0]!).toMatchObject({
      type: "group.call.participant_device_joined",
      groupId: "group-1",
      callId: "call-1",
      userId: "user-1",
      deviceId: "device-1",
      sessionId: "session-1",
      joinedAt: "2026-06-10T12:00:00.000Z",
    });
  });

  it("builds both device-level and user-level joined events when includeUserEvent is true", () => {
    const events = buildParticipantLifecycleEvents("joined", {
      ...BASE_INPUT,
      includeUserEvent: true,
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("group.call.participant_device_joined");
    expect(events[1]!.type).toBe("group.call.participant_joined");
  });

  it("builds device-level left event when includeUserEvent is false", () => {
    const events = buildParticipantLifecycleEvents("left", BASE_INPUT);

    expect(events).toHaveLength(1);
    expect(events[0]!).toMatchObject({
      type: "group.call.participant_device_left",
      groupId: "group-1",
      callId: "call-1",
      userId: "user-1",
      deviceId: "device-1",
      sessionId: "session-1",
      leftAt: "2026-06-10T12:00:00.000Z",
    });
  });

  it("builds both left events when includeUserEvent is true", () => {
    const events = buildParticipantLifecycleEvents("left", {
      ...BASE_INPUT,
      includeUserEvent: true,
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("group.call.participant_device_left");
    expect(events[1]!.type).toBe("group.call.participant_left");
  });

  it("omits sessionId when null", () => {
    const events = buildParticipantLifecycleEvents("joined", {
      ...BASE_INPUT,
      sessionId: null,
    });

    expect(events[0]).not.toHaveProperty("sessionId");
  });

  it("omits sessionId when undefined", () => {
    const { sessionId: _unused, ...inputWithoutSession } = BASE_INPUT;
    const events = buildParticipantLifecycleEvents("joined", inputWithoutSession);

    expect(events[0]!).not.toHaveProperty("sessionId");
  });
});
