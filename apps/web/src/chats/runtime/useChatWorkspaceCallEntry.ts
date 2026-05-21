import { useGroupCallChatEntry } from "@/calls/group/runtime/useGroupCallChatEntry";
import { useGlobalGroupCallAlerts } from "@/calls/group/runtime/useGlobalGroupCallAlerts";
import type { GroupChat } from "@/stores/groups";

type UseChatWorkspaceCallEntryOptions = {
  activeGroup: GroupChat | null;
  activeGroupId: string | null;
  groups: Record<string, GroupChat>;
  userId: string | null;
};

/**
 * useChatWorkspaceCallEntry — workspace-local group-call entry bundle.
 *
 * Owns:
 *   - active-group call entry/session wiring
 *   - global cross-group active-call alerts
 *
 * Does not own routing/bootstrap, message projection, presence effects, or
 * saved-thread actions.
 */
export function useChatWorkspaceCallEntry({
  activeGroup,
  activeGroupId,
  groups,
  userId,
}: UseChatWorkspaceCallEntryOptions) {
  const {
    activeGroupCall,
    activeGroupCallParticipantIds,
    missedCall,
    clearMissedCall,
    groupCallSession,
    groupCallNoticeSurface,
    handleStartGroupCall,
    handleJoinActiveGroupCall,
    handleCloseGroupCallPanel,
  } = useGroupCallChatEntry({
    activeGroup,
    groups,
    userId,
  });

  const globalGroupCallAlerts = useGlobalGroupCallAlerts(userId, activeGroupId);

  return {
    activeGroupCall,
    activeGroupCallParticipantIds,
    missedCall,
    clearMissedCall,
    groupCallSession,
    groupCallNoticeSurface,
    handleStartGroupCall,
    handleJoinActiveGroupCall,
    handleCloseGroupCallPanel,
    globalGroupCallAlerts,
  };
}
