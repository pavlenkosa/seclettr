import type { WsClientMessage, WsServerMessage } from "@seclettr/protocol";
import type { QueryResultRow } from "pg";
import { query, transaction, type PoolClient } from "../db/pool.js";

type DirectCallOfferAuth = Extract<
  WsClientMessage,
  { type: "call.offer" }
>["auth"];
type DirectCallOfferMediaEncryption = Extract<
  WsClientMessage,
  { type: "call.offer" }
>["mediaEncryption"];
type DirectCallOfferFeatures = Extract<
  WsClientMessage,
  { type: "call.offer" }
>["features"];
type DirectCallType = Extract<
  WsClientMessage,
  { type: "call.offer" }
>["callType"];

type DirectCallAnsweredMessage = Extract<
  WsServerMessage,
  { type: "call.answered" }
>;
type DirectCallHangupMessage = Extract<
  WsServerMessage,
  { type: "call.hangup" }
>;
type DirectCallOfferMessage = Extract<WsServerMessage, { type: "call.offer" }>;
type DirectCallRejectedMessage = Extract<
  WsServerMessage,
  { type: "call.rejected" }
>;

export type DirectCallLifecycleStatus =
  | "ringing"
  | "active"
  | "ended"
  | "missed"
  | "rejected";

type DirectCallTransitionMutation =
  | { type: "none" }
  | { type: "status"; status: DirectCallLifecycleStatus };

interface DirectCallAuthorityTransition<T> {
  mutation?: DirectCallTransitionMutation;
  result: T;
}

export interface PendingDirectCallOffer {
  callType: DirectCallType;
  sdp: string;
  auth?: DirectCallOfferAuth;
  mediaEncryption?: DirectCallOfferMediaEncryption;
  features?: DirectCallOfferFeatures;
}

export interface CallSession {
  callerUserId: string;
  callerDeviceId: string;
  calleeUserId: string;
  calleeDeviceId: string | null;
  calleeDeviceIds: string[];
  callerSupportsRenegotiationV1?: boolean;
  calleeSupportsRenegotiationV1?: boolean;
  offer?: PendingDirectCallOffer;
}

export interface CallRoutingStateRedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface CallSessionStore {
  set(callId: string, session: CallSession): Promise<void>;
  get(callId: string): Promise<CallSession | null>;
  listByDevice(deviceId: string): Promise<string[]>;
  delete(callId: string): Promise<void>;
}

export interface DirectCallAuthorityRecord {
  id: string;
  callerUserId: string;
  calleeUserId: string | null;
  groupId: string | null;
  callType: DirectCallType;
  status: DirectCallLifecycleStatus;
}

export interface DirectCallAuthorityStore {
  get(callId: string): Promise<DirectCallAuthorityRecord | null>;
  transition<T>(
    callId: string,
    handler: (
      record: DirectCallAuthorityRecord | null
    ) =>
      | Promise<DirectCallAuthorityTransition<T>>
      | DirectCallAuthorityTransition<T>
  ): Promise<T>;
}

type DirectCallRouteToDevice = (
  deviceId: string,
  msg: WsServerMessage
) => Promise<void>;
type DirectCallRouteToDevices = (
  deviceIds: string[],
  msg: WsServerMessage
) => Promise<void>;
type LoadUserDeviceIds = (userId: string) => Promise<string[]>;
type PendingOfferReplay = {
  callId: string;
  callerDeviceId: string;
  calleeDeviceId: string;
};
type PendingOfferReplayCandidate = PendingOfferReplay & {
  offer: DirectCallOfferMessage;
};

function buildReplayableOffer(
  callId: string,
  session: CallSession & { offer: PendingDirectCallOffer }
): DirectCallOfferMessage {
  return {
    type: "call.offer",
    callId,
    callerUserId: session.callerUserId,
    callerDeviceId: session.callerDeviceId,
    targetUserId: session.calleeUserId,
    sdp: session.offer.sdp,
    callType: session.offer.callType,
    ...(session.offer.mediaEncryption
      ? { mediaEncryption: session.offer.mediaEncryption }
      : {}),
    ...(session.offer.features ? { features: session.offer.features } : {}),
    ...(session.offer.auth ? { auth: session.offer.auth } : {}),
  };
}

