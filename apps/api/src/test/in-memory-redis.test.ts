import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRedisSubscriber,
  hasRegisteredDeviceSocket,
  hasRegisteredUserSocket,
  MESSAGE_CHANNEL,
  publishForceDisconnect,
  publishMessage,
  publishPresenceUpdate,
  redis,
  registerDeviceSocket,
  touchDeviceSocket,
  unregisterDeviceSocket,
  getDeviceSocketId,
} from "../services/redis.js";

describe("in-memory redis client", () => {
  beforeEach(async () => {
    // Start from a clean key namespace per test.
    await redis.del(
      "t:str",
      "t:set",
      "t:hash",
      "t:ttl",
      "t:expire",
      "t:counter"
    );
  });

  afterEach(() => {
    // No shared subscriber state should leak between tests.
  });

  it("supports string operations with expiry and wrong-type errors", async () => {
    await expect(redis.ping()).resolves.toBe("PONG");
    await expect(redis.get("t:str")).resolves.toBeNull();

    await redis.setex("t:str", 60, "v1");
    await expect(redis.get("t:str")).resolves.toBe("v1");
    await expect(redis.ttl("t:str")).resolves.toBeGreaterThan(0);
    await expect(redis.ttl("t:missing")).resolves.toBe(-2);

    await redis.setex("t:counter", 60, "5");
    await expect(redis.incr("t:counter")).resolves.toBe(6);

    await expect(redis.expire("t:str", 120)).resolves.toBe(1);
    await expect(redis.expire("t:missing", 10)).resolves.toBe(0);

    // WRONGTYPE: using a string key as a set must fail loudly.
    await expect(redis.sadd("t:str", "x")).rejects.toThrow(/WRONGTYPE/);
    await expect(redis.hset("t:str", "f", "v")).rejects.toThrow(/WRONGTYPE/);

    await expect(redis.del("t:str", "t:absent")).resolves.toBe(1);
  });

  it("expires keys after their TTL has elapsed", async () => {
    await redis.setex("t:ttl", 1, "gone");
    // Simulate elapsing beyond the TTL by rewriting the entry with a past
    // expiry via expire(0): expiresAt = now, so a later read purges it.
    await redis.expire("t:ttl", 0);
    await new Promise((r) => setTimeout(r, 5));
    await expect(redis.get("t:ttl")).resolves.toBeNull();
  });

  it("supports set operations including empty-set cleanup", async () => {
    await expect(redis.sadd("t:set", "a")).resolves.toBe(1);
    await expect(redis.sadd("t:set", "a")).resolves.toBe(0);
    await expect(redis.sadd("t:set", "b")).resolves.toBe(1);
    await expect(redis.scard("t:set")).resolves.toBe(2);
    await expect(redis.sismember("t:set", "a")).resolves.toBe(1);
    await expect(redis.sismember("t:set", "z")).resolves.toBe(0);
    await expect(redis.smembers("t:set")).resolves.toEqual(
      expect.arrayContaining(["a", "b"])
    );
    await expect(redis.srem("t:set", "a")).resolves.toBe(1);
    await expect(redis.srem("t:set", "a")).resolves.toBe(0);
    await expect(redis.srem("t:set", "b")).resolves.toBe(1);
    // Emptying the set removes the key entirely.
    await expect(redis.scard("t:set")).resolves.toBe(0);
    await expect(redis.smembers("t:set")).resolves.toEqual([]);
    await expect(redis.srem("t:absent", "x")).resolves.toBe(0);
  });

  it("supports hash operations including empty-hash cleanup", async () => {
    await expect(redis.hset("t:hash", "f1", "v1")).resolves.toBe(1);
    await expect(redis.hset("t:hash", "f1", "v2")).resolves.toBe(0);
    await expect(redis.hset("t:hash", "f2", "v3")).resolves.toBe(1);
    await expect(redis.hvals("t:hash")).resolves.toEqual(
      expect.arrayContaining(["v2", "v3"])
    );
    await expect(redis.hgetall("t:hash")).resolves.toEqual({
      f1: "v2",
      f2: "v3",
    });
    await expect(redis.hdel("t:hash", "f1")).resolves.toBe(1);
    await expect(redis.hdel("t:hash", "f1")).resolves.toBe(0);
    await expect(redis.hdel("t:absent", "f")).resolves.toBe(0);
    await expect(redis.hdel("t:hash", "f2")).resolves.toBe(1);
    await expect(redis.hgetall("t:hash")).resolves.toEqual({});
  });

  it("publishes only to subscribed channels and unsubscribes cleanly", async () => {
    const subscriber = createRedisSubscriber();
    const received: Array<{ channel: string; payload: string }> = [];
    subscriber.on("message", (channel, payload) => {
      received.push({ channel, payload });
    });
    await subscriber.subscribe(MESSAGE_CHANNEL, "other:channel");

    // Delivered asynchronously via queueMicrotask.
    await publishMessage({ type: "presence.update", userId: "u1" });
    await new Promise((r) => setImmediate(r));
    expect(received.length).toBe(1);
    const first = received[0];
    if (!first) throw new Error("expected one presence message");
    expect(first.channel).toBe(MESSAGE_CHANNEL);
    const envelope = JSON.parse(first.payload) as { version?: number };
    // Messages without a wire version get the current protocol version stamped.
    expect(envelope.version).toBeDefined();

    // Non-object and non-ws payloads pass through untouched.
    await redis.publish(MESSAGE_CHANNEL, "raw");
    await new Promise((r) => setImmediate(r));
    expect(received.length).toBe(2);
    const second = received[1];
    if (!second) throw new Error("expected raw message");
    expect(second.payload).toBe("raw");

    await subscriber.unsubscribe(MESSAGE_CHANNEL);
    await publishMessage({ type: "presence.update", userId: "u2" });
    await new Promise((r) => setImmediate(r));
    expect(received.length).toBe(2);

    subscriber.disconnect();
  });

  it("publishes presence updates wrapped in a broadcast scope", async () => {
    const subscriber = createRedisSubscriber();
    const payloads: string[] = [];
    subscriber.on("message", (_channel, payload) => payloads.push(payload));
    await subscriber.subscribe(MESSAGE_CHANNEL);
    await publishPresenceUpdate({
      type: "presence.update",
      userId: "u1",
      online: true,
    });
    await new Promise((r) => setImmediate(r));
    expect(payloads.length).toBe(1);
    const presencePayload = payloads[0];
    if (!presencePayload) throw new Error("expected presence payload");
    const parsed = JSON.parse(presencePayload) as Record<string, unknown>;
    expect(parsed["scope"]).toBe("presence.broadcast");
    expect(parsed["type"]).toBe("presence.update");
    subscriber.disconnect();
  });

  it("publishes force-disconnect envelopes for a device", async () => {
    const subscriber = createRedisSubscriber();
    const payloads: string[] = [];
    subscriber.on("message", (_channel, payload) => payloads.push(payload));
    await subscriber.subscribe(MESSAGE_CHANNEL);
    await publishForceDisconnect("device-1");
    await new Promise((r) => setImmediate(r));
    expect(payloads.length).toBe(1);
    const disconnectPayload = payloads[0];
    if (!disconnectPayload) throw new Error("expected disconnect payload");
    const parsed = JSON.parse(disconnectPayload) as Record<string, unknown>;
    expect(parsed).toEqual({
      scope: "device.force_disconnect",
      deviceId: "device-1",
    });
    subscriber.disconnect();
  });

  it("tracks device/user socket registrations with TTL touch", async () => {
    await expect(hasRegisteredDeviceSocket("d-1")).resolves.toBe(false);
    await expect(hasRegisteredUserSocket("u-1")).resolves.toBe(false);

    await registerDeviceSocket("u-1", "d-1", "sock-a");
    await expect(hasRegisteredDeviceSocket("d-1")).resolves.toBe(true);
    await expect(hasRegisteredUserSocket("u-1")).resolves.toBe(true);
    await expect(getDeviceSocketId("d-1")).resolves.toBe("sock-a");

    await registerDeviceSocket("u-1", "d-1", "sock-b");
    await expect(getDeviceSocketId("d-1")).resolves.toBe("sock-a");

    // Touch must not lose the registrations.
    await touchDeviceSocket("u-1", "d-1");
    await expect(hasRegisteredDeviceSocket("d-1")).resolves.toBe(true);

    await unregisterDeviceSocket("u-1", "d-1", "sock-a");
    await expect(getDeviceSocketId("d-1")).resolves.toBe("sock-b");
    await unregisterDeviceSocket("u-1", "d-1", "sock-b");
    await expect(hasRegisteredDeviceSocket("d-1")).resolves.toBe(false);
    await expect(hasRegisteredUserSocket("u-1")).resolves.toBe(false);
    await expect(getDeviceSocketId("d-1")).resolves.toBeNull();
  });
});
