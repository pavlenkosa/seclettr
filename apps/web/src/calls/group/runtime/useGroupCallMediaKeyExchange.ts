import { useEffect, useRef } from "react";
import {
  decryptGroupCallMediaKeyFromSignal,
  encryptGroupCallMediaKeyForDevice,
  shouldReplaceReceivedGroupCallMediaKey,
  type LocalGroupCallMediaKey,
} from "@/calls/group/runtime/group-call/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/group-call/media-key-delivery";
import { computeMediaKeyAckProof, verifyMediaKeyAckProof } from "@/calls/group/runtime/group-call/media-key-ack-proof";
import { logGroupCallInfo, logGroupCallWarn } from "@/calls/group/runtime/group-call/logger";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import {
  hasAuthoritativeGroupCallDeviceRoster,
  mergeGroupCallDeviceRoster,
  selectAuthoritativeGroupCallParticipantDevices,
  shouldRefreshAuthoritativeGroupCallDeviceRoster,
  toGroupCallDeviceRoster,
  type GroupCallDeviceRoster,
} from "@/calls/group/model/group-call-device-roster";
import { type UseGroupCallMediaKeyRuntimeOptions } from "./group-call-media-key-runtime-shared";

interface UseGroupCallMediaKeyExchangeOptions extends Pick<
  UseGroupCallMediaKeyRuntimeOptions,
  | "session"
  | "callId"
  | "userId"
  | "deviceId"
  | "identityDhKeyPair"
  | "effectiveMediaEncryptionMode"
  | "effectiveFrameEncryptionEnabled"
  | "activeParticipantUserIds"
  | "activeParticipantDeviceIdsByUserId"
  | "localMediaKey"
  | "setLocalMediaKey"
  | "setSharedMediaKeyDeviceCount"
  | "setReceivedMediaKeyCount"
  | "setError"
  | "localMediaKeyRef"
  | "sharedMediaKeyTargetsRef"
  | "receivedMediaKeysRef"
  | "mediaKeyDeliveryTrackerRef"
  | "sfuClientRef"
  | "mediaKeyFallbackMessage"
> {
  wsConnected: boolean;
  markMediaKeyDeliveryAttempt: (targetDeviceId: string, keyId: string) => void;
  evaluateBalancedMediaKeyFallback: (keyId: string) => void;
}

type GroupCallParticipantDevice = ReturnType<typeof selectAuthoritativeGroupCallParticipantDevices>[number];

interface ShareMediaKeyToDevicesResult {
  attemptedTargets: number;
  cancelled: boolean;
}

function countRemoteParticipantUsers(activeParticipantUserIds: string[], localUserId: string): number {
  let count = 0;
  for (const participantUserId of activeParticipantUserIds) {
    if (participantUserId !== localUserId) {
      count += 1;
    }
  }
  return count;
}

function countExpectedRemoteDevices(
  activeParticipantDeviceIdsByUserId: Record<string, string[]>,
  localUserId: string,
  localDeviceId: string
): number {
  let count = 0;
  for (const [participantUserId, participantDeviceIds] of Object.entries(activeParticipantDeviceIdsByUserId)) {
    for (const participantDeviceId of participantDeviceIds) {
      if (participantUserId === localUserId && participantDeviceId === localDeviceId) {
        continue;
      }
      count += 1;
    }
  }
  return count;
}

function shouldFallbackToTransport(params: {
  effectiveMediaEncryptionMode: UseGroupCallMediaKeyExchangeOptions["effectiveMediaEncryptionMode"];
  attemptedTargets: number;
  hasAuthoritativeDeviceRoster: boolean;
  expectedRemoteDeviceCount: number;
  remoteParticipantCount: number;
}): boolean {
  return (
    params.effectiveMediaEncryptionMode === "best-effort" &&
    params.attemptedTargets === 0 &&
    (
      (params.hasAuthoritativeDeviceRoster && params.expectedRemoteDeviceCount > 0) ||
      (!params.hasAuthoritativeDeviceRoster && params.remoteParticipantCount > 0)
    )
  );
}

function deliverGroupCallMediaKeySignal(
  callId: string,
  targetDeviceId: string,
  localMediaKey: LocalGroupCallMediaKey,
  encryptedKey: string,
  deliveryTracker: GroupCallMediaKeyDeliveryTracker | null
) {
  const signal = {
    type: "group.call.media-key" as const,
    callId,
    targetDeviceId,
    epoch: localMediaKey.epoch,
    keyId: localMediaKey.keyId,
    algorithm: localMediaKey.algorithm,
    encryptedKey,
  };
  if (deliveryTracker) {
    deliveryTracker.share(signal);
    return;
  }

  wsClient.send(signal, {
    queueIfDisconnected: true,
    queueKey: `group.call.media-key:${signal.callId}:${signal.targetDeviceId}:${signal.keyId}`,
    ttlMs: 15_000,
  });
}