export interface DirectCallLifecycleManager {
  loadAuthoritativeSession(params: {
    callId: string;
    allowedStatuses: DirectCallLifecycleStatus[];
  }): Promise<LoadAuthoritativeSessionResult>;
  storeOffer(params: {
    callId: string;
    callerUserId: string;
    callerDeviceId: string;
    calleeUserId: string;
    callerSupportsRenegotiationV1?: boolean;
    offer: PendingDirectCallOffer;
  }): Promise<StoreOfferResult>;
  acceptAnswer(params: {
    callId: string;
    actorUserId: string;
    actorDeviceId: string;
    calleeSupportsRenegotiationV1?: boolean;
    answeredMessage: DirectCallAnsweredMessage;
  }): Promise<AcceptAnswerResult>;
  rejectCall(params: {
    callId: string;
    actorUserId: string;
    actorDeviceId: string;
  }): Promise<RejectCallResult>;
  hangupCall(params: {
    callId: string;
    actorUserId: string;
    actorDeviceId?: string | null;
  }): Promise<HangupCallResult>;
  cleanupDisconnectedDevice(params: { deviceId: string }): Promise<
    Array<{
      callId: string;
      resultingStatus: "ended" | "missed";
      terminatedByRole: "caller" | "callee";
      notifiedDeviceIds: string[];
    }>
  >;
  replayPendingOffers(params: {
    deviceId: string;
  }): Promise<
    Array<{ callId: string; callerDeviceId: string; calleeDeviceId: string }>
  >;
}

interface CachedCallSession {
  session: CallSession;
  expiresAt: number;
}

interface CachedDeviceCallIndex {
  callIds: string[];
  expiresAt: number;
}

interface CallSessionStoreOptions {
  prefix?: string;
  ttlSeconds?: number;
  now?: () => number;
}

interface DirectCallLifecycleManagerDeps {
  authorityStore?: DirectCallAuthorityStore;
  callSessionStore: CallSessionStore;
  loadUserDeviceIds: LoadUserDeviceIds;
  routeToDevice: DirectCallRouteToDevice;
  routeToDevices: DirectCallRouteToDevices;
}

type LoadAuthoritativeSessionResult =
  | { ok: false; reason: "not_found" | "state_conflict" | "transport_missing" }
  | { ok: true; record: DirectCallAuthorityRecord; session: CallSession };

type StoreOfferResult =
  | { ok: false; reason: "not_found" | "forbidden" | "state_conflict" }
  | { ok: true; session: CallSession; calleeDeviceIds: string[] };

type AcceptAnswerResult =
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "state_conflict"
        | "transport_missing";
      reconciledStatus?: "missed";
    }
  | { ok: true; session: CallSession; siblingHangupDeviceIds: string[] };

type RejectCallAlreadyTerminalResult = {
  ok: true;
  alreadyTerminal: true;
  resultingStatus: "rejected";
  terminatedByRole: "callee";
  notifiedDeviceIds: string[];
};

type RejectCallCommittedResult = {
  ok: true;
  alreadyTerminal: false;
  resultingStatus: "rejected";
  terminatedByRole: "callee";
  notifiedDeviceIds: string[];
};

type RejectCallResult =
  | { ok: false; reason: "not_found" | "forbidden" }
  | RejectCallAlreadyTerminalResult
  | RejectCallCommittedResult;

type RejectCallTransitionResult =
  | Extract<RejectCallResult, { ok: false }>
  | RejectCallAlreadyTerminalResult
  | {
      ok: true;
      alreadyTerminal: false;
      resultingStatus: "rejected";
      terminatedByRole: "callee";
      callerTargetDeviceIds: string[];
      siblingDeviceIds: string[];
    };

type HangupCallAlreadyTerminalResult = {
  ok: true;
  alreadyTerminal: true;
  resultingStatus: "ended" | "missed";
  terminatedByRole: "caller" | "callee";
  notifiedDeviceIds: string[];
};

type HangupCallCommittedResult = {
  ok: true;
  alreadyTerminal: false;
  resultingStatus: "ended" | "missed";
  terminatedByRole: "caller" | "callee";
  notifiedDeviceIds: string[];
};

type HangupCallResult =
  | { ok: false; reason: "not_found" | "forbidden" }
  | HangupCallAlreadyTerminalResult
  | HangupCallCommittedResult;

type HangupCallTransitionResult =
  | Extract<HangupCallResult, { ok: false }>
  | HangupCallAlreadyTerminalResult
  | {
      ok: true;
      alreadyTerminal: false;
      resultingStatus: "ended" | "missed";
      terminatedByRole: "caller" | "callee";
      targetDeviceIds: string[];
    };

type DisconnectCleanupTransitionResult = null | {
  callId: string;
  resultingStatus: "ended" | "missed";
  terminatedByRole: "caller" | "callee";
  targetDeviceIds: string[];
};

type DbCallSessionRow = {
  id: string;
  caller_user_id: string;
  callee_user_id: string | null;
  group_id: string | null;
  call_type: DirectCallType;
  status: DirectCallLifecycleStatus;
};

const DEFAULT_REDIS_PREFIX = "ws:callSession:";
const DEFAULT_TTL_SECONDS = 60 * 60;
const DEVICE_INDEX_SUFFIX = "device:";

function uniqueDeviceIds(deviceIds: string[]): string[] {
  return [...new Set(deviceIds)];
}

function buildHangupMessage(callId: string): DirectCallHangupMessage {
  return {
    type: "call.hangup",
    callId,
  };
}

function buildRejectedMessage(callId: string): DirectCallRejectedMessage {
  return {
    type: "call.rejected",
    callId,
  };
}

