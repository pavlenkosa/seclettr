import type { PlaintextSenderKeyDistributionMessage } from "@seclettr/protocol";
import {
  ensureSenderKeyDistributedToGroupMembers,
} from "./group-helpers";
import type { GroupMember } from "./types";

interface CreateGroupsOutboundSenderKeyRuntimeOptions {
  getMyUserId: () => string | null;
  getMyDeviceId: () => string | null;
  getStorageKey: () => CryptoKey | null;
  sendSenderKeyDistribution: (
    recipientUserId: string,
    payload: PlaintextSenderKeyDistributionMessage,
    options?: {
      prefetchedDevices?: Array<{
        deviceId: string;
        identityKeyPublic: string;
      }>;
    }
  ) => Promise<string[]>;
}

/**
 * Owns the sender-key distribution precondition for encrypted group sends.
 * Visible text/attachment send branches stay outside this runtime.
 */
export function createGroupsOutboundSenderKeyRuntime({
  getMyUserId,
  getMyDeviceId,
  getStorageKey,
  sendSenderKeyDistribution,
}: CreateGroupsOutboundSenderKeyRuntimeOptions) {
  return {
    async ensureGroupSenderKeys(groupId: string, members: GroupMember[]) {
      const myUserId = getMyUserId();
      const myDeviceId = getMyDeviceId();
      const storageKey = getStorageKey();
      if (!myUserId || !myDeviceId || !storageKey) {
        throw new Error("Not authenticated");
      }

      await ensureSenderKeyDistributedToGroupMembers(
        storageKey,
        groupId,
        myUserId,
        myDeviceId,
        members,
        sendSenderKeyDistribution as Parameters<
          typeof ensureSenderKeyDistributedToGroupMembers
        >[5]
      );

      return {
        myDeviceId,
        storageKey,
      };
    },
  };
}
