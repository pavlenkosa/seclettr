/**
 * useGroupCallSync — active group call state synchronizer for the group panel.
 *
 * Owns:
 *   - REST-based initial fetch: resolves activeGroupCall and participant IDs on mount
 *   - WebSocket subscription for real-time call lifecycle events:
 *     group.call.started, group.call.ended, group.call.participant_joined/left
 *   - Degraded-sync flag: set when the REST fetch fails; keeps stale call state
 *     visible rather than clearing it (avoids false "no active call" flashes)
 *   - participantCountUncertain flag: set when the participant fetch fails independently
 *   - MissedGroupCall detection: emitted when the call ends before the local user joins
 *   - clearMissedCall — resets missed-call state after the user dismisses it
 *
 * Does not own session bootstrap, SFU lifecycle, or media-key exchange.
 * The hook is consumed by the group panel to decide whether to show a call banner.
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { GroupActiveCall, WsServerMessage } from "@seclettr/protocol";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";

/** Non-null when a group call ended before the local user joined (missed). */
export interface MissedGroupCall {
  callId: string;
  callerUserId: string;
}

interface UseGroupCallSyncResult {
  activeGroupCall: GroupActiveCall | null;
  activeGroupCallParticipantIds: string[];
  /**
   * True when the last REST fetch for the active call failed transiently.
   * In this state `activeGroupCall` retains its previous value (stale-while-degraded).
   * UI should avoid treating a degraded sync as "no active call".
   */
  callSyncDegraded: boolean;
  /**
   * True when the participant count is uncertain (participant fetch failed).
   * UI should not show a precise count when this flag is set.
   */
  participantCountUncertain: boolean;
  /**
   * Set when the most recent call in this group ended before the local user
   * joined.  Cleared as soon as a new call starts.
   */
  missedCall: MissedGroupCall | null;
  clearMissedCall: () => void;
}

type GroupCallSyncMessage = Extract<
  WsServerMessage,
  {
    type:
      | "group.call.started"
      | "group.call.ended"
      | "group.call.participant_joined"
      | "group.call.participant_left";
  }
>;

interface GroupCallSyncActions {
  readonly activeGroupCallIdRef: MutableRefObject<string | null>;
  readonly setActiveGroupCall: (call: GroupActiveCall | null | ((current: GroupActiveCall | null) => GroupActiveCall | null)) => void;
  readonly setActiveGroupCallParticipantIds: (ids: string[] | ((current: string[]) => string[])) => void;
  readonly setCallSyncDegraded: (degraded: boolean) => void;
  readonly setParticipantCountUncertain: (uncertain: boolean) => void;
  readonly setMissedCall: (call: MissedGroupCall | null) => void;
}

function isGroupCallSyncMessage(
  msg: WsServerMessage,
  activeGroupRouteId: string
): msg is GroupCallSyncMessage {
  if (!("groupId" in msg) || msg.groupId !== activeGroupRouteId) {
    return false;
  }

  return msg.type === "group.call.started"
    || msg.type === "group.call.ended"
    || msg.type === "group.call.participant_joined"
    || msg.type === "group.call.participant_left";
}

function handleGroupCallStarted(
  msg: Extract<GroupCallSyncMessage, { type: "group.call.started" }>,
  actions: GroupCallSyncActions
): void {
  actions.setMissedCall(null);
  actions.setActiveGroupCall({
    callId: msg.callId,
    callType: msg.callType,
    status: "ringing",
    callerUserId: msg.callerUserId,
    createdAt: msg.startedAt,
    answeredAt: null,
  });
  actions.setActiveGroupCallParticipantIds([msg.callerUserId]);
  actions.setCallSyncDegraded(false);
  actions.setParticipantCountUncertain(false);
}

function handleGroupCallEnded(
  msg: Extract<GroupCallSyncMessage, { type: "group.call.ended" }>,
  actions: GroupCallSyncActions,
  localUserId: string | null
): void {
  if (actions.activeGroupCallIdRef.current !== msg.callId) {
    return;
  }

  actions.setActiveGroupCall(null);
  actions.setActiveGroupCallParticipantIds([]);
  actions.setCallSyncDegraded(false);
  actions.setParticipantCountUncertain(false);

  const endedByCurrentUser = Boolean(localUserId && msg.endedByUserId === localUserId);
  const callerIsCurrentUser = Boolean(localUserId && msg.callerUserId === localUserId);
  if (msg.wasMissed && msg.callerUserId && !endedByCurrentUser && !callerIsCurrentUser) {
    actions.setMissedCall({ callId: msg.callId, callerUserId: msg.callerUserId });
  }
}

