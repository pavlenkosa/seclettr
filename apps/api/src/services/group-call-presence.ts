import { redis } from "./redis.js";

const GROUP_CALL_PARTICIPANTS_PREFIX = "ws:groupCallParticipants:";
const GROUP_CALL_PARTICIPANT_DEVICES_PREFIX = "ws:groupCallParticipantDevices:";
const GROUP_CALL_PARTICIPANT_DEVICE_USERS_PREFIX = "ws:groupCallParticipantDeviceUsers:";
const GROUP_CALL_PARTICIPANTS_TTL_SECONDS = 60 * 60;

function getParticipantsKey(callId: string): string {
  return `${GROUP_CALL_PARTICIPANTS_PREFIX}${callId}`;
}

function getParticipantDevicesKey(callId: string): string {
  return `${GROUP_CALL_PARTICIPANT_DEVICES_PREFIX}${callId}`;
}

function getParticipantDeviceUsersKey(callId: string): string {
  return `${GROUP_CALL_PARTICIPANT_DEVICE_USERS_PREFIX}${callId}`;
}

async function touchParticipantKeys(callId: string): Promise<void> {
  await Promise.all([
    redis.expire(getParticipantsKey(callId), GROUP_CALL_PARTICIPANTS_TTL_SECONDS),
    redis.expire(getParticipantDevicesKey(callId), GROUP_CALL_PARTICIPANTS_TTL_SECONDS),
    redis.expire(getParticipantDeviceUsersKey(callId), GROUP_CALL_PARTICIPANTS_TTL_SECONDS),
  ]);
}

export async function addGroupCallParticipant(
  callId: string,
  userId: string,
  deviceId: string
): Promise<{ userAdded: boolean; deviceAdded: boolean }> {
  const userKey = getParticipantsKey(callId);
  const deviceKey = getParticipantDevicesKey(callId);
  const deviceUsersKey = getParticipantDeviceUsersKey(callId);

  const userAdded = await redis.sadd(userKey, userId);
  const deviceAdded = await redis.sadd(deviceKey, deviceId);
  await redis.hset(deviceUsersKey, deviceId, userId);
  await touchParticipantKeys(callId);

  return {
    userAdded: userAdded > 0,
    deviceAdded: deviceAdded > 0,
  };
}

export async function removeGroupCallParticipant(
  callId: string,
  userId: string,
  deviceId: string
): Promise<{ userRemoved: boolean; deviceRemoved: boolean }> {
  const userKey = getParticipantsKey(callId);
  const deviceKey = getParticipantDevicesKey(callId);
  const deviceUsersKey = getParticipantDeviceUsersKey(callId);

  const deviceRemoved = await redis.srem(deviceKey, deviceId);
  await redis.hdel(deviceUsersKey, deviceId);

  if (deviceRemoved === 0) {
    const activeDeviceUserIds = await redis.hvals(deviceUsersKey);
    if (activeDeviceUserIds.length === 0) {
      const legacyRemoved = await redis.srem(userKey, userId);
      await touchParticipantKeys(callId);
      return {
        userRemoved: legacyRemoved > 0,
        deviceRemoved: false,
      };
    }

    await touchParticipantKeys(callId);
    return {
      userRemoved: false,
      deviceRemoved: false,
    };
  }

  const activeDeviceUserIds = await redis.hvals(deviceUsersKey);
  const userStillPresent = activeDeviceUserIds.includes(userId);
  const userRemoved = userStillPresent ? 0 : await redis.srem(userKey, userId);
  await touchParticipantKeys(callId);

  return {
    userRemoved: userRemoved > 0,
    deviceRemoved: true,
  };
}

export async function listGroupCallParticipants(callId: string): Promise<string[]> {
  const deviceUserKey = getParticipantDeviceUsersKey(callId);
  const activeDeviceUserIds = await redis.hvals(deviceUserKey);
  if (activeDeviceUserIds.length > 0) {
    await touchParticipantKeys(callId);
    return [...new Set(activeDeviceUserIds)].sort((left, right) => left.localeCompare(right));
  }

  const userIds = await redis.smembers(getParticipantsKey(callId));
  if (userIds.length > 0) {
    await touchParticipantKeys(callId);
  }
  return [...new Set(userIds)].sort((left, right) => left.localeCompare(right));
}

export async function hasDeviceScopedGroupCallParticipants(callId: string): Promise<boolean> {
  const count = await redis.scard(getParticipantDevicesKey(callId));
  if (count > 0) {
    await touchParticipantKeys(callId);
    return true;
  }
  return false;
}

export async function hasGroupCallParticipantUser(callId: string, userId: string): Promise<boolean> {
  const activeDeviceUserIds = await redis.hvals(getParticipantDeviceUsersKey(callId));
  if (activeDeviceUserIds.length > 0) {
    await touchParticipantKeys(callId);
    return activeDeviceUserIds.includes(userId);
  }

  const isMember = await redis.sismember(getParticipantsKey(callId), userId);
  if (isMember === 1) {
    await touchParticipantKeys(callId);
  }
  return isMember === 1;
}

export async function hasGroupCallParticipantDevice(callId: string, deviceId: string): Promise<boolean> {
  const isMember = await redis.sismember(getParticipantDevicesKey(callId), deviceId);
  if (isMember === 1) {
    await touchParticipantKeys(callId);
  }
  return isMember === 1;
}

export async function listGroupCallParticipantDevices(callId: string): Promise<string[]> {
  const deviceIds = await redis.smembers(getParticipantDevicesKey(callId));
  if (deviceIds.length > 0) {
    await touchParticipantKeys(callId);
  }
  return [...new Set(deviceIds)].sort((left, right) => left.localeCompare(right));
}

export type GroupCallParticipantDeviceUser = {
  deviceId: string;
  userId: string;
};

export async function listGroupCallParticipantDeviceUsers(
  callId: string
): Promise<GroupCallParticipantDeviceUser[]> {
  const mapping = await redis.hgetall(getParticipantDeviceUsersKey(callId));
  const entries = Object.entries(mapping)
    .filter(([, userId]) => typeof userId === "string" && userId.length > 0)
    .map(([deviceId, userId]) => ({ deviceId, userId }))
    .sort((left, right) => (
      left.userId.localeCompare(right.userId) ||
      left.deviceId.localeCompare(right.deviceId)
    ));

  if (entries.length > 0) {
    await touchParticipantKeys(callId);
  }

  return entries;
}

export async function clearGroupCallParticipants(callId: string): Promise<void> {
  await redis.del(
    getParticipantsKey(callId),
    getParticipantDevicesKey(callId),
    getParticipantDeviceUsersKey(callId)
  );
}
