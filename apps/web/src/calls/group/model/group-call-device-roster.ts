/**
 * group-call-device-roster — device roster model for E2EE media-key targeting.
 *
 * Owns:
 *   - GroupCallDeviceRoster type — userId → GroupCallMemberDeviceRecord[] map
 *   - hasAuthoritativeGroupCallDeviceRoster — true when active-device-ids are known
 *   - mergeGroupCallDeviceRoster — merges two rosters, preferring the most complete
 *     identityKeyPublic per device; used when roster refreshes arrive asynchronously
 *   - toGroupCallDeviceRoster — converts the API member device list to the roster format
 *   - hasMissingRemoteGroupDevices — checks if any active device is absent from the roster
 *   - shouldRefreshAuthoritativeGroupCallDeviceRoster — determines when a roster refresh
 *     fetch is needed (new group, or roster is missing active devices)
 *   - selectAuthoritativeGroupCallParticipantDevices — returns the intersection of known
 *     roster entries and active-device IDs for a participant, excluding the local device
 *
 * Does not own key exchange or device-key fetch (see useGroupCallMediaKeyExchange).
 */
interface GroupCallMemberDeviceRecord {
  deviceId: string;
  identityKeyPublic?: string;
}

export type GroupCallDeviceRoster = Record<string, GroupCallMemberDeviceRecord[]>;

export function hasAuthoritativeGroupCallDeviceRoster(
  activeParticipantDeviceIdsByUserId: Record<string, string[]>
): boolean {
  return Object.keys(activeParticipantDeviceIdsByUserId).length > 0;
}

function mergeDeviceLists(
  currentDevices: GroupCallMemberDeviceRecord[],
  nextDevices: GroupCallMemberDeviceRecord[]
): GroupCallMemberDeviceRecord[] {
  const mergedByDeviceId = new Map<string, GroupCallMemberDeviceRecord>();

  for (const device of currentDevices) {
    mergedByDeviceId.set(device.deviceId, device);
  }

  for (const device of nextDevices) {
    const current = mergedByDeviceId.get(device.deviceId);
    if (!current) {
      mergedByDeviceId.set(device.deviceId, device);
      continue;
    }

    mergedByDeviceId.set(device.deviceId, {
      ...current,
      ...device,
      identityKeyPublic: device.identityKeyPublic ?? current.identityKeyPublic,
    });
  }

  return [...mergedByDeviceId.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

export function mergeGroupCallDeviceRoster(
  currentRoster: GroupCallDeviceRoster,
  incomingRoster: GroupCallDeviceRoster
): GroupCallDeviceRoster {
  const nextRoster: GroupCallDeviceRoster = { ...currentRoster };

  for (const [userId, devices] of Object.entries(incomingRoster)) {
    nextRoster[userId] = mergeDeviceLists(currentRoster[userId] ?? [], devices);
  }

  return nextRoster;
}

export function toGroupCallDeviceRoster(
  members: Array<{
    userId: string;
    devices: GroupCallMemberDeviceRecord[];
  }>
): GroupCallDeviceRoster {
  return Object.fromEntries(
    members.map((member) => [member.userId, member.devices])
  );
}

export function hasMissingRemoteGroupDevices(
  roster: GroupCallDeviceRoster,
  activeParticipantDeviceIdsByUserId: Record<string, string[]>,
  localUserId: string | null,
  localDeviceId: string | null
): boolean {
  for (const [participantUserId, participantDeviceIds] of Object.entries(activeParticipantDeviceIdsByUserId)) {
    for (const participantDeviceId of participantDeviceIds) {
      if (participantUserId === localUserId && participantDeviceId === localDeviceId) {
        continue;
      }

      const knownDevices = roster[participantUserId] ?? [];
      if (!knownDevices.some((knownDevice) => knownDevice.deviceId === participantDeviceId)) {
        return true;
      }
    }
  }

  return false;
}

export function shouldRefreshAuthoritativeGroupCallDeviceRoster(options: {
  currentGroupId: string | null;
  loadedGroupId: string | null;
  roster: GroupCallDeviceRoster;
  activeParticipantDeviceIdsByUserId: Record<string, string[]>;
  localUserId: string | null;
  localDeviceId: string | null;
}): boolean {
  if (!options.currentGroupId) {
    return false;
  }

  if (options.loadedGroupId !== options.currentGroupId) {
    return true;
  }

  if (
    !hasAuthoritativeGroupCallDeviceRoster(
      options.activeParticipantDeviceIdsByUserId
    )
  ) {
    return false;
  }

  return hasMissingRemoteGroupDevices(
    options.roster,
    options.activeParticipantDeviceIdsByUserId,
    options.localUserId,
    options.localDeviceId
  );
}

export function selectAuthoritativeGroupCallParticipantDevices(options: {
  roster: GroupCallDeviceRoster;
  participantUserId: string;
  activeParticipantDeviceIdsByUserId: Record<string, string[]>;
  localUserId: string | null;
  localDeviceId: string | null;
}): GroupCallMemberDeviceRecord[] {
  let participantDevices = options.roster[options.participantUserId] ?? [];
  const activeDeviceIds =
    options.activeParticipantDeviceIdsByUserId[options.participantUserId] ?? [];

  if (activeDeviceIds.length > 0) {
    const activeDeviceIdSet = new Set(activeDeviceIds);
    participantDevices = participantDevices.filter((participantDevice) =>
      activeDeviceIdSet.has(participantDevice.deviceId)
    );
  }

  if (options.participantUserId === options.localUserId && options.localDeviceId) {
    participantDevices = participantDevices.filter(
      (participantDevice) => participantDevice.deviceId !== options.localDeviceId
    );
  }

  return participantDevices;
}
