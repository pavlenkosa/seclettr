/**
 * useGroupCallOutboundMediaKeyShare — manages device roster and outbound
 * media-key sharing. Fetches the group member device roster on demand,
 * encrypts the local media key for each remote participant device, and
 * delivers the encrypted keys over WebSocket.
 *
 * Also resets the roster cache when the group session changes (Effect A).
 */
import { useEffect, useRef } from "react";
import { logGroupCallInfo, logGroupCallWarn } from "@/calls/group/runtime/media-key/logger";
import { api } from "@/lib/api";
import {
  hasAuthoritativeGroupCallDeviceRoster,
  mergeGroupCallDeviceRoster,
  shouldRefreshAuthoritativeGroupCallDeviceRoster,
  toGroupCallDeviceRoster,
  type GroupCallDeviceRoster,
} from "@/calls/group/model/group-call-device-roster";
import {
  countRemoteParticipantUsers,
  countExpectedRemoteDevices,
  shouldFallbackToTransport,
  resolveParticipantDevicesForMediaKeySharing,
  shareMediaKeyToParticipantDevices,
} from "./group-call-media-key-exchange-utils";
import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { LocalGroupCallMediaKey } from "@/calls/group/runtime/media-key/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/media-key/media-key-delivery";
import type { GroupSfuClient } from "@/calls/group/runtime/sfu";

interface Params {
  session?: {
    groupId: string;
  } | null;
  callId: string | null;
  userId: string | null;
  deviceId: string | null;
  effectiveMediaEncryptionMode: "best-effort" | "required" | "off";
  effectiveFrameEncryptionEnabled: boolean;
  activeParticipantUserIds: string[];
  activeParticipantDeviceIdsByUserId: Record<string, string[]>;
  localMediaKey: LocalGroupCallMediaKey | null;
  setLocalMediaKey: Dispatch<SetStateAction<LocalGroupCallMediaKey | null>>;
  setSharedMediaKeyDeviceCount: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  localMediaKeyRef: MutableRefObject<LocalGroupCallMediaKey | null>;
  sharedMediaKeyTargetsRef: MutableRefObject<Set<string>>;
  mediaKeyDeliveryTrackerRef: MutableRefObject<GroupCallMediaKeyDeliveryTracker | null>;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  mediaKeyFallbackMessage: string;
  wsConnected: boolean;
  markMediaKeyDeliveryAttempt: (targetDeviceId: string, keyId: string) => void;
  evaluateBalancedMediaKeyFallback: (keyId: string) => void;
}