function handleGroupCallParticipantJoined(
  msg: Extract<GroupCallSyncMessage, { type: "group.call.participant_joined" }>,
  actions: GroupCallSyncActions
): void {
  if (actions.activeGroupCallIdRef.current !== msg.callId) {
    return;
  }

  actions.setActiveGroupCall((current) =>
    current ? { ...current, status: "active" } : current
  );
  actions.setActiveGroupCallParticipantIds((current) =>
    current.includes(msg.userId) ? current : [...current, msg.userId]
  );
  actions.setParticipantCountUncertain(false);
}

function handleGroupCallParticipantLeft(
  msg: Extract<GroupCallSyncMessage, { type: "group.call.participant_left" }>,
  actions: GroupCallSyncActions
): void {
  if (actions.activeGroupCallIdRef.current !== msg.callId) {
    return;
  }

  actions.setActiveGroupCallParticipantIds((current) =>
    current.filter((userId) => userId !== msg.userId)
  );
}

function handleGroupCallSyncMessage(
  msg: GroupCallSyncMessage,
  actions: GroupCallSyncActions,
  localUserId: string | null
): void {
  switch (msg.type) {
    case "group.call.started":
      handleGroupCallStarted(msg, actions);
      break;
    case "group.call.ended":
      handleGroupCallEnded(msg, actions, localUserId);
      break;
    case "group.call.participant_joined":
      handleGroupCallParticipantJoined(msg, actions);
      break;
    case "group.call.participant_left":
      handleGroupCallParticipantLeft(msg, actions);
      break;
  }
}

/**
 * Synchronizes the active group call state for a given group by:
 * - Fetching the current active call and participant list via REST on mount / group change.
 * - Subscribing to WebSocket events for real-time call lifecycle updates.
 *
 * Distinguishes three states: known-no-call, known-call, and degraded (fetch failed).
 */
export function useGroupCallSync(
  activeGroupRouteId: string | null,
  localUserId: string | null
): UseGroupCallSyncResult {
  const [activeGroupCall, setActiveGroupCall] = useState<GroupActiveCall | null>(null);
  const [activeGroupCallParticipantIds, setActiveGroupCallParticipantIds] = useState<string[]>([]);
  const [callSyncDegraded, setCallSyncDegraded] = useState(false);
  const [participantCountUncertain, setParticipantCountUncertain] = useState(false);
  const [missedCall, setMissedCall] = useState<MissedGroupCall | null>(null);
  const activeGroupCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeGroupCallIdRef.current = activeGroupCall?.callId ?? null;
  }, [activeGroupCall]);

  useEffect(() => {
    if (!activeGroupRouteId) {
      setActiveGroupCall(null);
      setActiveGroupCallParticipantIds([]);
      setCallSyncDegraded(false);
      setParticipantCountUncertain(false);
      return;
    }

    let cancelled = false;

    const syncActiveGroupCall = async () => {
      try {
        const currentCall = await api.getActiveGroupCall(activeGroupRouteId);
        if (cancelled) return;

        setActiveGroupCall(currentCall);
        setCallSyncDegraded(false);

        if (!currentCall) {
          setActiveGroupCallParticipantIds([]);
          setParticipantCountUncertain(false);
          return;
        }

        try {
          const participants = await api.getGroupCallParticipants(currentCall.callId);
          if (!cancelled) {
            setActiveGroupCallParticipantIds(
              [...new Set(participants.map((p) => p.userId))]
            );
            setParticipantCountUncertain(false);
          }
        } catch {
          if (!cancelled) {
            // Don't replace with a fake count — mark as uncertain instead.
            setParticipantCountUncertain(true);
          }
        }
      } catch {
        if (!cancelled) {
          // Keep the last known call state rather than clearing it —
          // a transient failure should not tell the user "no active call".
          setCallSyncDegraded(true);
        }
      }
    };

    void syncActiveGroupCall();

    return () => {
      cancelled = true;
    };
  }, [activeGroupRouteId]);

  useEffect(() => {
    if (!activeGroupRouteId) return;

    const actions: GroupCallSyncActions = {
      activeGroupCallIdRef,
      setActiveGroupCall,
      setActiveGroupCallParticipantIds,
      setCallSyncDegraded,
      setParticipantCountUncertain,
      setMissedCall,
    };

    return wsClient.on((msg) => {
      if (isGroupCallSyncMessage(msg, activeGroupRouteId)) {
        handleGroupCallSyncMessage(msg, actions, localUserId);
      }
    });
  }, [activeGroupRouteId, localUserId]);

  return {
    activeGroupCall,
    activeGroupCallParticipantIds,
    callSyncDegraded,
    participantCountUncertain,
    missedCall,
    clearMissedCall: () => setMissedCall(null),
  };
}
