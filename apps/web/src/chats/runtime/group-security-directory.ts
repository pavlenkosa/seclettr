export interface UserDeviceIdentityDto {
  deviceId: string;
  identityKeyPublic: string;
}

export interface GroupSecurityTarget {
  recipientUserId: string;
  recipientUsername: string;
  peerIdentityByDevice: Record<string, string>;
  preferredDeviceId: string | null;
}

export interface GroupSecurityDirectory {
  fetchGroupSecurityDevices: (
    groupId: string
  ) => Promise<Record<string, UserDeviceIdentityDto[]>>;
}

interface CreateGroupSecurityDirectoryOptions {
  ttlMs?: number;
  now?: () => number;
  fetchMemberDevices: (groupId: string) => Promise<
    Array<{
      userId: string;
      devices: UserDeviceIdentityDto[];
    }>
  >;
}

const DEFAULT_GROUP_SECURITY_DEVICE_CACHE_TTL_MS = 2_000;

export function buildGroupSecurityTarget(
  member: {
    userId: string;
    username: string;
  },
  devicesByUserId: Record<string, UserDeviceIdentityDto[]>
): GroupSecurityTarget {
  const peerIdentityByDevice = [...(devicesByUserId[member.userId] ?? [])]
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId))
    .reduce<Record<string, string>>((acc, deviceInfo) => {
      acc[deviceInfo.deviceId] = deviceInfo.identityKeyPublic;
      return acc;
    }, {});
  const preferredDeviceId = Object.keys(peerIdentityByDevice)[0] ?? null;

  return {
    recipientUserId: member.userId,
    recipientUsername: member.username,
    peerIdentityByDevice,
    preferredDeviceId,
  };
}

export function createGroupSecurityDirectory(
  options: CreateGroupSecurityDirectoryOptions
): GroupSecurityDirectory {
  const ttlMs = options.ttlMs ?? DEFAULT_GROUP_SECURITY_DEVICE_CACHE_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<
    string,
    {
      expiresAt: number;
      devicesByUserId: Record<string, UserDeviceIdentityDto[]>;
    }
  >();
  const inFlight = new Map<
    string,
    Promise<Record<string, UserDeviceIdentityDto[]>>
  >();

  const fetchGroupSecurityDevices = async (
    groupId: string
  ): Promise<Record<string, UserDeviceIdentityDto[]>> => {
    const cached = cache.get(groupId);
    if (cached && cached.expiresAt > now()) {
      return cached.devicesByUserId;
    }

    const existingRequest = inFlight.get(groupId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = options
      .fetchMemberDevices(groupId)
      .then((members) => {
        const devicesByUserId: Record<string, UserDeviceIdentityDto[]> = {};
        for (const member of members) {
          devicesByUserId[member.userId] = member.devices.map((device) => ({
            deviceId: device.deviceId,
            identityKeyPublic: device.identityKeyPublic,
          }));
        }
        cache.set(groupId, {
          expiresAt: now() + ttlMs,
          devicesByUserId,
        });
        return devicesByUserId;
      })
      .finally(() => {
        inFlight.delete(groupId);
      });

    inFlight.set(groupId, request);
    return request;
  };

  return {
    fetchGroupSecurityDevices,
  };
}
