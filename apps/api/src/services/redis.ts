import { EventEmitter } from "node:events";
import { Redis as IORedis } from "ioredis";
import {
  WS_PROTOCOL_VERSION,
  type WsServerMessage,
  withWireVersion,
} from "@seclettr/protocol";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

const USE_IN_MEMORY_SERVICES =
  process.env["QM_API_TEST_USE_IN_MEMORY_SERVICES"] === "1";

type StringEntry = {
  kind: "string";
  value: string;
  expiresAt: number | null;
};

type SetEntry = {
  kind: "set";
  value: Set<string>;
  expiresAt: number | null;
};

type HashEntry = {
  kind: "hash";
  value: Map<string, string>;
  expiresAt: number | null;
};

type InMemoryEntry = StringEntry | SetEntry | HashEntry;

type RedisCoreClient = {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  publish(channel: string, payload: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  sismember(key: string, member: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hdel(key: string, field: string): Promise<number>;
  hvals(key: string): Promise<string[]>;
  hgetall(key: string): Promise<Record<string, string>>;
  disconnect(): void;
};

type RedisSubscriberClient = {
  on(
    event: "message",
    listener: (channel: string, payload: string) => void
  ): unknown;
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
};

const inMemoryState = {
  entries: new Map<string, InMemoryEntry>(),
  subscribers: new Set<InMemoryRedisClient>(),
};

function nowMs(): number {
  return Date.now();
}

function purgeExpiredEntry(key: string): InMemoryEntry | null {
  const entry = inMemoryState.entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= nowMs()) {
    inMemoryState.entries.delete(key);
    return null;
  }
  return entry;
}

function setEntry(key: string, entry: InMemoryEntry): void {
  inMemoryState.entries.set(key, entry);
}

function assertStringEntry(
  entry: InMemoryEntry | null,
  key: string
): StringEntry | null {
  if (!entry) return null;
  if (entry.kind !== "string") {
    throw new Error(
      `WRONGTYPE Operation against a key holding the wrong kind of value: ${key}`
    );
  }
  return entry;
}

function assertSetEntry(
  entry: InMemoryEntry | null,
  key: string
): SetEntry | null {
  if (!entry) return null;
  if (entry.kind !== "set") {
    throw new Error(
      `WRONGTYPE Operation against a key holding the wrong kind of value: ${key}`
    );
  }
  return entry;
}

function assertHashEntry(
  entry: InMemoryEntry | null,
  key: string
): HashEntry | null {
  if (!entry) return null;
  if (entry.kind !== "hash") {
    throw new Error(
      `WRONGTYPE Operation against a key holding the wrong kind of value: ${key}`
    );
  }
  return entry;
}

class InMemoryRedisClient
  extends EventEmitter
  implements RedisCoreClient, RedisSubscriberClient
{
  private readonly subscribedChannels = new Set<string>();

  async ping(): Promise<string> {
    return "PONG";
  }

  async get(key: string): Promise<string | null> {
    const entry = assertStringEntry(purgeExpiredEntry(key), key);
    return entry?.value ?? null;
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    setEntry(key, {
      kind: "string",
      value,
      expiresAt: nowMs() + seconds * 1000,
    });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (inMemoryState.entries.delete(key)) {
        removed += 1;
      }
    }
    return removed;
  }

  async incr(key: string): Promise<number> {
    const current = assertStringEntry(purgeExpiredEntry(key), key);
    const nextValue = (current ? Number.parseInt(current.value, 10) : 0) + 1;
    setEntry(key, {
      kind: "string",
      value: String(nextValue),
      expiresAt: current?.expiresAt ?? null,
    });
    return nextValue;
  }

  async ttl(key: string): Promise<number> {
    const entry = purgeExpiredEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    const secondsRemaining = Math.ceil((entry.expiresAt - nowMs()) / 1000);
    if (secondsRemaining <= 0) {
      inMemoryState.entries.delete(key);
      return -2;
    }
    return secondsRemaining;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = purgeExpiredEntry(key);
    if (!entry) return 0;
    entry.expiresAt = nowMs() + seconds * 1000;
    return 1;
  }

  async publish(channel: string, payload: string): Promise<number> {
    let delivered = 0;
    for (const subscriber of inMemoryState.subscribers) {
      if (!subscriber.subscribedChannels.has(channel)) continue;
      delivered += 1;
      queueMicrotask(() => {
        subscriber.emit("message", channel, payload);
      });
    }
    return delivered;
  }

  async subscribe(...channels: string[]): Promise<number> {
    for (const channel of channels) {
      this.subscribedChannels.add(channel);
    }
    inMemoryState.subscribers.add(this);
    return this.subscribedChannels.size;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    if (channels.length > 0) {
      for (const channel of channels) {
        this.subscribedChannels.delete(channel);
      }
    } else {
      this.subscribedChannels.clear();
    }
    if (this.subscribedChannels.size === 0) {
      inMemoryState.subscribers.delete(this);
    }
    return this.subscribedChannels.size;
  }

  async quit(): Promise<string> {
    this.disconnect();
    return "OK";
  }

  async sadd(key: string, member: string): Promise<number> {
    const current = assertSetEntry(purgeExpiredEntry(key), key);
    const next = current ?? {
      kind: "set" as const,
      value: new Set<string>(),
      expiresAt: null,
    };
    const beforeSize = next.value.size;
    next.value.add(member);
    setEntry(key, next);
    return next.value.size > beforeSize ? 1 : 0;
  }

  async srem(key: string, member: string): Promise<number> {
    const entry = assertSetEntry(purgeExpiredEntry(key), key);
    if (!entry) return 0;
    const deleted = entry.value.delete(member) ? 1 : 0;
    if (entry.value.size === 0) {
      inMemoryState.entries.delete(key);
    }
    return deleted;
  }

  async smembers(key: string): Promise<string[]> {
    const entry = assertSetEntry(purgeExpiredEntry(key), key);
    return entry ? [...entry.value] : [];
  }

  async scard(key: string): Promise<number> {
    const entry = assertSetEntry(purgeExpiredEntry(key), key);
    return entry?.value.size ?? 0;
  }

  async sismember(key: string, member: string): Promise<number> {
    const entry = assertSetEntry(purgeExpiredEntry(key), key);
    return entry?.value.has(member) ? 1 : 0;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const current = assertHashEntry(purgeExpiredEntry(key), key);
    const next = current ?? {
      kind: "hash" as const,
      value: new Map<string, string>(),
      expiresAt: null,
    };
    const existed = next.value.has(field);
    next.value.set(field, value);
    setEntry(key, next);
    return existed ? 0 : 1;
  }

  async hdel(key: string, field: string): Promise<number> {
    const entry = assertHashEntry(purgeExpiredEntry(key), key);
    if (!entry) return 0;
    const deleted = entry.value.delete(field) ? 1 : 0;
    if (entry.value.size === 0) {
      inMemoryState.entries.delete(key);
    }
    return deleted;
  }

  async hvals(key: string): Promise<string[]> {
    const entry = assertHashEntry(purgeExpiredEntry(key), key);
    return entry ? [...entry.value.values()] : [];
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const entry = assertHashEntry(purgeExpiredEntry(key), key);
    return entry ? Object.fromEntries(entry.value.entries()) : {};
  }

  disconnect(): void {
    this.subscribedChannels.clear();
    inMemoryState.subscribers.delete(this);
    this.removeAllListeners();
  }
}

