import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import type { GroupMember } from "@/stores/groups";

export type CallType = "audio" | "video";
export type GroupCallStatus =
  | "idle"
  | "starting"
  | "joining"
  | "ready"
  | "reconnecting"
  /** Local user is leaving the call as a participant. */
  | "leaving"
  | "ended"
  | "error"
  /** Local user is the host and is closing the room for everyone. Distinct from "leaving" — shown as "Closing room…" in UI. */
  | "ending";

export type GroupCallStatusAction =
  | { type: "SESSION_INIT_FAILED" }   // → "error"
  | { type: "SESSION_START" }          // idle → "starting"
  | { type: "SESSION_READY" }          // starting/joining/reconnecting → "ready"
  | { type: "SESSION_ERROR" }          // any → "error"
  | { type: "RECONNECT_START" }        // joined/publishing/subscribed → "reconnecting"
  | { type: "CALL_ENDED_BY_HOST" }     // remote host ended room → "leaving" (participant perspective)
  | { type: "USER_LEAVE" }             // local user leaving → "leaving"
  | { type: "USER_END_FOR_EVERYONE" }; // local host closing room → "ending"

export function groupCallStatusReducer(
  state: GroupCallStatus,
  action: GroupCallStatusAction
): GroupCallStatus {
  switch (action.type) {
    case "SESSION_INIT_FAILED":
    case "SESSION_ERROR":
      return "error";
    case "SESSION_START":
      return "starting";
    case "SESSION_READY":
      return state === "starting" || state === "joining" || state === "reconnecting"
        ? "ready"
        : state;
    case "RECONNECT_START":
      return state === "ready" || state === "reconnecting"
        ? "reconnecting"
        : state;
    case "CALL_ENDED_BY_HOST":
    case "USER_LEAVE":
      return state !== "ended" && state !== "error" ? "leaving" : state;
    case "USER_END_FOR_EVERYONE":
      return state !== "ended" && state !== "error" ? "ending" : state;
  }
}

export interface GroupCallPanelSession {
  groupId: string;
  groupName: string;
  members: GroupMember[];
  callType: CallType;
  hostUserId?: string | null;
}

export interface GroupCallStageTile {
  id: string;
  label: string;
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  fallbackInitials: string;
  badge: string;
  hasVideo: boolean;
  videoSource: "camera" | "screen" | null;
  isLocal: boolean;
}

export interface MinimizedDockPosition {
  x: number;
  y: number;
}

export interface GroupCallParticipantDevice {
  userId: string;
  deviceId: string;
}

export type GroupCallRemoteMediaEntry = GroupCallRemoteMedia;
