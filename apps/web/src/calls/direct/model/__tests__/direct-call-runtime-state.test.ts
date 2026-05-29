import { describe, expect, it } from "vitest";
import type {
  ActiveCall,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";
import {
  DIRECT_CALL_RUNTIME_STATE_DEFINITIONS,
  type DirectCallRuntimeAction,
  type DirectCallRuntimeState,
  canDirectCallRuntimeAction,
  resolveDirectCallRuntimeState,
} from "@/calls/direct/model/direct-call-runtime-state";

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer One",
    callType: "audio",
    direction: "outbound",
    state: "active",
    muted: false,
    videoOff: true,
    screenSharing: false,
    duration: 12,
    signalingVerified: true,
    e2eeActive: true,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: "transport",
    peerSupportsRenegotiationV1: true,
    ...overrides,
  };
}

function createIncomingCall(): IncomingCall {
  return {
    callId: "call-incoming",
    callerUserId: "peer-2",
    callerDeviceId: "device-2",
    callerLabel: "Peer Two",
    callType: "video",
    targetUserId: "user-1",
    offerSdp: "offer-sdp",
    mediaEncryptionOffer: {
      preferredMode: "transport",
      supportedModes: ["transport"],
    },
    supportsRenegotiationV1: true,
  };
}

const ALL_STATES: DirectCallRuntimeState[] = [
  "idle",
  "incoming",
  "outgoing",
  "connecting",
  "active_audio",
  "active_video",
  "screen_sharing",
  "reconnecting",
];

const ALL_ACTIONS: DirectCallRuntimeAction[] = [
  "start_outbound_call",
  "accept_incoming_call",
  "decline_incoming_call",
  "retry_connect",
  "end_call",
  "toggle_mute",
  "toggle_video",
  "toggle_screen_share",
  "open_security_details",
];

describe("resolveDirectCallRuntimeState", () => {
  it("returns incoming when an incoming call is present", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: null,
        incoming: createIncomingCall(),
      }),
    ).toBe("incoming");
  });

  it("returns idle when no session is active", () => {
    expect(
      resolveDirectCallRuntimeState({ active: null, incoming: null }),
    ).toBe("idle");
  });

  it("returns reconnecting when peerConnectionState is disconnected", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall(),
        incoming: null,
        peerConnectionState: "disconnected",
      }),
    ).toBe("reconnecting");
  });

  it("returns reconnecting when peerConnectionState is failed", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall(),
        incoming: null,
        peerConnectionState: "failed",
      }),
    ).toBe("reconnecting");
  });

  it("returns reconnecting when iceConnectionState is disconnected", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall(),
        incoming: null,
        iceConnectionState: "disconnected",
      }),
    ).toBe("reconnecting");
  });

  it("returns reconnecting when iceConnectionState is failed", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall(),
        incoming: null,
        iceConnectionState: "failed",
      }),
    ).toBe("reconnecting");
  });

  it("returns outgoing for a ringing outbound call", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({ state: "ringing" }),
        incoming: null,
      }),
    ).toBe("outgoing");
  });

  it("returns connecting when active state is connecting", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({ state: "connecting" }),
        incoming: null,
      }),
    ).toBe("connecting");
  });

  it("returns screen_sharing when screen sharing is active", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({
          state: "active",
          callType: "video",
          screenSharing: true,
          videoOff: false,
        }),
        incoming: null,
      }),
    ).toBe("screen_sharing");
  });

  it("returns active_video for a video call with video on", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({
          callType: "video",
          videoOff: false,
        }),
        incoming: null,
      }),
    ).toBe("active_video");
  });

  it("returns active_audio for an audio call", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({ callType: "audio" }),
        incoming: null,
      }),
    ).toBe("active_audio");
  });

  it("returns active_audio for a video call with video off", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({
          callType: "video",
          videoOff: true,
        }),
        incoming: null,
      }),
    ).toBe("active_audio");
  });

  it("prioritises incoming over reconnecting", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({ state: "active" }),
        incoming: createIncomingCall(),
        peerConnectionState: "disconnected",
      }),
    ).toBe("incoming");
  });

  it("prioritises reconnecting over ringing", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({ state: "ringing" }),
        incoming: null,
        peerConnectionState: "disconnected",
      }),
    ).toBe("reconnecting");
  });

  it("prioritises reconnecting over connecting", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({ state: "connecting" }),
        incoming: null,
        peerConnectionState: "disconnected",
      }),
    ).toBe("reconnecting");
  });

  it("prioritises screen_sharing over active_video", () => {
    expect(
      resolveDirectCallRuntimeState({
        active: createActiveCall({
          callType: "video",
          videoOff: false,
          screenSharing: true,
        }),
        incoming: null,
      }),
    ).toBe("screen_sharing");
  });
});

describe("canDirectCallRuntimeAction", () => {
  it.each(ALL_STATES)(
    "allows actions listed in DIRECT_CALL_RUNTIME_STATE_DEFINITIONS for %s",
    (state) => {
      const definition = DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state];
      for (const action of ALL_ACTIONS) {
        const expected = definition.allowedActions.includes(action);
        expect(canDirectCallRuntimeAction(state, action)).toBe(expected);
      }
    },
  );

  it("allows end_call from every non-terminal state", () => {
    const nonTerminal = ALL_STATES;
    for (const state of nonTerminal) {
      const expected =
        DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state].allowedActions.includes(
          "end_call",
        );
      expect(canDirectCallRuntimeAction(state, "end_call")).toBe(expected);
    }
  });

  it("rejects every forbidden action per state definition", () => {
    for (const state of ALL_STATES) {
      const definition = DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state];
      for (const action of definition.forbiddenActions) {
        expect(canDirectCallRuntimeAction(state, action)).toBe(false);
      }
    }
  });
});

describe("state definition completeness", () => {
  it("every state has entry and exit events", () => {
    for (const state of ALL_STATES) {
      const definition = DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state];
      expect(definition.entryEvents.length).toBeGreaterThan(0);
      expect(definition.exitEvents.length).toBeGreaterThan(0);
    }
  });

  it("every state has required cleanup actions", () => {
    for (const state of ALL_STATES) {
      const definition = DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state];
      expect(definition.requiredCleanup.length).toBeGreaterThan(0);
    }
  });

  it("allowedActions and forbiddenActions are disjoint per state", () => {
    for (const state of ALL_STATES) {
      const definition = DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state];
      for (const allowed of definition.allowedActions) {
        expect(definition.forbiddenActions).not.toContain(allowed);
      }
    }
  });

  it("allowedActions + forbiddenActions cover all actions per state", () => {
    for (const state of ALL_STATES) {
      const definition = DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state];
      const covered = new Set([
        ...definition.allowedActions,
        ...definition.forbiddenActions,
      ]);
      const uncovered = ALL_ACTIONS.filter((a) => !covered.has(a));
      expect(uncovered, `${state} has uncovered actions: ${uncovered.join(", ")}`).toEqual([]);
    }
  });
});