function resolveParticipantDevicesForMediaKeySharing(
  callId: string,
  participantUserId: string,
  devicesByUserId: GroupCallDeviceRoster,
  activeParticipantDeviceIdsByUserId: Record<string, string[]>,
  hasAuthoritativeDeviceRoster: boolean,
  localUserId: string,
  localDeviceId: string
): GroupCallParticipantDevice[] {
  const participantDevices = selectAuthoritativeGroupCallParticipantDevices({
    roster: devicesByUserId,
    participantUserId,
    activeParticipantDeviceIdsByUserId,
    localUserId,
    localDeviceId,
  });

  if (hasAuthoritativeDeviceRoster && participantDevices.length === 0) {
    const expectedDeviceIds =
      activeParticipantDeviceIdsByUserId[participantUserId] ?? [];
    if (
      expectedDeviceIds.length > 0 &&
      !(participantUserId === localUserId && expectedDeviceIds.length === 1 && expectedDeviceIds[0] === localDeviceId)
    ) {
      logGroupCallWarn(
        "[gc] roster missing devices",
        {
          callId,
          participantUserId,
          expectedDeviceIds,
        }
      );
    }
  }

  return participantDevices;
}

async function shareMediaKeyToParticipantDevices(
  callId: string,
  participantDevices: GroupCallParticipantDevice[],
  localMediaKey: LocalGroupCallMediaKey,
  senderIdentity: readonly [senderUserId: string, senderDeviceId: string],
  deliveryContext: readonly [
    sharedMediaKeyTargets: Set<string>,
    markMediaKeyDeliveryAttempt: UseGroupCallMediaKeyExchangeOptions["markMediaKeyDeliveryAttempt"],
    deliveryTracker: GroupCallMediaKeyDeliveryTracker | null,
  ],
  isCancelled: () => boolean
): Promise<ShareMediaKeyToDevicesResult> {
  const [senderUserId, senderDeviceId] = senderIdentity;
  const [sharedMediaKeyTargets, markMediaKeyDeliveryAttempt, deliveryTracker] = deliveryContext;
  let attemptedTargets = 0;

  for (const participantDevice of participantDevices) {
    if (!participantDevice.identityKeyPublic) continue;
    if (sharedMediaKeyTargets.has(participantDevice.deviceId)) continue;

    attemptedTargets += 1;
    markMediaKeyDeliveryAttempt(participantDevice.deviceId, localMediaKey.keyId);

    let encryptedKey: string;
    try {
      encryptedKey = await encryptGroupCallMediaKeyForDevice(
        localMediaKey,
        participantDevice.identityKeyPublic,
        {
          callId,
          senderUserId,
          senderDeviceId,
          targetDeviceId: participantDevice.deviceId,
        }
      );
    } catch (encryptionError) {
      if (isCancelled()) {
        return { attemptedTargets, cancelled: true };
      }
      logGroupCallWarn("[group-call] media-key encrypt failed", {
        targetDeviceId: participantDevice.deviceId,
        error: encryptionError,
      });
      continue;
    }

    if (isCancelled()) {
      return { attemptedTargets, cancelled: true };
    }

    deliverGroupCallMediaKeySignal(
      callId,
      participantDevice.deviceId,
      localMediaKey,
      encryptedKey,
      deliveryTracker
    );
  }

  return { attemptedTargets, cancelled: false };
}