function collectSessionParticipantDeviceIds(session: CallSession): string[] {
  return uniqueDeviceIds([
    session.callerDeviceId,
    ...(session.calleeDeviceId
      ? [session.calleeDeviceId]
      : session.calleeDeviceIds),
  ]);
}

function mapDbCallSessionRow(row: DbCallSessionRow): DirectCallAuthorityRecord {
  return {
    id: row.id,
    callerUserId: row.caller_user_id,
    calleeUserId: row.callee_user_id,
    groupId: row.group_id,
    callType: row.call_type,
    status: row.status,
  };
}

function isSupportedDirectCallMediaEncryptionMode(value: unknown): boolean {
  return value === "transport" || value === "frame-v1";
}

function isCallSignalAuth(
  value: unknown
): value is NonNullable<DirectCallOfferAuth> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    version?: unknown;
    senderUserId?: unknown;
    senderDeviceId?: unknown;
    recipientUserId?: unknown;
    signedAt?: unknown;
    sdpHash?: unknown;
    signature?: unknown;
  };
  return (
    candidate.version === 1 &&
    typeof candidate.senderUserId === "string" &&
    typeof candidate.senderDeviceId === "string" &&
    typeof candidate.recipientUserId === "string" &&
    typeof candidate.signedAt === "string" &&
    typeof candidate.sdpHash === "string" &&
    typeof candidate.signature === "string"
  );
}

function isDirectCallMediaEncryptionOffer(
  value: unknown
): value is NonNullable<DirectCallOfferMediaEncryption> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    preferredMode?: unknown;
    supportedModes?: unknown;
  };
  return (
    isSupportedDirectCallMediaEncryptionMode(candidate.preferredMode) &&
    Array.isArray(candidate.supportedModes) &&
    candidate.supportedModes.length > 0 &&
    candidate.supportedModes.every(isSupportedDirectCallMediaEncryptionMode)
  );
}

function isDirectCallFeatures(
  value: unknown
): value is NonNullable<DirectCallOfferFeatures> {
  if (!value || typeof value !== "object") return false;
  return (value as { renegotiationV1?: unknown }).renegotiationV1 === true;
}

function isPendingDirectCallOffer(
  value: unknown
): value is PendingDirectCallOffer {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    callType?: unknown;
    sdp?: unknown;
    auth?: unknown;
    mediaEncryption?: unknown;
    features?: unknown;
  };
  return (
    (candidate.callType === "audio" || candidate.callType === "video") &&
    typeof candidate.sdp === "string" &&
    (candidate.auth === undefined || isCallSignalAuth(candidate.auth)) &&
    (candidate.mediaEncryption === undefined ||
      isDirectCallMediaEncryptionOffer(candidate.mediaEncryption)) &&
    (candidate.features === undefined ||
      isDirectCallFeatures(candidate.features))
  );
}

function isCallSession(value: unknown): value is CallSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CallSession>;
  return (
    typeof candidate.callerUserId === "string" &&
    typeof candidate.callerDeviceId === "string" &&
    typeof candidate.calleeUserId === "string" &&
    (candidate.calleeDeviceId === null ||
      typeof candidate.calleeDeviceId === "string") &&
    Array.isArray(candidate.calleeDeviceIds) &&
    candidate.calleeDeviceIds.every(
      (deviceId) => typeof deviceId === "string"
    ) &&
    (candidate.callerSupportsRenegotiationV1 === undefined ||
      candidate.callerSupportsRenegotiationV1 === true) &&
    (candidate.calleeSupportsRenegotiationV1 === undefined ||
      candidate.calleeSupportsRenegotiationV1 === true) &&
    (candidate.offer === undefined || isPendingDirectCallOffer(candidate.offer))
  );
}

function isDirectCallRecord(
  record: DirectCallAuthorityRecord | null
): record is DirectCallAuthorityRecord & {
  calleeUserId: string;
  groupId: null;
} {
  return (
    record !== null &&
    record.groupId === null &&
    typeof record.calleeUserId === "string"
  );
}

function isTerminalDirectCallStatus(
  status: DirectCallLifecycleStatus
): boolean {
  return status === "ended" || status === "missed" || status === "rejected";
}

function isSessionCompatibleWithRecord(
  record: DirectCallAuthorityRecord & { calleeUserId: string; groupId: null },
  session: CallSession
): boolean {
  return (
    session.callerUserId === record.callerUserId &&
    session.calleeUserId === record.calleeUserId &&
    (session.offer === undefined || session.offer.callType === record.callType)
  );
}

async function queryClient<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[]
): Promise<T[]> {
  const result = await client.query<T>(text, values);
  return result.rows;
}

async function loadAuthorityRecord(
  callId: string
): Promise<DirectCallAuthorityRecord | null> {
  const rows = await query<DbCallSessionRow>(
    `SELECT id, caller_user_id, callee_user_id, group_id, call_type, status
     FROM call_sessions
     WHERE id = $1`,
    [callId]
  );
  const row = rows[0];
  return row ? mapDbCallSessionRow(row) : null;
}

