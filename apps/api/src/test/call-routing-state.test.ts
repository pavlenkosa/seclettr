import { beforeEach, describe, expect, it } from "vitest";
import {
  createCallSessionStore,
  createDirectCallLifecycleManager,
  type CallSession,
  type DirectCallAuthorityRecord,
  type DirectCallAuthorityStore,
} from "../services/call-routing-state.js";

class FakeRedis {
  private readonly values = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private readonly now: () => number) {}

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.values.set(key, {
      value,
      expiresAt: this.now() + seconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  setRaw(key: string, value: string, ttlSeconds = 3600): void {
    this.values.set(key, {
      value,
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }
}

class FakeAuthorityStore implements DirectCallAuthorityStore {
  private readonly records = new Map<string, DirectCallAuthorityRecord>();

  constructor(initialRecords: DirectCallAuthorityRecord[] = []) {
    for (const record of initialRecords) {
      this.records.set(record.id, { ...record });
    }
  }

  set(record: DirectCallAuthorityRecord): void {
    this.records.set(record.id, { ...record });
  }

  async get(callId: string): Promise<DirectCallAuthorityRecord | null> {
    const record = this.records.get(callId);
    return record ? { ...record } : null;
  }

  async transition<T>(
    callId: string,
    handler: (record: DirectCallAuthorityRecord | null) =>
      | Promise<{
          mutation?:
            | { type: "none" }
            | { type: "status"; status: DirectCallAuthorityRecord["status"] };
          result: T;
        }>
      | {
          mutation?:
            | { type: "none" }
            | { type: "status"; status: DirectCallAuthorityRecord["status"] };
          result: T;
        }
  ): Promise<T> {
    const current = await this.get(callId);
    const transition = await handler(current);
    if (current && transition.mutation?.type === "status") {
      this.records.set(callId, {
        ...current,
        status: transition.mutation.status,
      });
    }
    return transition.result;
  }
}

const CALL_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_SESSION: CallSession = {
  callerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  callerDeviceId: "22222222-2222-4222-8222-222222222222",
  calleeUserId: "33333333-3333-4333-8333-333333333333",
  calleeDeviceId: null,
  calleeDeviceIds: ["44444444-4444-4444-8444-444444444444"],
};

const ESTABLISHED_SESSION: CallSession = {
  ...SAMPLE_SESSION,
  calleeDeviceId: "55555555-5555-4555-8555-555555555555",
};

const DIRECT_CALL_RECORD: DirectCallAuthorityRecord = {
  id: CALL_ID,
  callerUserId: SAMPLE_SESSION.callerUserId,
  calleeUserId: SAMPLE_SESSION.calleeUserId,
  groupId: null,
  callType: "audio",
  status: "ringing",
};

describe("call routing state store", () => {
  let nowMs = 0;
  let redis: FakeRedis;

  beforeEach(() => {
    nowMs = 0;
    redis = new FakeRedis(() => nowMs);
  });

  it("hydrates call session state across store instances via redis", async () => {
    const storeA = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });
    const storeB = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await storeA.set(CALL_ID, SAMPLE_SESSION);

    await expect(storeB.get(CALL_ID)).resolves.toEqual(SAMPLE_SESSION);
  });

  it("keeps hot local cache available inside the TTL even after redis entry is gone", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await store.set(CALL_ID, SAMPLE_SESSION);
    await redis.del("ws:callSession:11111111-1111-4111-8111-111111111111");

    await expect(store.get(CALL_ID)).resolves.toEqual(SAMPLE_SESSION);
  });

  it("does not keep stale local cache after the TTL elapses", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await store.set(CALL_ID, SAMPLE_SESSION);
    await redis.del("ws:callSession:11111111-1111-4111-8111-111111111111");
    nowMs = 60_001;

    await expect(store.get(CALL_ID)).resolves.toBeNull();
  });

  it("drops malformed redis payloads instead of reviving invalid session state", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });
    redis.setRaw("ws:callSession:bad-call", '{"callerDeviceId":123}', 60);

    await expect(store.get("bad-call")).resolves.toBeNull();
    await expect(redis.get("ws:callSession:bad-call")).resolves.toBeNull();
  });

  it("indexes established direct calls by participant device ids", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await store.set(CALL_ID, ESTABLISHED_SESSION);

    await expect(
      store.listByDevice(ESTABLISHED_SESSION.callerDeviceId)
    ).resolves.toEqual([CALL_ID]);
    await expect(
      store.listByDevice(ESTABLISHED_SESSION.calleeDeviceId!)
    ).resolves.toEqual([CALL_ID]);
  });

  it("indexes ringing direct calls by invited callee devices for reconnect replay", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await store.set(CALL_ID, SAMPLE_SESSION);

    await expect(
      store.listByDevice(SAMPLE_SESSION.callerDeviceId)
    ).resolves.toEqual([CALL_ID]);
    await expect(
      store.listByDevice(SAMPLE_SESSION.calleeDeviceIds[0]!)
    ).resolves.toEqual([CALL_ID]);
  });

  it("updates device indexes when a ringing call becomes established", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await store.set(CALL_ID, SAMPLE_SESSION);
    await expect(
      store.listByDevice(SAMPLE_SESSION.callerDeviceId)
    ).resolves.toEqual([CALL_ID]);
    await expect(
      store.listByDevice("55555555-5555-4555-8555-555555555555")
    ).resolves.toEqual([]);

    await store.set(CALL_ID, ESTABLISHED_SESSION);

    await expect(
      store.listByDevice(ESTABLISHED_SESSION.callerDeviceId)
    ).resolves.toEqual([CALL_ID]);
    await expect(
      store.listByDevice(ESTABLISHED_SESSION.calleeDeviceId!)
    ).resolves.toEqual([CALL_ID]);
  });

  it("prunes stale device indexes when the indexed session payload is missing", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await store.set(CALL_ID, SAMPLE_SESSION);
    redis.setRaw(
      "ws:callSession:device:44444444-4444-4444-8444-444444444444",
      JSON.stringify([CALL_ID]),
      60
    );
    await redis.del("ws:callSession:11111111-1111-4111-8111-111111111111");
    const freshStore = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await expect(
      freshStore.listByDevice("44444444-4444-4444-8444-444444444444")
    ).resolves.toEqual([]);
    await expect(
      redis.get("ws:callSession:device:44444444-4444-4444-8444-444444444444")
    ).resolves.toBeNull();
  });

  it("removes device indexes when a call session is deleted", async () => {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });

    await store.set(CALL_ID, ESTABLISHED_SESSION);
    await store.delete(CALL_ID);

    await expect(
      store.listByDevice(ESTABLISHED_SESSION.callerDeviceId)
    ).resolves.toEqual([]);
    await expect(
      store.listByDevice(ESTABLISHED_SESSION.calleeDeviceId!)
    ).resolves.toEqual([]);
  });
});