export function useGroupCallMediaKeyExchange({
  session,
  callId,
  userId,
  deviceId,
  identityDhKeyPair,
  effectiveMediaEncryptionMode,
  effectiveFrameEncryptionEnabled,
  activeParticipantUserIds,
  activeParticipantDeviceIdsByUserId,
  localMediaKey,
  setLocalMediaKey,
  setSharedMediaKeyDeviceCount,
  setReceivedMediaKeyCount,
  setError,
  localMediaKeyRef,
  sharedMediaKeyTargetsRef,
  receivedMediaKeysRef,
  mediaKeyDeliveryTrackerRef,
  sfuClientRef,
  mediaKeyFallbackMessage,
  wsConnected,
  markMediaKeyDeliveryAttempt,
  evaluateBalancedMediaKeyFallback,
}: UseGroupCallMediaKeyExchangeOptions) {
  const memberDeviceRosterRef = useRef<GroupCallDeviceRoster>({});
  const memberDeviceRosterLoadedGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.groupId) {
      memberDeviceRosterRef.current = {};
      memberDeviceRosterLoadedGroupIdRef.current = null;
      return;
    }

    if (memberDeviceRosterLoadedGroupIdRef.current !== session.groupId) {
      memberDeviceRosterRef.current = {};
      memberDeviceRosterLoadedGroupIdRef.current = session.groupId;
    }
  }, [session?.groupId]);

  useEffect(() => {
    if (!effectiveFrameEncryptionEnabled || !callId || !identityDhKeyPair || !deviceId) {
      return;
    }

    let cancelled = false;

    const unsubscribe = wsClient.on((msg) => {
      if (msg.type !== "group.call.media-key") return;
      if (msg.callId !== callId || msg.targetDeviceId !== deviceId) return;

      decryptGroupCallMediaKeyFromSignal(msg, identityDhKeyPair)
        .then((decrypted) => {
          if (cancelled) return;

          const current = receivedMediaKeysRef.current[decrypted.senderDeviceId];
          if (!shouldReplaceReceivedGroupCallMediaKey(current, decrypted)) {
            return;
          }

          receivedMediaKeysRef.current = {
            ...receivedMediaKeysRef.current,
            [decrypted.senderDeviceId]: decrypted,
          };
          sfuClientRef.current?.setRemoteMediaKey(decrypted.senderDeviceId, decrypted);
          setReceivedMediaKeyCount(Object.keys(receivedMediaKeysRef.current).length);
          logGroupCallInfo("[gc] media-key accepted", {
            callId,
            senderUserId: decrypted.senderUserId,
            senderDeviceId: decrypted.senderDeviceId,
            epoch: decrypted.epoch,
            keyId: decrypted.keyId,
          });

          computeMediaKeyAckProof(decrypted.keyBytes, decrypted.keyId)
            .then((keyProof) => {
              if (cancelled) return;
              wsClient.send(
                {
                  type: "group.call.media-key.ack",
                  callId,
                  targetDeviceId: decrypted.senderDeviceId,
                  epoch: decrypted.epoch,
                  keyId: decrypted.keyId,
                  keyProof,
                },
                {
                  queueIfDisconnected: true,
                  queueKey: `group.call.media-key.ack:${callId}:${decrypted.senderDeviceId}:${decrypted.keyId}`,
                  ttlMs: 15_000,
                }
              );
            })
            .catch(() => {
              if (cancelled) return;
              wsClient.send(
                {
                  type: "group.call.media-key.ack",
                  callId,
                  targetDeviceId: decrypted.senderDeviceId,
                  epoch: decrypted.epoch,
                  keyId: decrypted.keyId,
                },
                {
                  queueIfDisconnected: true,
                  queueKey: `group.call.media-key.ack:${callId}:${decrypted.senderDeviceId}:${decrypted.keyId}`,
                  ttlMs: 15_000,
                }
              );
            });
        })
        .catch((decryptError) => {
          if (cancelled) return;
          logGroupCallWarn("[gc] media-key decrypt failed", decryptError);
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    callId,
    deviceId,
    effectiveFrameEncryptionEnabled,
    identityDhKeyPair,
    receivedMediaKeysRef,
    setReceivedMediaKeyCount,
    sfuClientRef,
  ]);

  useEffect(() => {
    if (!effectiveFrameEncryptionEnabled || !callId || !deviceId) {
      return;
    }

    let active = true;

    const unsubscribe = wsClient.on((msg) => {
      if (!active) return;
      if (msg.type !== "group.call.media-key.ack") return;
      if (msg.callId !== callId || msg.targetDeviceId !== deviceId) return;

      const tracker = mediaKeyDeliveryTrackerRef.current;
      if (!tracker) return;

      const localKey = localMediaKeyRef.current;
      const rawKey = localKey?.keyId === msg.keyId ? localKey.keyBytes : null;

      verifyMediaKeyAckProof(rawKey ?? new Uint8Array(32), msg.keyId, msg.keyProof)
        .then((valid) => {
          if (!active) return;
          if (!valid) {
            logGroupCallWarn("[gc] media-key.ack proof invalid, ignoring", {
              callId,
              senderDeviceId: msg.senderDeviceId,
              keyId: msg.keyId,
            });
            return;
          }
          const acknowledgedDeviceId = tracker.acknowledge(msg);
          if (!acknowledgedDeviceId) return;
          if (sharedMediaKeyTargetsRef.current.has(acknowledgedDeviceId)) return;

          sharedMediaKeyTargetsRef.current.add(acknowledgedDeviceId);
          setSharedMediaKeyDeviceCount(sharedMediaKeyTargetsRef.current.size);
        })
        .catch(() => {
          // Crypto failure treated as invalid proof — ignore ACK.
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [callId, deviceId, effectiveFrameEncryptionEnabled, localMediaKeyRef, mediaKeyDeliveryTrackerRef, setSharedMediaKeyDeviceCount, sharedMediaKeyTargetsRef]);

  useEffect(() => {
    if (!effectiveFrameEncryptionEnabled || !session || !callId || !localMediaKey || !wsConnected || activeParticipantUserIds.length === 0) {
      return;
    }
    if (!deviceId || !userId) {
      return;
    }

    let cancelled = false;

    const getParticipantDeviceRoster = async (): Promise<GroupCallDeviceRoster> => {
      const currentRoster = memberDeviceRosterRef.current;
      if (
        shouldRefreshAuthoritativeGroupCallDeviceRoster({
          currentGroupId: session.groupId,
          loadedGroupId: memberDeviceRosterLoadedGroupIdRef.current,
          roster: currentRoster,
          activeParticipantDeviceIdsByUserId,
          localUserId: userId,
          localDeviceId: deviceId,
        })
      ) {
        try {
          const members = await api.getGroupMemberDevices(session.groupId);
          if (cancelled) {
            return currentRoster;
          }
          memberDeviceRosterRef.current = mergeGroupCallDeviceRoster(
            memberDeviceRosterRef.current,
            toGroupCallDeviceRoster(members)
          );
          memberDeviceRosterLoadedGroupIdRef.current = session.groupId;
        } catch (error) {
          if (cancelled) {
            return currentRoster;
          }
          logGroupCallWarn(
            "[group-call] roster refresh failed",
            {
              callId,
              groupId: session.groupId,
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
        hasAuthoritativeGroupCallDeviceRoster(activeParticipantDeviceIdsByUserId);

      for (const participantUserId of activeParticipantUserIds) {
        const participantDevices = resolveParticipantDevicesForMediaKeySharing(
          callId,
          participantUserId,
          devicesByUserId,
          activeParticipantDeviceIdsByUserId,
          hasAuthoritativeDeviceRoster,
          userId,
          deviceId
        );

        const shareResult = await shareMediaKeyToParticipantDevices(
          callId,
          participantDevices,
          localMediaKey,
          [userId, deviceId],
          [
            sharedMediaKeyTargetsRef.current,
            markMediaKeyDeliveryAttempt,
            mediaKeyDeliveryTrackerRef.current,
          ],
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
        activeParticipantUserIds,
        userId
      );
      const expectedRemoteDeviceCount = countExpectedRemoteDevices(
        activeParticipantDeviceIdsByUserId,
        userId,
        deviceId
      );
      const shouldFallback = shouldFallbackToTransport({
        effectiveMediaEncryptionMode,
        attemptedTargets,
        hasAuthoritativeDeviceRoster,
        expectedRemoteDeviceCount,
        remoteParticipantCount,
      });

      if (shouldFallback) {
        localMediaKeyRef.current = null;
        setLocalMediaKey(null);
        sfuClientRef.current?.setLocalMediaKey(null);
        setError((current) => current ?? mediaKeyFallbackMessage);
        logGroupCallInfo("[gc] balanced fallback to transport", {
          callId,
          keyId: localMediaKey.keyId,
          attemptedTargets,
          expectedRemoteDeviceCount,
          hasAuthoritativeDeviceRoster,
        });
        return;
      }

      if (effectiveMediaEncryptionMode === "best-effort" && attemptedTargets > 0) {
        evaluateBalancedMediaKeyFallback(localMediaKey.keyId);
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
    activeParticipantDeviceIdsByUserId,
    activeParticipantUserIds,
    callId,
    deviceId,
    effectiveFrameEncryptionEnabled,
    effectiveMediaEncryptionMode,
    evaluateBalancedMediaKeyFallback,
    localMediaKey,
    localMediaKeyRef,
    markMediaKeyDeliveryAttempt,
    mediaKeyFallbackMessage,
    mediaKeyDeliveryTrackerRef,
    session,
    setError,
    setLocalMediaKey,
    setSharedMediaKeyDeviceCount,
    sharedMediaKeyTargetsRef,
    sfuClientRef,
    userId,
    wsConnected,
  ]);
}