async function loadAuthorityRecordForUpdate(
  client: PoolClient,
  callId: string
): Promise<DirectCallAuthorityRecord | null> {
  const rows = await queryClient<DbCallSessionRow>(
    client,
    `SELECT id, caller_user_id, callee_user_id, group_id, call_type, status
     FROM call_sessions
     WHERE id = $1
     FOR UPDATE`,
    [callId]
  );
  const row = rows[0];
  return row ? mapDbCallSessionRow(row) : null;
}

async function persistAuthorityStatus(
  client: PoolClient,
  callId: string,
  status: DirectCallLifecycleStatus
): Promise<void> {
  await client.query(
    `UPDATE call_sessions
     SET status = $1,
         answered_at = CASE
           WHEN $1 = 'active' AND answered_at IS NULL THEN now()
           ELSE answered_at
         END,
         ended_at = CASE
           WHEN $1 IN ('ended', 'missed', 'rejected') AND ended_at IS NULL THEN now()
           ELSE ended_at
         END
     WHERE id = $2`,
    [status, callId]
  );
}

export function createDbBackedDirectCallAuthorityStore(): DirectCallAuthorityStore {
  return {
    async get(callId: string): Promise<DirectCallAuthorityRecord | null> {
      return loadAuthorityRecord(callId);
    },

    async transition<T>(
      callId: string,
      handler: (
        record: DirectCallAuthorityRecord | null
      ) =>
        | Promise<DirectCallAuthorityTransition<T>>
        | DirectCallAuthorityTransition<T>
    ): Promise<T> {
      return transaction(async (client) => {
        const record = await loadAuthorityRecordForUpdate(client, callId);
        const transition = await handler(record);
        const mutation = transition.mutation ?? { type: "none" };
        if (
          mutation.type === "status" &&
          record &&
          record.status !== mutation.status
        ) {
          await persistAuthorityStatus(client, callId, mutation.status);
        }
        return transition.result;
      });
    },
  };
}

export function createCallSessionStore(
  redis: CallRoutingStateRedisClient,
  options: CallSessionStoreOptions = {}
): CallSessionStore {
  const prefix = options.prefix ?? DEFAULT_REDIS_PREFIX;
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = options.now ?? Date.now;
  const ttlMs = ttlSeconds * 1000;
  const cache = new Map<string, CachedCallSession>();
  const deviceIndexCache = new Map<string, CachedDeviceCallIndex>();

  function getRedisKey(callId: string): string {
    return `${prefix}${callId}`;
  }

  function getDeviceIndexRedisKey(deviceId: string): string {
    return `${prefix}${DEVICE_INDEX_SUFFIX}${deviceId}`;
  }

  function setLocal(callId: string, session: CallSession): void {
    cache.set(callId, {
      session,
      expiresAt: now() + ttlMs,
    });
  }

  function setLocalDeviceIndex(deviceId: string, callIds: string[]): void {
    if (callIds.length === 0) {
      deviceIndexCache.delete(deviceId);
      return;
    }
    deviceIndexCache.set(deviceId, {
      callIds,
      expiresAt: now() + ttlMs,
    });
  }

  function getLocal(callId: string): CallSession | null {
    const cached = cache.get(callId);
    if (!cached) return null;
    if (cached.expiresAt <= now()) {
      cache.delete(callId);
      return null;
    }
    return cached.session;
  }

  function getLocalDeviceIndex(deviceId: string): string[] | null {
    const cached = deviceIndexCache.get(deviceId);
    if (!cached) return null;
    if (cached.expiresAt <= now()) {
      deviceIndexCache.delete(deviceId);
      return null;
    }
    return cached.callIds;
  }

  async function readDeviceIndex(deviceId: string): Promise<string[]> {
    const local = getLocalDeviceIndex(deviceId);
    if (local) return local;

    const raw = await redis.get(getDeviceIndexRedisKey(deviceId));
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        !Array.isArray(parsed) ||
        parsed.some((callId) => typeof callId !== "string")
      ) {
        await redis.del(getDeviceIndexRedisKey(deviceId));
        return [];
      }
      const callIds = uniqueDeviceIds(parsed);
      setLocalDeviceIndex(deviceId, callIds);
      return callIds;
    } catch {
      await redis.del(getDeviceIndexRedisKey(deviceId));
      return [];
    }
  }

  async function writeDeviceIndex(
    deviceId: string,
    callIds: string[]
  ): Promise<void> {
    const uniqueCallIds = uniqueDeviceIds(callIds);
    if (uniqueCallIds.length === 0) {
      setLocalDeviceIndex(deviceId, []);
      await redis.del(getDeviceIndexRedisKey(deviceId));
      return;
    }

    setLocalDeviceIndex(deviceId, uniqueCallIds);
    await redis.setex(
      getDeviceIndexRedisKey(deviceId),
      ttlSeconds,
      JSON.stringify(uniqueCallIds)
    );
  }

  async function updateDeviceIndexes(
    callId: string,
    previousSession: CallSession | null,
    nextSession: CallSession | null
  ): Promise<void> {
    const previousDeviceIds = previousSession
      ? collectSessionParticipantDeviceIds(previousSession)
      : [];
    const nextDeviceIds = nextSession
      ? collectSessionParticipantDeviceIds(nextSession)
      : [];
    const allDeviceIds = uniqueDeviceIds([
      ...previousDeviceIds,
      ...nextDeviceIds,
    ]);

    await Promise.all(
      allDeviceIds.map(async (deviceId) => {
        const existingCallIds = await readDeviceIndex(deviceId);
        const nextCallIds = existingCallIds.filter(
          (existingCallId) => existingCallId !== callId
        );
        if (nextDeviceIds.includes(deviceId)) {
          nextCallIds.push(callId);
        }
        await writeDeviceIndex(deviceId, nextCallIds);
      })
    );
  }

  async function getSession(callId: string): Promise<CallSession | null> {
    const local = getLocal(callId);
    if (local) return local;

    const raw = await redis.get(getRedisKey(callId));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isCallSession(parsed)) {
        await redis.del(getRedisKey(callId));
        return null;
      }

      setLocal(callId, parsed);
      return parsed;
    } catch {
      await redis.del(getRedisKey(callId));
      return null;
    }
  }

  return {
    async set(callId: string, session: CallSession): Promise<void> {
      const previous = await getSession(callId);
      await updateDeviceIndexes(callId, previous, session);
      setLocal(callId, session);
      await redis.setex(
        getRedisKey(callId),
        ttlSeconds,
        JSON.stringify(session)
      );
    },

    async get(callId: string): Promise<CallSession | null> {
      return getSession(callId);
    },

    async listByDevice(deviceId: string): Promise<string[]> {
      const indexedCallIds = await readDeviceIndex(deviceId);
      if (indexedCallIds.length === 0) return [];

      const validCallIds: string[] = [];
      let mutated = false;

      for (const callId of indexedCallIds) {
        const session = await getSession(callId);
        if (!session) {
          mutated = true;
          continue;
        }
        if (!collectSessionParticipantDeviceIds(session).includes(deviceId)) {
          mutated = true;
          continue;
        }
        validCallIds.push(callId);
      }

      if (mutated) {
        await writeDeviceIndex(deviceId, validCallIds);
      }

      return validCallIds;
    },

    async delete(callId: string): Promise<void> {
      const previous = await getSession(callId);
      await updateDeviceIndexes(callId, previous, null);
      cache.delete(callId);
      await redis.del(getRedisKey(callId));
    },
  };
}

