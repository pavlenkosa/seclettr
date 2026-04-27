import {
  resolveGroupCallNoticeSurface,
  type GroupCallPanelSession,
} from "@/calls/group/model/entry";
import type { GroupChat } from "@/stores/groups";
import { useGroupCallSession } from "./useGroupCallSession";
import { useGroupCallSync } from "./useGroupCallSync";

interface UseGroupCallChatEntryOptions {
  activeGroup: GroupChat | null;
  groups: Record<string, GroupChat>;
  userId: string | null;
}

interface UseGroupCallChatEntryResult {
  activeGroupCall: ReturnType<typeof useGroupCallSync>["activeGroupCall"];
  activeGroupCallParticipantIds: ReturnType<typeof useGroupCallSync>["activeGroupCallParticipantIds"];
  callSyncDegraded: ReturnType<typeof useGroupCallSync>["callSyncDegraded"];
  participantCountUncertain: ReturnType<typeof useGroupCallSync>["participantCountUncertain"];
  missedCall: ReturnType<typeof useGroupCallSync>["missedCall"];
  clearMissedCall: ReturnType<typeof useGroupCallSync>["clearMissedCall"];
  groupCallSession: GroupCallPanelSession | null;
  groupCallNoticeSurface: "hidden" | "banner";
  handleStartGroupCall: () => void;
  handleJoinActiveGroupCall: () => void;
  handleCloseGroupCallPanel: () => void;
}

export function useGroupCallChatEntry({
  activeGroup,
  groups,
  userId,
}: UseGroupCallChatEntryOptions): UseGroupCallChatEntryResult {
  const activeGroupRouteId = activeGroup?.groupId ?? null;
  const {
    activeGroupCall,
    activeGroupCallParticipantIds,
    callSyncDegraded,
    participantCountUncertain,
    missedCall,
    clearMissedCall,
  } = useGroupCallSync(activeGroupRouteId, userId);

  const {
    groupCallSession,
    handleStartGroupCall,
    handleJoinActiveGroupCall,
    handleCloseGroupCallPanel,
  } = useGroupCallSession({
    activeGroup,
    activeGroupCall,
    userId,
    groups,
  });

  const groupCallNoticeSurface = resolveGroupCallNoticeSurface({
    activeCall: activeGroupCall,
    hasOpenSession: groupCallSession !== null,
  });

  return {
    activeGroupCall,
    activeGroupCallParticipantIds,
    callSyncDegraded,
    participantCountUncertain,
    missedCall,
    clearMissedCall,
    groupCallSession,
    groupCallNoticeSurface,
    handleStartGroupCall,
    handleJoinActiveGroupCall,
    handleCloseGroupCallPanel,
  };
}