describe("direct call lifecycle manager", () => {
  let nowMs = 0;
  let redis: FakeRedis;

  beforeEach(() => {
    nowMs = 0;
    redis = new FakeRedis(() => nowMs);
  });

  function createHarness(overrides?: {
    record?: DirectCallAuthorityRecord;
    deviceMap?: Record<string, string[]>;
  }) {
    const store = createCallSessionStore(redis, {
      ttlSeconds: 60,
      now: () => nowMs,
    });
    const authority = new FakeAuthorityStore([
      overrides?.record ?? DIRECT_CALL_RECORD,
    ]);
    const routed: Array<{
      deviceId: string;
      msg: { type: string; callId: string };
    }> = [];
    const deviceMap = overrides?.deviceMap ?? {
      [SAMPLE_SESSION.callerUserId]: [SAMPLE_SESSION.callerDeviceId],
      [SAMPLE_SESSION.calleeUserId]: [
        SAMPLE_SESSION.calleeDeviceIds[0]!,
        ESTABLISHED_SESSION.calleeDeviceId!,
      ],
    };
    const manager = createDirectCallLifecycleManager({
      authorityStore: authority,
      callSessionStore: store,
      loadUserDeviceIds: async (userId) => [...(deviceMap[userId] ?? [])],
      routeToDevice: async (deviceId, msg) => {
        routed.push({
          deviceId,
          msg: { type: msg.type, callId: "callId" in msg ? msg.callId : "" },
        });
      },
      routeToDevices: async (deviceIds, msg) => {
        for (const deviceId of deviceIds) {
          routed.push({
            deviceId,
            msg: { type: msg.type, callId: "callId" in msg ? msg.callId : "" },
          });
        }
      },
    });

    return { authority, manager, routed, store };
  }

  it("commits answer on the authoritative state machine and keeps hangup derived", async () => {
    const { authority, manager, routed, store } = createHarness();

    const offerResult = await manager.storeOffer({
      callId: CALL_ID,
      callerUserId: SAMPLE_SESSION.callerUserId,
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeUserId: SAMPLE_SESSION.calleeUserId,
      callerSupportsRenegotiationV1: true,
      offer: {
        callType: "audio",
        sdp: "offer-sdp",
      },
    });
    expect(offerResult.ok).toBe(true);

    const answerResult = await manager.acceptAnswer({
      callId: CALL_ID,
      actorUserId: SAMPLE_SESSION.calleeUserId,
      actorDeviceId: ESTABLISHED_SESSION.calleeDeviceId!,
      calleeSupportsRenegotiationV1: true,
      answeredMessage: {
        type: "call.answered",
        callId: CALL_ID,
        answererUserId: SAMPLE_SESSION.calleeUserId,
        answererDeviceId: ESTABLISHED_SESSION.calleeDeviceId!,
        targetUserId: SAMPLE_SESSION.callerUserId,
        sdp: "answer-sdp",
      },
    });
    expect(answerResult.ok).toBe(true);
    await expect(authority.get(CALL_ID)).resolves.toMatchObject({
      status: "active",
    });
    await expect(store.get(CALL_ID)).resolves.toMatchObject({
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeDeviceId: ESTABLISHED_SESSION.calleeDeviceId!,
      callerSupportsRenegotiationV1: true,
      calleeSupportsRenegotiationV1: true,
    });
    expect(routed).toEqual([
      {
        deviceId: SAMPLE_SESSION.callerDeviceId,
        msg: { type: "call.answered", callId: CALL_ID },
      },
      {
        deviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
        msg: { type: "call.hangup", callId: CALL_ID },
      },
    ]);

    routed.length = 0;
    const hangupResult = await manager.hangupCall({
      callId: CALL_ID,
      actorUserId: SAMPLE_SESSION.callerUserId,
      actorDeviceId: SAMPLE_SESSION.callerDeviceId,
    });
    expect(hangupResult).toMatchObject({
      ok: true,
      alreadyTerminal: false,
      resultingStatus: "ended",
      terminatedByRole: "caller",
    });
    await expect(authority.get(CALL_ID)).resolves.toMatchObject({
      status: "ended",
    });
    await expect(store.get(CALL_ID)).resolves.toBeNull();
    expect(routed).toEqual([
      {
        deviceId: ESTABLISHED_SESSION.calleeDeviceId!,
        msg: { type: "call.hangup", callId: CALL_ID },
      },
    ]);
  });

  it("marks unanswered call as missed when caller hangs up while ringing", async () => {
    const { authority, manager, routed, store } = createHarness();

    await manager.storeOffer({
      callId: CALL_ID,
      callerUserId: SAMPLE_SESSION.callerUserId,
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeUserId: SAMPLE_SESSION.calleeUserId,
      offer: {
        callType: "audio",
        sdp: "offer-sdp",
      },
    });

    const hangupResult = await manager.hangupCall({
      callId: CALL_ID,
      actorUserId: SAMPLE_SESSION.callerUserId,
      actorDeviceId: SAMPLE_SESSION.callerDeviceId,
    });
    expect(hangupResult).toMatchObject({
      ok: true,
      alreadyTerminal: false,
      resultingStatus: "missed",
      terminatedByRole: "caller",
    });
    await expect(authority.get(CALL_ID)).resolves.toMatchObject({
      status: "missed",
    });
    await expect(store.get(CALL_ID)).resolves.toBeNull();
    // both callee devices get a hangup (the harness maps calleeUserId to 2 devices)
    expect(routed.every((r) => r.msg.type === "call.hangup")).toBe(true);
    expect(routed.length).toBeGreaterThan(0);
  });

  it("moves ringing calls into rejected and keeps the rejection explicit", async () => {
    const { authority, manager, routed, store } = createHarness();

    await manager.storeOffer({
      callId: CALL_ID,
      callerUserId: SAMPLE_SESSION.callerUserId,
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeUserId: SAMPLE_SESSION.calleeUserId,
      offer: {
        callType: "audio",
        sdp: "offer-sdp",
      },
    });

    const rejectResult = await manager.rejectCall({
      callId: CALL_ID,
      actorUserId: SAMPLE_SESSION.calleeUserId,
      actorDeviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
    });
    expect(rejectResult).toMatchObject({
      ok: true,
      alreadyTerminal: false,
      resultingStatus: "rejected",
      terminatedByRole: "callee",
    });
    await expect(authority.get(CALL_ID)).resolves.toMatchObject({
      status: "rejected",
    });
    await expect(store.get(CALL_ID)).resolves.toBeNull();
    expect(routed).toEqual([
      {
        deviceId: SAMPLE_SESSION.callerDeviceId,
        msg: { type: "call.rejected", callId: CALL_ID },
      },
      {
        deviceId: ESTABLISHED_SESSION.calleeDeviceId!,
        msg: { type: "call.hangup", callId: CALL_ID },
      },
    ]);
  });

  it("reconciles missing transport before answer into missed instead of drifting", async () => {
    const { authority, manager, store } = createHarness();

    await manager.storeOffer({
      callId: CALL_ID,
      callerUserId: SAMPLE_SESSION.callerUserId,
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeUserId: SAMPLE_SESSION.calleeUserId,
      offer: {
        callType: "audio",
        sdp: "offer-sdp",
      },
    });
    await store.delete(CALL_ID);

    const answerResult = await manager.acceptAnswer({
      callId: CALL_ID,
      actorUserId: SAMPLE_SESSION.calleeUserId,
      actorDeviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
      answeredMessage: {
        type: "call.answered",
        callId: CALL_ID,
        answererUserId: SAMPLE_SESSION.calleeUserId,
        answererDeviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
        targetUserId: SAMPLE_SESSION.callerUserId,
        sdp: "answer-sdp",
      },
    });
    expect(answerResult).toEqual({
      ok: false,
      reason: "transport_missing",
      reconciledStatus: "missed",
    });
    await expect(authority.get(CALL_ID)).resolves.toMatchObject({
      status: "missed",
    });
  });

  it("keeps invited-device reconnect replay for ringing calls and skips disconnect cleanup for non-selected callees", async () => {
    const { authority, manager, routed } = createHarness();

    await manager.storeOffer({
      callId: CALL_ID,
      callerUserId: SAMPLE_SESSION.callerUserId,
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeUserId: SAMPLE_SESSION.calleeUserId,
      offer: {
        callType: "audio",
        sdp: "offer-sdp",
      },
    });

    await expect(
      manager.cleanupDisconnectedDevice({
        deviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
      })
    ).resolves.toEqual([]);
    await expect(authority.get(CALL_ID)).resolves.toMatchObject({
      status: "ringing",
    });

    const replayed = await manager.replayPendingOffers({
      deviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
    });
    expect(replayed).toEqual([
      {
        callId: CALL_ID,
        callerDeviceId: SAMPLE_SESSION.callerDeviceId,
        calleeDeviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
      },
    ]);
    expect(routed).toContainEqual({
      deviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
      msg: { type: "call.offer", callId: CALL_ID },
    });
  });

  it("marks ringing caller disconnect timeout as missed and notifies callees", async () => {
    const { authority, manager, routed, store } = createHarness();

    await manager.storeOffer({
      callId: CALL_ID,
      callerUserId: SAMPLE_SESSION.callerUserId,
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeUserId: SAMPLE_SESSION.calleeUserId,
      offer: {
        callType: "audio",
        sdp: "offer-sdp",
      },
    });

    const cleanupResults = await manager.cleanupDisconnectedDevice({
      deviceId: SAMPLE_SESSION.callerDeviceId,
    });
    expect(cleanupResults).toEqual([
      {
        callId: CALL_ID,
        resultingStatus: "missed",
        terminatedByRole: "caller",
        notifiedDeviceIds: [
          SAMPLE_SESSION.calleeDeviceIds[0]!,
          ESTABLISHED_SESSION.calleeDeviceId!,
        ],
      },
    ]);
    await expect(authority.get(CALL_ID)).resolves.toMatchObject({
      status: "missed",
    });
    await expect(store.get(CALL_ID)).resolves.toBeNull();
    expect(routed).toEqual([
      {
        deviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
        msg: { type: "call.hangup", callId: CALL_ID },
      },
      {
        deviceId: ESTABLISHED_SESSION.calleeDeviceId!,
        msg: { type: "call.hangup", callId: CALL_ID },
      },
    ]);
  });

  it("cleans stale transport cache when authority has already ended the call", async () => {
    const { authority, manager, store } = createHarness();

    await manager.storeOffer({
      callId: CALL_ID,
      callerUserId: SAMPLE_SESSION.callerUserId,
      callerDeviceId: SAMPLE_SESSION.callerDeviceId,
      calleeUserId: SAMPLE_SESSION.calleeUserId,
      offer: {
        callType: "audio",
        sdp: "offer-sdp",
      },
    });

    authority.set({
      ...DIRECT_CALL_RECORD,
      status: "ended",
    });

    await expect(
      manager.replayPendingOffers({
        deviceId: SAMPLE_SESSION.calleeDeviceIds[0]!,
      })
    ).resolves.toEqual([]);
    await expect(store.get(CALL_ID)).resolves.toBeNull();
    await expect(
      store.listByDevice(SAMPLE_SESSION.calleeDeviceIds[0]!)
    ).resolves.toEqual([]);
  });
});
