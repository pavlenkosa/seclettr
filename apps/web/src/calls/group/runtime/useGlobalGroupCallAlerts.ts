/**
 * Global group-call alert tracker.
 *
 * - On mount, fetches all active group calls the user belongs to via REST
 *   (handles the "app opened while call was already in progress" case).
 * - Subscribes to group.call.started / group.call.ended WS events across ALL
 *   groups so that alerts remain live even when the user isn't viewing the
 *   specific group that has an active call.
 *
 * Returns the list of active calls in groups OTHER than the one currently open
 *  so the caller can show a "Join ongoing call" banner without duplicating the
 *  per-group notice already rendered inside the chat panel.
 */
import { useEffect, useState } from "react";
import type { GroupActiveCallEntry, WsServerMessage } from "@seclettr/protocol";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";

type GroupCallStartedMessage = Extract<
  WsServerMessage,
  { type: "group.call.started" }
>;
type GroupCallEndedMessage = Extract<
  WsServerMessage,
  { type: "group.call.ended" }
>;
type GroupCallParticipantJoinedMessage = Extract<
  WsServerMessage,
  { type: "group.call.participant_joined" }
>;

function addStartedGroupCall(
  prev: GroupActiveCallEntry[],
  msg: GroupCallStartedMessage
): GroupActiveCallEntry[] {
  if (prev.some((call) => call.groupId === msg.groupId)) return prev;

  return [
    ...prev,
    {
      groupId: msg.groupId,
      callId: msg.callId,
      callType: msg.callType,
      status: "ringing",
      callerUserId: msg.callerUserId,
      createdAt: msg.startedAt,
      answeredAt: null,
    },
  ];
}

function removeEndedGroupCall(
  prev: GroupActiveCallEntry[],
  msg: GroupCallEndedMessage
): GroupActiveCallEntry[] {
  return prev.filter((call) => call.callId !== msg.callId);
}

function markJoinedGroupCallActive(
  prev: GroupActiveCallEntry[],
  msg: GroupCallParticipantJoinedMessage
): GroupActiveCallEntry[] {
  return prev.map((call) =>
    call.callId === msg.callId ? { ...call, status: "active" } : call
  );
}

export function useGlobalGroupCallAlerts(
  userId: string | null,
  currentGroupId: string | null
): GroupActiveCallEntry[] {
  const [activeCalls, setActiveCalls] = useState<GroupActiveCallEntry[]>([]);

  // Initial fetch — covers calls that started before the WS connected.
  useEffect(() => {
    if (!userId) {
      setActiveCalls([]);
      return;
    }
    api.getActiveGroupCalls().then(setActiveCalls);
  }, [userId]);

  // Live updates via WS — events arrive regardless of which group is open.
  useEffect(() => {
    if (!userId) return;

    return wsClient.on((msg) => {
      if (msg.type === "group.call.started") {
        setActiveCalls((prev) => addStartedGroupCall(prev, msg));
        return;
      }

      if (msg.type === "group.call.ended") {
        setActiveCalls((prev) => removeEndedGroupCall(prev, msg));
        return;
      }

      if (msg.type === "group.call.participant_joined") {
        setActiveCalls((prev) => markJoinedGroupCallActive(prev, msg));
      }
    });
  }, [userId]);

  // Filter out the currently open group — its notice is already shown in-panel.
  return activeCalls.filter((c) => c.groupId !== currentGroupId);
}