function createIoRedisClient(): IORedis {
  return new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
}

export const usingInMemoryRedis = USE_IN_MEMORY_SERVICES;

export const redis: RedisCoreClient = USE_IN_MEMORY_SERVICES
  ? new InMemoryRedisClient()
  : createIoRedisClient();

redis.on("error", (err) => {
  logger.error("Redis client error", err);
});

export function createRedisSubscriber(): RedisSubscriberClient {
  if (USE_IN_MEMORY_SERVICES) {
    return new InMemoryRedisClient();
  }
  return createIoRedisClient();
}

/**
 * Store the mapping: deviceId → active WebSocket connection IDs.
 * Set-based shape preserves correctness when one device has multiple tabs/sockets.
 * TTL matches the WS keepalive expectation.
 */
const DEVICE_SOCKET_SET_PREFIX = "ws:device-sockets:";
// Keep legacy key prefix for backwards compatibility; value members are socket IDs.
const USER_ACTIVE_SOCKET_SET_PREFIX = "ws:user-active-devices:";
const DEVICE_SOCKET_TTL_SECONDS = 300;

function getDeviceSocketSetKey(deviceId: string): string {
  return `${DEVICE_SOCKET_SET_PREFIX}${deviceId}`;
}

function getUserActiveSocketSetKey(userId: string): string {
  return `${USER_ACTIVE_SOCKET_SET_PREFIX}${userId}`;
}

