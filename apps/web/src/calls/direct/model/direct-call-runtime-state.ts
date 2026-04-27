import type { ActiveCall, IncomingCall } from "./direct-call-types";
import type { SharedCallLifecyclePhase } from "@/calls/shared/model/call-lifecycle-contract";

/**
 * Derived runtime snapshot used by UI/debug surfaces.
 *
 * `ActiveCall.state` remains the authoritative persisted session phase.
 * This model is derived from runtime-owned data such as:
 * - active vs incoming ownership
 * - session phase
 * - transport connection state
 * - media toggles
 */
export type DirectCallRuntimeState =
  | "idle"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "active_audio"
  | "active_video"
  | "screen_sharing"
  | "reconnecting";

export type DirectCallRuntimeAction =
  | "start_outbound_call"
  | "accept_incoming_call"
  | "decline_incoming_call"
  | "retry_connect"
  | "end_call"
  | "toggle_mute"
  | "toggle_video"
  | "toggle_screen_share"
  | "open_security_details";

interface DirectCallRuntimeStateDefinition {
  entryEvents: string[];
  exitEvents: string[];
  allowedActions: DirectCallRuntimeAction[];
  forbiddenActions: DirectCallRuntimeAction[];
  requiredCleanup: string[];
}

interface ResolveDirectCallRuntimeStateInput {
  active: Pick<ActiveCall, "callType" | "screenSharing" | "state" | "videoOff"> | null;
  incoming: Pick<IncomingCall, "callId"> | null;
  peerConnectionState?: RTCPeerConnectionState | null;
  iceConnectionState?: RTCIceConnectionState | null;
}

const DIRECT_CALL_RECONNECTING_PC_STATES = new Set<RTCPeerConnectionState | RTCIceConnectionState>([
  "disconnected",
  "failed",
]);

export const DIRECT_CALL_RUNTIME_STATE_DEFINITIONS: Record<
  DirectCallRuntimeState,
  DirectCallRuntimeStateDefinition
> = {
  idle: {
    entryEvents: ["call.banner.mounted", "call.cleared"],
    exitEvents: ["call.start", "call.offer.received"],
    allowedActions: ["start_outbound_call"],
    forbiddenActions: [
      "accept_incoming_call",
      "decline_incoming_call",
      "retry_connect",
      "end_call",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_security_details",
    ],
    requiredCleanup: [
      "close peer connection",
      "release local and remote media streams",
      "clear signaling notices and pending renegotiation state",
    ],
  },
  incoming: {
    entryEvents: ["call.offer.received"],
    exitEvents: ["call.accept", "call.reject", "call.cancel"],
    allowedActions: ["accept_incoming_call", "decline_incoming_call"],
    forbiddenActions: [
      "start_outbound_call",
      "retry_connect",
      "end_call",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_security_details",
    ],
    requiredCleanup: ["clear incoming offer/auth snapshot if call is dismissed"],
  },
  outgoing: {
    entryEvents: ["call.start", "call.offer.sent"],
    exitEvents: ["call.answered", "call.end", "call.reject", "call.timeout"],
    allowedActions: ["end_call"],
    forbiddenActions: [
      "start_outbound_call",
      "accept_incoming_call",
      "decline_incoming_call",
      "retry_connect",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_security_details",
    ],
    requiredCleanup: ["flush pending ICE batch on teardown", "clear ringing timers"],
  },
  connecting: {
    entryEvents: ["call.accept", "call.answered", "pc.local_description_applied"],
    exitEvents: ["pc.connected", "pc.failed", "call.end"],
    allowedActions: ["end_call", "toggle_mute", "open_security_details"],
    forbiddenActions: [
      "start_outbound_call",
      "accept_incoming_call",
      "decline_incoming_call",
      "retry_connect",
      "toggle_video",
      "toggle_screen_share",
    ],
    requiredCleanup: ["clear pending negotiation flags if setup aborts"],
  },
  active_audio: {
    entryEvents: ["pc.connected", "remote.audio_attached"],
    exitEvents: ["call.end", "local.video_enabled", "pc.disconnected"],
    allowedActions: [
      "end_call",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_security_details",
    ],
    forbiddenActions: [
      "start_outbound_call",
      "accept_incoming_call",
      "decline_incoming_call",
      "retry_connect",
    ],
    requiredCleanup: ["detach remote audio/video slots on teardown"],
  },
  active_video: {
    entryEvents: ["local.video_enabled", "remote.video_attached"],
    exitEvents: ["call.end", "local.video_disabled", "screen_share.started", "pc.disconnected"],
    allowedActions: [
      "end_call",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_security_details",
    ],
    forbiddenActions: [
      "start_outbound_call",
      "accept_incoming_call",
      "decline_incoming_call",
      "retry_connect",
    ],
    requiredCleanup: ["detach remote camera slot and release sender/transceiver bindings"],
  },
  screen_sharing: {
    entryEvents: ["screen_share.started", "call.renegotiate.offer.sent"],
    exitEvents: ["screen_share.stopped", "call.end", "pc.disconnected"],
    allowedActions: [
      "end_call",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_security_details",
    ],
    forbiddenActions: [
      "start_outbound_call",
      "accept_incoming_call",
      "decline_incoming_call",
      "retry_connect",
    ],
    requiredCleanup: [
      "stop local display tracks when sharing ends",
      "restore previous camera sender state or explicit video-off state",
    ],
  },
  reconnecting: {
    entryEvents: ["pc.disconnected", "ice.disconnected", "pc.failed"],
    exitEvents: ["pc.connected", "call.end"],
    allowedActions: ["end_call", "retry_connect", "toggle_mute", "open_security_details"],
    forbiddenActions: [
      "start_outbound_call",
      "accept_incoming_call",
      "decline_incoming_call",
      "toggle_video",
      "toggle_screen_share",
    ],
    requiredCleanup: ["keep transport diagnostics until reconnection succeeds or the call tears down"],
  },
};

export function resolveDirectCallRuntimeState({
  active,
  incoming,
  peerConnectionState = null,
  iceConnectionState = null,
}: ResolveDirectCallRuntimeStateInput): DirectCallRuntimeState {
  if (incoming) {
    return "incoming";
  }

  if (!active) {
    return "idle";
  }

  if (
    DIRECT_CALL_RECONNECTING_PC_STATES.has(peerConnectionState ?? "new") ||
    DIRECT_CALL_RECONNECTING_PC_STATES.has(iceConnectionState ?? "new")
  ) {
    return "reconnecting";
  }

  if (active.state === "ringing") {
    return "outgoing";
  }

  if (active.state === "connecting") {
    return "connecting";
  }

  if (active.screenSharing) {
    return "screen_sharing";
  }

  if (active.callType === "video" && !active.videoOff) {
    return "active_video";
  }

  return "active_audio";
}

export function canDirectCallRuntimeAction(
  state: DirectCallRuntimeState,
  action: DirectCallRuntimeAction
): boolean {
  return DIRECT_CALL_RUNTIME_STATE_DEFINITIONS[state].allowedActions.includes(action);
}

export function mapDirectCallRuntimeStateToSharedPhase(
  state: DirectCallRuntimeState
): SharedCallLifecyclePhase {
  switch (state) {
    case "idle":
      return "idle";
    case "incoming":
    case "outgoing":
      return "inviting";
    case "connecting":
      return "joining";
    case "active_audio":
    case "active_video":
    case "screen_sharing":
      return "live";
    case "reconnecting":
      return "reconnecting";
  }
}
