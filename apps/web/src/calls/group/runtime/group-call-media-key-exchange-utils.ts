import type { LocalGroupCallMediaKey } from "@/calls/group/runtime/media-key/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/media-key/media-key-delivery";
import { logGroupCallWarn } from "@/calls/group/runtime/media-key/logger";
import { wsClient } from "@/lib/websocket";
import {
  encryptGroupCallMediaKeyForDevice,
} from "@/calls/group/runtime/media-key/media-key";
import {
  selectAuthoritativeGroupCallParticipantDevices,
  type GroupCallDeviceRoster,
} from "@/calls/group/model/group-call-device-roster";

export type GroupCallParticipantDevice = ReturnType<typeof selectAuthoritativeGroupCallParticipantDevices>[number];

export interface ShareMediaKeyToDevicesResult {
  attemptedTargets: number;
  cancelled: boolean;
}

interface ShareMediaKeySenderIdentity {
  senderUserId: string;
  senderDeviceId: string;
}

interface ShareMediaKeyDeliveryContext {
  sharedMediaKeyTargets: Set<string>;
  markMediaKeyDeliveryAttempt: (targetDeviceId: string, keyId: string) => void;
  deliveryTracker: GroupCallMediaKeyDeliveryTracker | null;
}

export function countRemoteParticipantUsers(
  activeParticipantUserIds: string[],
  localUserId: string
): number {
  let count = 0;
  for (const participantUserId of activeParticipantUserIds) {
    if (participantUserId !== localUserId) {
      count += 1;
    }
  }
  return count;
}

export function countExpectedRemoteDevices(
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

export function shouldFallbackToTransport(params: {
  effectiveMediaEncryptionMode: "best-effort" | "required" | "off";
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

export function deliverGroupCallMediaKeySignal(
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

export function resolveParticipantDevicesForMediaKeySharing(
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

export async function shareMediaKeyToParticipantDevices(
  callId: string,
  participantDevices: GroupCallParticipantDevice[],
  localMediaKey: LocalGroupCallMediaKey,
  senderIdentity: ShareMediaKeySenderIdentity,
  deliveryContext: ShareMediaKeyDeliveryContext,
  isCancelled: () => boolean
): Promise<ShareMediaKeyToDevicesResult> {
  const { senderUserId, senderDeviceId } = senderIdentity;
  const { sharedMediaKeyTargets, markMediaKeyDeliveryAttempt, deliveryTracker } = deliveryContext;
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