export async function registerDeviceSocket(
  userId: string,
  deviceId: string,
  socketId: string
): Promise<void> {
  const deviceKey = getDeviceSocketSetKey(deviceId);
  const userKey = getUserActiveSocketSetKey(userId);
  await redis.sadd(deviceKey, socketId);
  await redis.sadd(userKey, socketId);
  await Promise.all([
    redis.expire(deviceKey, DEVICE_SOCKET_TTL_SECONDS),
    redis.expire(userKey, DEVICE_SOCKET_TTL_SECONDS),
  ]);
}

export async function unregisterDeviceSocket(
  userId: string,
  deviceId: string,
  socketId: string
): Promise<void> {
  const deviceKey = getDeviceSocketSetKey(deviceId);
  const userKey = getUserActiveSocketSetKey(userId);
  await redis.srem(deviceKey, socketId);
  await redis.srem(userKey, socketId);
}

export async function getDeviceSocketId(
  deviceId: string
): Promise<string | null> {
  const socketIds = await redis.smembers(getDeviceSocketSetKey(deviceId));
  return socketIds[0] ?? null;
}

export async function hasRegisteredDeviceSocket(
  deviceId: string
): Promise<boolean> {
  const count = await redis.scard(getDeviceSocketSetKey(deviceId));
  return count > 0;
}

export async function hasRegisteredUserSocket(
  userId: string
): Promise<boolean> {
  const count = await redis.scard(getUserActiveSocketSetKey(userId));
  return count > 0;
}

export async function touchDeviceSocket(
  userId: string,
  deviceId: string
): Promise<void> {
  await Promise.all([
    redis.expire(getDeviceSocketSetKey(deviceId), DEVICE_SOCKET_TTL_SECONDS),
    redis.expire(getUserActiveSocketSetKey(userId), DEVICE_SOCKET_TTL_SECONDS),
  ]);
}

/**
 * Pub/Sub channel for multi-instance message fan-out.
 * When a message arrives for a device, we publish to its channel.
 * Any API instance subscribed for that device delivers it.
 */
export const MESSAGE_CHANNEL = "seclettr:messages";

export async function publishMessage(payload: unknown): Promise<void> {
  await redis.publish(
    MESSAGE_CHANNEL,
    JSON.stringify(normalizeRedisWsEnvelope(payload))
  );
}

export async function publishPresenceUpdate(
  payload: Extract<WsServerMessage, { type: "presence.update" }>
): Promise<void> {
  await publishMessage({
    scope: "presence.broadcast",
    ...payload,
  });
}

/**
 * Signal all open WebSocket connections for a device to close.
 * Used after session logout so lingering access-token connections are terminated.
 */
export async function publishForceDisconnect(deviceId: string): Promise<void> {
  await redis.publish(
    MESSAGE_CHANNEL,
    JSON.stringify({ scope: "device.force_disconnect", deviceId })
  );
}

function normalizeRedisWsEnvelope(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const typedPayload = payload as { type?: unknown; version?: unknown };
  if (typeof typedPayload.type !== "string") {
    return payload;
  }

  if (
    typeof typedPayload.version === "number" &&
    typedPayload.version === WS_PROTOCOL_VERSION
  ) {
    return payload;
  }

  return withWireVersion(payload, WS_PROTOCOL_VERSION);
}
