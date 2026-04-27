import type { GroupCallStatus } from "./group-call-types";
import type { SharedCallLifecyclePhase } from "@/calls/shared/model/call-lifecycle-contract";

export type GroupCallLifecycleState =
  | "room_idle"
  | "joining"
  | "joined"
  | "publishing"
  | "subscribed"
  | "reconnecting"
  | "leaving"
  | "left"
  | "failed";

export type GroupCallLifecycleAction =
  | "join_room"
  | "leave_room"
  | "end_room"
  | "toggle_mute"
  | "toggle_video"
  | "toggle_screen_share"
  | "retry_join"
  | "open_details"
  | "pin_stage_tile";

export interface GroupCallLifecycleDefinition {
  entryEvents: string[];
  exitEvents: string[];
  allowedActions: GroupCallLifecycleAction[];
  forbiddenActions: GroupCallLifecycleAction[];
  requiredCleanup: string[];
}

export interface ResolveGroupCallLifecycleStateInput {
  sessionPresent: boolean;
  status: GroupCallStatus;
  accessGranted: boolean;
  remoteParticipantCount: number;
  isVideoSwitching: boolean;
  isScreenSwitching: boolean;
  isReconnecting?: boolean;
  hasLeft?: boolean;
}

const GROUP_CALL_CONNECTED_STATES = new Set<GroupCallLifecycleState>([
  "joined",
  "publishing",
  "subscribed",
]);

export const GROUP_CALL_LIFECYCLE_DEFINITIONS: Record<
  GroupCallLifecycleState,
  GroupCallLifecycleDefinition
> = {
  room_idle: {
    entryEvents: ["group.panel.closed", "group.call.cleared"],
    exitEvents: ["group.panel.opened"],
    allowedActions: ["join_room"],
    forbiddenActions: [
      "leave_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "retry_join",
      "open_details",
      "pin_stage_tile",
    ],
    requiredCleanup: ["release SFU client and clear remote participant topology"],
  },
  joining: {
    entryEvents: ["group.panel.opened", "group.call.start"],
    exitEvents: ["group.call.access_granted", "group.call.fail", "group.call.leave"],
    allowedActions: ["leave_room", "open_details"],
    forbiddenActions: [
      "join_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "retry_join",
      "pin_stage_tile",
    ],
    requiredCleanup: ["stop partially acquired media if join aborts"],
  },
  joined: {
    entryEvents: ["group.call.ready"],
    exitEvents: ["remote.participant.subscribed", "group.call.leave", "group.call.fail"],
    allowedActions: [
      "leave_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_details",
    ],
    forbiddenActions: ["join_room", "retry_join", "pin_stage_tile"],
    requiredCleanup: ["keep participant roster and media-key state aligned with current room"],
  },
  publishing: {
    entryEvents: ["local.camera.starting", "local.screen_share.starting"],
    exitEvents: ["local.publish.completed", "group.call.leave", "group.call.fail"],
    allowedActions: [
      "leave_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_details",
    ],
    forbiddenActions: ["join_room", "retry_join", "pin_stage_tile"],
    requiredCleanup: ["clear local media switch flags once publish settles"],
  },
  subscribed: {
    entryEvents: ["remote.participant.subscribed"],
    exitEvents: ["remote.participant.left", "group.call.leave", "group.call.fail"],
    allowedActions: [
      "leave_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "open_details",
      "pin_stage_tile",
    ],
    forbiddenActions: ["join_room", "retry_join"],
    requiredCleanup: ["detach remote media for departed participants deterministically"],
  },
  reconnecting: {
    entryEvents: ["ws.disconnected", "sfu.transport.failed", "group.call.rejoin.started"],
    exitEvents: ["group.call.ready", "group.call.fail", "group.call.leave"],
    allowedActions: ["leave_room", "retry_join", "open_details"],
    forbiddenActions: [
      "join_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "pin_stage_tile",
    ],
    requiredCleanup: ["preserve diagnostics until transport/session ownership is restored"],
  },
  leaving: {
    entryEvents: ["group.call.leave", "group.call.end"],
    exitEvents: ["group.call.left"],
    allowedActions: [],
    forbiddenActions: [
      "join_room",
      "leave_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "retry_join",
      "open_details",
      "pin_stage_tile",
    ],
    requiredCleanup: [
      "stop local audio/video/screen tracks",
      "close SFU client",
      "clear participant and media-key state",
    ],
  },
  left: {
    entryEvents: ["group.call.left"],
    exitEvents: ["group.panel.opened"],
    allowedActions: ["join_room"],
    forbiddenActions: [
      "leave_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "retry_join",
      "open_details",
      "pin_stage_tile",
    ],
    requiredCleanup: ["ensure panel state is fully reset before next join"],
  },
  failed: {
    entryEvents: ["group.call.fail", "group.call.permission_denied", "sfu.transport.failed"],
    exitEvents: ["group.panel.opened"],
    allowedActions: ["join_room", "retry_join", "open_details"],
    forbiddenActions: [
      "leave_room",
      "end_room",
      "toggle_mute",
      "toggle_video",
      "toggle_screen_share",
      "pin_stage_tile",
    ],
    requiredCleanup: [
      "preserve error diagnostics",
      "release local media and SFU resources",
      "clear stale participant-device indexes",
    ],
  },
};

export function resolveGroupCallLifecycleState({
  sessionPresent,
  status,
  accessGranted,
  remoteParticipantCount,
  isVideoSwitching,
  isScreenSwitching,
  isReconnecting = false,
  hasLeft = false,
}: ResolveGroupCallLifecycleStateInput): GroupCallLifecycleState {
  if (hasLeft) {
    return "left";
  }

  if (!sessionPresent) {
    return "room_idle";
  }

  // "idle" status with a session present maps to the pre-join idle state.
  if (status === "idle") {
    return "room_idle";
  }

  if (status === "error") {
    return "failed";
  }

  // "ended" maps to the left/terminal state — the call is over.
  if (status === "ended") {
    return "left";
  }

  // "leaving" and "ending" (legacy alias) both map to the leaving lifecycle state.
  if (status === "leaving" || status === "ending") {
    return "leaving";
  }

  // "reconnecting" status explicitly maps to the reconnecting lifecycle state.
  if (status === "reconnecting" || isReconnecting) {
    return "reconnecting";
  }

  // "joining" status — in-progress join before SFU access is granted.
  if (status === "joining") {
    return "joining";
  }

  if (status === "starting") {
    return accessGranted ? "publishing" : "joining";
  }

  if (isVideoSwitching || isScreenSwitching) {
    return "publishing";
  }

  if (remoteParticipantCount > 0) {
    return "subscribed";
  }

  return "joined";
}

export function canGroupCallLifecycleAction(
  state: GroupCallLifecycleState,
  action: GroupCallLifecycleAction
): boolean {
  return GROUP_CALL_LIFECYCLE_DEFINITIONS[state].allowedActions.includes(action);
}

export function mapGroupCallLifecycleStateToSharedPhase(
  state: GroupCallLifecycleState
): SharedCallLifecyclePhase {
  switch (state) {
    case "room_idle":
      return "idle";
    case "joining":
      return "joining";
    case "joined":
    case "publishing":
    case "subscribed":
      return "live";
    case "reconnecting":
      return "reconnecting";
    case "leaving":
      return "leaving";
    case "left":
      return "ended";
    case "failed":
      return "failed";
  }
}

export function isGroupCallConnectedLifecycleState(state: GroupCallLifecycleState): boolean {
  return GROUP_CALL_CONNECTED_STATES.has(state);
}
