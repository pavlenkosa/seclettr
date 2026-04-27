import { useCallback, useEffect, useState } from "react";
import type { GroupActiveCall } from "@seclettr/protocol";
import {
  resolveGroupCallLaunchType,
  type GroupCallPanelSession,
} from "@/calls/group/model/entry";
import type { GroupChat } from "@/stores/groups";

interface UseGroupCallSessionParams {
  activeGroup: GroupChat | null;
  activeGroupCall: GroupActiveCall | null;
  userId: string | null;
  groups: Record<string, GroupChat>;
}

interface UseGroupCallSessionResult {
  groupCallSession: GroupCallPanelSession | null;
  handleStartGroupCall: () => void;
  handleJoinActiveGroupCall: () => void;
  handleCloseGroupCallPanel: () => void;
}

export function useGroupCallSession({
  activeGroup,
  activeGroupCall,
  userId,
  groups,
}: UseGroupCallSessionParams): UseGroupCallSessionResult {
  const [groupCallSession, setGroupCallSession] =
    useState<GroupCallPanelSession | null>(null);

  useEffect(() => {
    if (!groupCallSession) return;
    if (groups[groupCallSession.groupId]) return;
    setGroupCallSession(null);
  }, [groupCallSession, groups]);

  const handleStartGroupCall = useCallback(() => {
    if (!activeGroup || groupCallSession) return;
    setGroupCallSession({
      groupId: activeGroup.groupId,
      groupName: activeGroup.name,
      members: activeGroup.members,
      hostUserId: activeGroupCall?.callerUserId ?? userId ?? null,
      callType: resolveGroupCallLaunchType("audio", activeGroupCall),
    });
  }, [activeGroup, groupCallSession, activeGroupCall, userId]);

  const handleJoinActiveGroupCall = useCallback(() => {
    if (!activeGroup || !activeGroupCall || groupCallSession) return;
    setGroupCallSession({
      groupId: activeGroup.groupId,
      groupName: activeGroup.name,
      members: activeGroup.members,
      hostUserId: activeGroupCall.callerUserId,
      callType: activeGroupCall.callType,
    });
  }, [activeGroup, activeGroupCall, groupCallSession]);

  const handleCloseGroupCallPanel = useCallback(
    () => setGroupCallSession(null),
    []
  );

  return {
    groupCallSession,
    handleStartGroupCall,
    handleJoinActiveGroupCall,
    handleCloseGroupCallPanel,
  };
}