export function createDirectCallLifecycleManager(
  deps: DirectCallLifecycleManagerDeps
): DirectCallLifecycleManager {
  const authorityStore =
    deps.authorityStore ?? createDbBackedDirectCallAuthorityStore();

  async function clearDerivedTransportState(callId: string): Promise<void> {
    await deps.callSessionStore.delete(callId);
  }

  async function loadCompatibleSession(
    record: DirectCallAuthorityRecord & { calleeUserId: string; groupId: null },
    callId: string
  ): Promise<CallSession | null> {
    const session = await deps.callSessionStore.get(callId);
    if (!session) return null;
    if (!isSessionCompatibleWithRecord(record, session)) {
      await clearDerivedTransportState(callId);
      return null;
    }
    return session;
  }

  async function resolveCallerTargetDeviceIds(
    record: DirectCallAuthorityRecord & { calleeUserId: string; groupId: null },
    session: CallSession | null
  ): Promise<string[]> {
    if (session?.callerDeviceId) {
      return [session.callerDeviceId];
    }
    return uniqueDeviceIds(await deps.loadUserDeviceIds(record.callerUserId));
  }

  async function resolveCalleeTargetDeviceIds(
    record: DirectCallAuthorityRecord & { calleeUserId: string; groupId: null },
    session: CallSession | null
  ): Promise<string[]> {
    if (session?.calleeDeviceId) {
      return [session.calleeDeviceId];
    }
    if (session?.calleeDeviceIds.length) {
      return uniqueDeviceIds(session.calleeDeviceIds);
    }
    return uniqueDeviceIds(await deps.loadUserDeviceIds(record.calleeUserId));
  }

  async function resolveDeviceRole(
    record: DirectCallAuthorityRecord & { calleeUserId: string; groupId: null },
    deviceId: string
  ): Promise<"caller" | "callee" | null> {
    const [callerDeviceIds, calleeDeviceIds] = await Promise.all([
      deps.loadUserDeviceIds(record.callerUserId),
      deps.loadUserDeviceIds(record.calleeUserId),
    ]);
    if (callerDeviceIds.includes(deviceId)) {
      return "caller";
    }
    if (calleeDeviceIds.includes(deviceId)) {
      return "callee";
    }
    return null;
  }

  async function notifyDeviceIds(
    deviceIds: string[],
    message: WsServerMessage
  ): Promise<string[]> {
    const targets = uniqueDeviceIds(deviceIds);
    if (targets.length === 0) return [];
    if (targets.length === 1) {
      await deps.routeToDevice(targets[0]!, message);
      return targets;
    }
    await deps.routeToDevices(targets, message);
    return targets;
  }

  async function loadPendingOfferReplayCandidate(
    callId: string,
    deviceId: string
  ): Promise<PendingOfferReplayCandidate | null> {
    const record = await authorityStore.get(callId);
    if (!isDirectCallRecord(record) || record.status !== "ringing") {
      await clearDerivedTransportState(callId);
      return null;
    }

    const session = await loadCompatibleSession(record, callId);
    if (!session?.offer) return null;

    if (session.calleeDeviceId) {
      await clearDerivedTransportState(callId);
      return null;
    }

    if (
      !session.calleeDeviceIds.includes(deviceId) ||
      session.callerDeviceId === deviceId
    ) {
      return null;
    }

    return {
      callId,
      callerDeviceId: session.callerDeviceId,
      calleeDeviceId: deviceId,
      offer: buildReplayableOffer(
        callId,
        session as CallSession & { offer: PendingDirectCallOffer }
      ),
    };
  }

  return {
    async loadAuthoritativeSession(params) {
      const record = await authorityStore.get(params.callId);
      if (!isDirectCallRecord(record)) {
        await clearDerivedTransportState(params.callId);
        return { ok: false as const, reason: "not_found" as const };
      }
      if (!params.allowedStatuses.includes(record.status)) {
        if (isTerminalDirectCallStatus(record.status)) {
          await clearDerivedTransportState(params.callId);
        }
        return { ok: false as const, reason: "state_conflict" as const };
      }
      const session = await loadCompatibleSession(record, params.callId);
      if (!session) {
        return { ok: false as const, reason: "transport_missing" as const };
      }
      return {
        ok: true as const,
        record,
        session,
      };
    },

    async storeOffer(params) {
      const record = await authorityStore.get(params.callId);
      if (!isDirectCallRecord(record)) {
        await clearDerivedTransportState(params.callId);
        return { ok: false as const, reason: "not_found" as const };
      }
      if (
        record.callerUserId !== params.callerUserId ||
        record.calleeUserId !== params.calleeUserId
      ) {
        await clearDerivedTransportState(params.callId);
        return { ok: false as const, reason: "forbidden" as const };
      }
      if (
        record.status !== "ringing" ||
        record.callType !== params.offer.callType
      ) {
        if (isTerminalDirectCallStatus(record.status)) {
          await clearDerivedTransportState(params.callId);
        }
        return { ok: false as const, reason: "state_conflict" as const };
      }

      const calleeDeviceIds = uniqueDeviceIds(
        await deps.loadUserDeviceIds(params.calleeUserId)
      );
      const session: CallSession = {
        callerUserId: params.callerUserId,
        callerDeviceId: params.callerDeviceId,
        calleeUserId: params.calleeUserId,
        calleeDeviceId: null,
        calleeDeviceIds,
        ...(params.callerSupportsRenegotiationV1 === true
          ? { callerSupportsRenegotiationV1: true as const }
          : {}),
        offer: params.offer,
      };

      await deps.callSessionStore.set(params.callId, session);

      return {
        ok: true as const,
        session,
        calleeDeviceIds,
      };
    },

    async acceptAnswer(params) {
      const transitionResult =
        await authorityStore.transition<AcceptAnswerResult>(
          params.callId,
          async (record) => {
            if (!isDirectCallRecord(record)) {
              return {
                result: { ok: false as const, reason: "not_found" as const },
              };
            }
            if (record.calleeUserId !== params.actorUserId) {
              return {
                result: { ok: false as const, reason: "forbidden" as const },
              };
            }
            if (record.status !== "ringing") {
              return {
                result: {
                  ok: false as const,
                  reason: "state_conflict" as const,
                },
              };
            }

            const session = await loadCompatibleSession(record, params.callId);
            if (!session?.offer) {
              return {
                mutation: {
                  type: "status" as const,
                  status: "missed" as const,
                },
                result: {
                  ok: false as const,
                  reason: "transport_missing" as const,
                  reconciledStatus: "missed" as const,
                },
              };
            }

            if (
              session.calleeDeviceId &&
              session.calleeDeviceId !== params.actorDeviceId
            ) {
              return {
                result: { ok: false as const, reason: "forbidden" as const },
              };
            }

            if (!session.calleeDeviceIds.includes(params.actorDeviceId)) {
              return {
                result: { ok: false as const, reason: "forbidden" as const },
              };
            }

            const nextSession: CallSession = {
              ...session,
              calleeDeviceId: params.actorDeviceId,
              ...(params.calleeSupportsRenegotiationV1 === true
                ? { calleeSupportsRenegotiationV1: true as const }
                : {}),
            };

            return {
              mutation: { type: "status" as const, status: "active" as const },
              result: {
                ok: true as const,
                session: nextSession,
                siblingHangupDeviceIds: session.calleeDeviceIds.filter(
                  (deviceId) => deviceId !== params.actorDeviceId
                ),
              },
            };
          }
        );

      if (transitionResult.ok) {
        await deps.callSessionStore.set(params.callId, transitionResult.session);
        await deps.routeToDevice(
          transitionResult.session.callerDeviceId,
          params.answeredMessage
        );
        if (transitionResult.siblingHangupDeviceIds.length > 0) {
          await deps.routeToDevices(
            transitionResult.siblingHangupDeviceIds,
            buildHangupMessage(params.callId)
          );
        }
      } else if (transitionResult.reason === "transport_missing") {
        await clearDerivedTransportState(params.callId);
      }
      return transitionResult;
    },

    async rejectCall(params) {
      const transitionResult =
        await authorityStore.transition<RejectCallTransitionResult>(
          params.callId,
          async (record) => {
            if (!isDirectCallRecord(record)) {
              return {
                result: { ok: false as const, reason: "not_found" as const },
              };
            }
            if (record.calleeUserId !== params.actorUserId) {
              return {
                result: { ok: false as const, reason: "forbidden" as const },
              };
            }
            if (record.status === "rejected") {
              return {
                result: {
                  ok: true as const,
                  alreadyTerminal: true,
                  resultingStatus: "rejected" as const,
                  terminatedByRole: "callee" as const,
                  notifiedDeviceIds: [] as string[],
                },
              };
            }
            if (record.status !== "ringing") {
              if (isTerminalDirectCallStatus(record.status)) {
                return {
                  result: {
                    ok: true as const,
                    alreadyTerminal: true,
                    resultingStatus: "rejected" as const,
                    terminatedByRole: "callee" as const,
                    notifiedDeviceIds: [] as string[],
                  },
                };
              }
              return {
                result: { ok: false as const, reason: "forbidden" as const },
              };
            }

            const session = await loadCompatibleSession(record, params.callId);
            if (
              session &&
              session.calleeDeviceIds.length > 0 &&
              !session.calleeDeviceIds.includes(params.actorDeviceId)
            ) {
              return {
                result: { ok: false as const, reason: "forbidden" as const },
              };
            }

            const callerTargetDeviceIds = await resolveCallerTargetDeviceIds(
              record,
              session
            );
            const siblingDeviceIds = session
              ? session.calleeDeviceIds.filter(
                  (deviceId) => deviceId !== params.actorDeviceId
                )
              : [];

            return {
              mutation: {
                type: "status" as const,
                status: "rejected" as const,
              },
              result: {
                ok: true as const,
                alreadyTerminal: false,
                resultingStatus: "rejected" as const,
                terminatedByRole: "callee" as const,
                callerTargetDeviceIds,
                siblingDeviceIds,
              },
            };
          }
        );

      if (!transitionResult.ok) {
        return transitionResult;
      }

      if (transitionResult.alreadyTerminal) {
        await clearDerivedTransportState(params.callId);
        return transitionResult;
      }

      await clearDerivedTransportState(params.callId);
      const callerNotifiedDeviceIds = await notifyDeviceIds(
        transitionResult.callerTargetDeviceIds,
        buildRejectedMessage(params.callId)
      );
      if (transitionResult.siblingDeviceIds.length > 0) {
        await deps.routeToDevices(
          transitionResult.siblingDeviceIds,
          buildHangupMessage(params.callId)
        );
      }

      return {
        ok: true as const,
        alreadyTerminal: false,
        resultingStatus: "rejected" as const,
        terminatedByRole: "callee" as const,
        notifiedDeviceIds: callerNotifiedDeviceIds,
      };
    },

    async hangupCall(params) {
      const transitionResult =
        await authorityStore.transition<HangupCallTransitionResult>(
          params.callId,
          async (record) => {
            if (!isDirectCallRecord(record)) {
              return {
                result: { ok: false as const, reason: "not_found" as const },
              };
            }
            let terminatedByRole: "caller" | "callee" | null;
            if (record.callerUserId === params.actorUserId) {
              terminatedByRole = "caller";
            } else if (record.calleeUserId === params.actorUserId) {
              terminatedByRole = "callee";
            } else {
              terminatedByRole = null;
            }
            if (!terminatedByRole) {
              return {
                result: { ok: false as const, reason: "forbidden" as const },
              };
            }
            if (record.status === "ended") {
              return {
                result: {
                  ok: true as const,
                  alreadyTerminal: true,
                  resultingStatus: "ended" as const,
                  terminatedByRole,
                  notifiedDeviceIds: [] as string[],
                },
              };
            }
            if (isTerminalDirectCallStatus(record.status)) {
              return {
                result: {
                  ok: true as const,
                  alreadyTerminal: true,
                  resultingStatus: "ended" as const,
                  terminatedByRole,
                  notifiedDeviceIds: [] as string[],
                },
              };
            }

            const session = await loadCompatibleSession(record, params.callId);
            const targetDeviceIds =
              terminatedByRole === "caller"
                ? await resolveCalleeTargetDeviceIds(record, session)
                : await resolveCallerTargetDeviceIds(record, session);

            // Caller giving up on a ringing unanswered call → callee missed it.
            const nextStatus: "ended" | "missed" =
              terminatedByRole === "caller" && record.status === "ringing"
                ? "missed"
                : "ended";

            return {
              mutation: { type: "status" as const, status: nextStatus },
              result: {
                ok: true as const,
                alreadyTerminal: false,
                resultingStatus: nextStatus,
                terminatedByRole,
                targetDeviceIds,
              },
            };
          }
        );

      if (!transitionResult.ok) {
        return transitionResult;
      }

      if (transitionResult.alreadyTerminal) {
        await clearDerivedTransportState(params.callId);
        return transitionResult;
      }

      await clearDerivedTransportState(params.callId);
      const notifiedDeviceIds = await notifyDeviceIds(
        transitionResult.targetDeviceIds,
        buildHangupMessage(params.callId)
      );

      return {
        ok: true as const,
        alreadyTerminal: false,
        resultingStatus: transitionResult.resultingStatus,
        terminatedByRole: transitionResult.terminatedByRole,
        notifiedDeviceIds,
      };
    },

    async cleanupDisconnectedDevice(params) {
      const callIds = await deps.callSessionStore.listByDevice(params.deviceId);
      if (callIds.length === 0) return [];

      const results: Array<{
        callId: string;
        resultingStatus: "ended" | "missed";
        terminatedByRole: "caller" | "callee";
        notifiedDeviceIds: string[];
      }> = [];

      for (const callId of callIds) {
        const transitionResult =
          await authorityStore.transition<DisconnectCleanupTransitionResult>(
            callId,
            async (record) => {
              if (!isDirectCallRecord(record)) {
                return {
                  result: null,
                };
              }
              if (isTerminalDirectCallStatus(record.status)) {
                return {
                  result: null,
                };
              }

              const session = await loadCompatibleSession(record, callId);
              if (!session) {
                const terminatedByRole =
                  (await resolveDeviceRole(record, params.deviceId)) ??
                  "caller";
                const targetDeviceIds =
                  terminatedByRole === "caller"
                    ? await resolveCalleeTargetDeviceIds(record, null)
                    : await resolveCallerTargetDeviceIds(record, null);
                if (record.status === "ringing") {
                  return {
                    mutation: {
                      type: "status" as const,
                      status: "missed" as const,
                    },
                    result: {
                      callId,
                      resultingStatus: "missed" as const,
                      terminatedByRole,
                      targetDeviceIds,
                    },
                  };
                }
                return {
                  mutation: {
                    type: "status" as const,
                    status: "ended" as const,
                  },
                  result: {
                    callId,
                    resultingStatus: "ended" as const,
                    terminatedByRole,
                    targetDeviceIds,
                  },
                };
              }

              if (
                session.callerDeviceId !== params.deviceId &&
                session.calleeDeviceId !== params.deviceId
              ) {
                return {
                  result: null,
                };
              }

              const terminatedByRole: "caller" | "callee" =
                session.callerDeviceId === params.deviceId
                  ? "caller"
                  : "callee";
              const nextStatus: "ended" | "missed" =
                record.status === "ringing" ? "missed" : "ended";
              const targetDeviceIds =
                terminatedByRole === "caller"
                  ? await resolveCalleeTargetDeviceIds(record, session)
                  : await resolveCallerTargetDeviceIds(record, session);

              return {
                mutation: { type: "status" as const, status: nextStatus },
                result: {
                  callId,
                  resultingStatus: nextStatus,
                  terminatedByRole,
                  targetDeviceIds,
                },
              };
            }
          );

        if (!transitionResult) {
          const record = await authorityStore.get(callId);
          if (!record || isTerminalDirectCallStatus(record.status)) {
            await clearDerivedTransportState(callId);
          }
          continue;
        }

        await clearDerivedTransportState(callId);
        const notifiedDeviceIds = await notifyDeviceIds(
          transitionResult.targetDeviceIds,
          buildHangupMessage(callId)
        );
        results.push({
          callId,
          resultingStatus: transitionResult.resultingStatus,
          terminatedByRole: transitionResult.terminatedByRole,
          notifiedDeviceIds,
        });
      }

      return results;
    },

    async replayPendingOffers(params) {
      const callIds = await deps.callSessionStore.listByDevice(params.deviceId);
      if (callIds.length === 0) return [];

      const replayed: PendingOfferReplay[] = [];

      for (const callId of callIds) {
        const candidate = await loadPendingOfferReplayCandidate(
          callId,
          params.deviceId
        );
        if (!candidate) continue;

        await deps.routeToDevice(params.deviceId, candidate.offer);
        replayed.push({
          callId: candidate.callId,
          callerDeviceId: candidate.callerDeviceId,
          calleeDeviceId: candidate.calleeDeviceId,
        });
      }

      return replayed;
    },
  };
}
