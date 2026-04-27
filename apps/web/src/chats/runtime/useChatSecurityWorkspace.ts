import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import type { GroupMember } from "@/stores/groups";
import {
  buildGroupSecurityTarget,
  type GroupSecurityDirectory,
  type GroupSecurityTarget,
} from "./group-security-directory";
import { useDirectThreadSecurityStatus } from "./useDirectThreadSecurityStatus";
import { useGroupThreadSecurityStatus } from "./useGroupThreadSecurityStatus";

interface ChatSecurityWorkspaceOptions {
  activeConversationUserId: string | null;
  activePeerIdentityKey?: string;
  activePeerIdentityDeviceId?: string | null;
  activePeerIdentityByDevice?: Record<string, string>;
  activePeerIdentityAlertCount: number;
  identityDhKeyPair?: { publicKey: Uint8Array } | null;
  userId?: string | null;
  deviceId?: string | null;
  activeGroupId: string | null;
  activeGroupMembers: GroupMember[] | null;
  activeThreadKind: "direct" | "group" | null;
  groupSecurityDirectory: Pick<GroupSecurityDirectory, "fetchGroupSecurityDevices">;
  showChatNotice: (message: string) => void;
}

interface ChatSecurityWorkspace {
  securityStatus: "verified" | "unverified" | "reverify_required";
  groupSecurityStatus: "verified" | "unverified";
  showSecurity: boolean;
  openSecurity: () => void;
  closeSecurity: () => void;
  groupSecurityTarget: GroupSecurityTarget | null;
  clearGroupSecurityTarget: () => void;
  handleVerifyGroupMember: (member: GroupMember) => Promise<void>;
  onDirectVerificationChanged: () => void;
  onGroupVerificationChanged: () => void;
}

export function useChatSecurityWorkspace({
  activeConversationUserId,
  activePeerIdentityKey,
  activePeerIdentityDeviceId,
  activePeerIdentityByDevice,
  activePeerIdentityAlertCount,
  identityDhKeyPair,
  userId,
  deviceId,
  activeGroupId,
  activeGroupMembers,
  activeThreadKind,
  groupSecurityDirectory,
  showChatNotice,
}: ChatSecurityWorkspaceOptions): ChatSecurityWorkspace {
  const { t } = useI18n();

  const [showSecurity, setShowSecurity] = useState(false);
  const [groupSecurityTarget, setGroupSecurityTarget] =
    useState<GroupSecurityTarget | null>(null);
  const [securityRefreshTick, setSecurityRefreshTick] = useState(0);
  const [groupSecurityRefreshTick, setGroupSecurityRefreshTick] = useState(0);

  const securityStatus = useDirectThreadSecurityStatus({
    activeConversationUserId,
    activePeerIdentityKey,
    activePeerIdentityDeviceId,
    activePeerIdentityByDevice,
    activePeerIdentityAlertCount,
    identityDhKeyPair,
    userId,
    deviceId,
    refreshTick: securityRefreshTick,
  });

  const groupSecurityStatus = useGroupThreadSecurityStatus({
    activeGroup:
      activeGroupId !== null && activeGroupMembers !== null
        ? { groupId: activeGroupId, members: activeGroupMembers }
        : null,
    identityDhKeyPair,
    userId,
    deviceId,
    fetchGroupSecurityDevices:
      groupSecurityDirectory.fetchGroupSecurityDevices,
    refreshTick: groupSecurityRefreshTick,
  });

  useEffect(() => {
    if (activeThreadKind !== "direct") {
      setShowSecurity(false);
    }
  }, [activeThreadKind]);

  useEffect(() => {
    if (activeThreadKind !== "group" || activeGroupId === null) {
      setGroupSecurityTarget(null);
    }
  }, [activeThreadKind, activeGroupId]);

  const openSecurity = useCallback(() => setShowSecurity(true), []);
  const closeSecurity = useCallback(() => setShowSecurity(false), []);
  const clearGroupSecurityTarget = useCallback(
    () => setGroupSecurityTarget(null),
    []
  );

  const onDirectVerificationChanged = useCallback(
    () => setSecurityRefreshTick((v) => v + 1),
    []
  );

  const onGroupVerificationChanged = useCallback(
    () => setGroupSecurityRefreshTick((v) => v + 1),
    []
  );

  const handleVerifyGroupMember = useCallback(
    async (member: GroupMember) => {
      if (!activeGroupId) {
        showChatNotice(t("group.members.error.verifyFailed"));
        return;
      }
      try {
        const devicesByUserId =
          await groupSecurityDirectory.fetchGroupSecurityDevices(activeGroupId);
        setGroupSecurityTarget(buildGroupSecurityTarget(member, devicesByUserId));
      } catch {
        showChatNotice(t("group.members.error.verifyFailed"));
      }
    },
    [activeGroupId, groupSecurityDirectory, showChatNotice, t]
  );

  return {
    securityStatus,
    groupSecurityStatus,
    showSecurity,
    openSecurity,
    closeSecurity,
    groupSecurityTarget,
    clearGroupSecurityTarget,
    handleVerifyGroupMember,
    onDirectVerificationChanged,
    onGroupVerificationChanged,
  };
}