export function useGroupCallOutboundMediaKeyShare(params: Params) {
  const memberDeviceRosterRef = useRef<GroupCallDeviceRoster>({});
  const memberDeviceRosterLoadedGroupIdRef = useRef<string | null>(null);

  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const session = paramsRef.current.session;
    if (!session?.groupId) {
      memberDeviceRosterRef.current = {};
      memberDeviceRosterLoadedGroupIdRef.current = null;
      return;
    }

    if (memberDeviceRosterLoadedGroupIdRef.current !== session.groupId) {
      memberDeviceRosterRef.current = {};
      memberDeviceRosterLoadedGroupIdRef.current = session.groupId;
    }
  }, [params.session?.groupId]);

  useEffect(() => {
    const p = paramsRef.current;

    if (!p.effectiveFrameEncryptionEnabled || !p.session || !p.callId || !p.localMediaKey || !p.wsConnected || p.activeParticipantUserIds.length === 0) {
      return;
    }
    if (!p.deviceId || !p.userId) {
      return;
    }

    const callId: string = p.callId;
    const userId: string = p.userId;
    const deviceId: string = p.deviceId;
    const localMediaKey: LocalGroupCallMediaKey = p.localMediaKey;
    const sessionGroupId: string = p.session.groupId;

    let cancelled = false;

    const getParticipantDeviceRoster = async (): Promise<GroupCallDeviceRoster> => {
      const currentRoster = memberDeviceRosterRef.current;
      if (
        shouldRefreshAuthoritativeGroupCallDeviceRoster({
          currentGroupId: sessionGroupId,
          loadedGroupId: memberDeviceRosterLoadedGroupIdRef.current,
          roster: currentRoster,
          activeParticipantDeviceIdsByUserId: p.activeParticipantDeviceIdsByUserId,
          localUserId: userId,
          localDeviceId: deviceId,
        })
      ) {
        try {
          const members = await api.getGroupMemberDevices(sessionGroupId);
          if (cancelled) {
            return currentRoster;
          }
          memberDeviceRosterRef.current = mergeGroupCallDeviceRoster(
            memberDeviceRosterRef.current,
            toGroupCallDeviceRoster(members)
          );
          memberDeviceRosterLoadedGroupIdRef.current = sessionGroupId;
        } catch (error) {
          if (cancelled) {
            return currentRoster;
          }
          logGroupCallWarn(
            "[group-call] roster refresh failed",
            {
              callId,
              groupId: sessionGroupId,
              error,
            }
          );
        }
      }

      return memberDeviceRosterRef.current;
    };

    const shareMediaKey = async () => {
      let attemptedTargets = 0;
      const devicesByUserId = await getParticipantDeviceRoster();

      const hasAuthoritativeDeviceRoster =
        hasAuthoritativeGroupCallDeviceRoster(p.activeParticipantDeviceIdsByUserId);

      for (const participantUserId of p.activeParticipantUserIds) {
        const participantDevices = resolveParticipantDevicesForMediaKeySharing(
          callId,
          participantUserId,
          devicesByUserId,
          p.activeParticipantDeviceIdsByUserId,
          hasAuthoritativeDeviceRoster,
          userId,
          deviceId
        );

        const shareResult = await shareMediaKeyToParticipantDevices(
          callId,
          participantDevices,
          localMediaKey,
          { senderUserId: userId, senderDeviceId: deviceId },
          {
            sharedMediaKeyTargets: p.sharedMediaKeyTargetsRef.current,
            markMediaKeyDeliveryAttempt: p.markMediaKeyDeliveryAttempt,
            deliveryTracker: p.mediaKeyDeliveryTrackerRef.current,
          },
          () => cancelled
        );
        attemptedTargets += shareResult.attemptedTargets;
        if (shareResult.cancelled) {
          return;
        }
      }

      if (cancelled) {
        return;
      }

      const remoteParticipantCount = countRemoteParticipantUsers(
        p.activeParticipantUserIds,
        userId
      );
      const expectedRemoteDeviceCount = countExpectedRemoteDevices(
        p.activeParticipantDeviceIdsByUserId,
        userId,
        deviceId
      );
      const shouldFallback = shouldFallbackToTransport({
        effectiveMediaEncryptionMode: p.effectiveMediaEncryptionMode,
        attemptedTargets,
        hasAuthoritativeDeviceRoster,
        expectedRemoteDeviceCount,
        remoteParticipantCount,
      });

      if (shouldFallback) {
        p.localMediaKeyRef.current = null;
        p.setLocalMediaKey(null);
        p.sfuClientRef.current?.setLocalMediaKey(null);
        p.setError((current) => current ?? p.mediaKeyFallbackMessage);
        logGroupCallInfo("[gc] balanced fallback to transport", {
          callId,
          keyId: localMediaKey.keyId,
          attemptedTargets,
          expectedRemoteDeviceCount,
          hasAuthoritativeDeviceRoster,
        });
        return;
      }

      if (p.effectiveMediaEncryptionMode === "best-effort" && attemptedTargets > 0) {
        p.evaluateBalancedMediaKeyFallback(localMediaKey.keyId);
      }
    };

    shareMediaKey().catch((shareError) => {
      if (cancelled) return;
      logGroupCallWarn("[group-call] media-key share failed", shareError);
    });

    return () => {
      cancelled = true;
    };
  }, [
    params.activeParticipantDeviceIdsByUserId,
    params.activeParticipantUserIds,
    params.callId,
    params.deviceId,
    params.effectiveFrameEncryptionEnabled,
    params.effectiveMediaEncryptionMode,
    params.evaluateBalancedMediaKeyFallback,
    params.localMediaKey,
    params.localMediaKeyRef,
    params.markMediaKeyDeliveryAttempt,
    params.mediaKeyFallbackMessage,
    params.mediaKeyDeliveryTrackerRef,
    params.session,
    params.setError,
    params.setLocalMediaKey,
    params.setSharedMediaKeyDeviceCount,
    params.sharedMediaKeyTargetsRef,
    params.sfuClientRef,
    params.userId,
    params.wsConnected,
  ]);
}
