import { api } from "@/lib/api";
import {
  buildSenderKeyDistributionPayload,
  ensureLocalSenderKeyRecord,
  ensureLocalSenderKeyRecordForMemberDevices,
  markSenderKeyDistributedToDevices,
  type LocalSenderKeyRecord,
} from "@/lib/group-sender-key";
import type { GroupMember } from "./types";

/**
 * group-sender-key-distribution — encrypted group sender-key fanout helpers.
 *
 * Owns:
 *   - authoritative member-device roster fetch for sender-key delivery
 *   - sender-key distribution loop across non-local group member devices
 *   - distributed-device bookkeeping refresh after successful delivery
 *
 * Does not own text/attachment payload encryption or group message projection.
 */

interface SendGroupSenderKeyDistributionOptions {
  prefetchedDevices?: Array<{
    deviceId: string;
    identityKeyPublic: string;
  }>;
}

type SendGroupSenderKeyDistribution = (
  recipientUserId: string,
  payload: ReturnType<typeof buildSenderKeyDistributionPayload>,
  options?: SendGroupSenderKeyDistributionOptions
) => Promise<string[]>;

async function fetchGroupMemberDeviceMap(
  groupId: string
): Promise<
  Record<string, Array<{ deviceId: string; identityKeyPublic: string }>>
> {
  const members = await api.getGroupMemberDevices(groupId);
  const map: Record<
    string,
    Array<{ deviceId: string; identityKeyPublic: string }>
  > = {};
  for (const member of members) {
    map[member.userId] = member.devices.map((device) => ({
      deviceId: device.deviceId,
      identityKeyPublic: device.identityKeyPublic,
    }));
  }
  return map;
}

export async function ensureSenderKeyDistributedToGroupMembers(
  storageKey: CryptoKey,
  groupId: string,
  myUserId: string,
  myDeviceId: string,
  _members: GroupMember[],
  sendSenderKeyDistribution: SendGroupSenderKeyDistribution
): Promise<LocalSenderKeyRecord> {
  const batchMemberDevices = await fetchGroupMemberDeviceMap(groupId);
  const recipientEntries = Object.entries(batchMemberDevices)
    .filter(([memberUserId]) => memberUserId !== myUserId)
    .map(([memberUserId, devices]) => [
      memberUserId,
      devices.filter((device) => device.deviceId !== myDeviceId),
    ] as const)
    .filter(([, devices]) => devices.length > 0);
  const activeRecipientDeviceIds = recipientEntries.flatMap(([, devices]) =>
    devices.map((device) => device.deviceId)
  );

  let record = await ensureLocalSenderKeyRecordForMemberDevices(
    storageKey,
    groupId,
    myDeviceId,
    activeRecipientDeviceIds
  );
  let payload = buildSenderKeyDistributionPayload(record, groupId, myDeviceId);
  const forceRedistributeCurrentKey = record.formatVersion < 2;

  for (const [memberUserId, memberDevices] of recipientEntries) {
    const memberDeviceIds = memberDevices.map((device) => device.deviceId);
    const missingDeviceIds = forceRedistributeCurrentKey
      ? memberDeviceIds
      : memberDeviceIds.filter(
          (deviceId) => !record.distributedToDeviceIds.includes(deviceId)
        );
    if (missingDeviceIds.length === 0) continue;

    const deliveredDeviceIds = await sendSenderKeyDistribution(
      memberUserId,
      payload,
      {
        prefetchedDevices: memberDevices,
      }
    );
    const deliveredMissing = deliveredDeviceIds.filter((deviceId) =>
      missingDeviceIds.includes(deviceId)
    );
    if (deliveredMissing.length === 0) {
      throw new Error(
        `Sender-key distribution failed for member ${memberUserId}`
      );
    }

    await markSenderKeyDistributedToDevices(
      storageKey,
      groupId,
      myDeviceId,
      record.distributionId,
      deliveredMissing
    );
    record = await ensureLocalSenderKeyRecord(storageKey, groupId, myDeviceId);
    payload = buildSenderKeyDistributionPayload(record, groupId, myDeviceId);
  }

  return record;
}
