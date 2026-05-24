import type { FastifyInstance } from "fastify";
import type { RawData, WebSocket } from "ws";
import { nanoid } from "nanoid";
import {
  safeParseWsClientMessage,
  type WsServerMessage,
  toWsServerWireMessage,
} from "@seclettr/protocol";
import { query } from "../db/pool.js";
import {
  createRedisSubscriber,
  hasRegisteredUserSocket,
  publishPresenceUpdate,
  redis,
  registerDeviceSocket,
  touchDeviceSocket,
  unregisterDeviceSocket,
  MESSAGE_CHANNEL,
  publishMessage,
} from "./redis.js";
import { WsRateLimiter } from "./ws-rate-limit.js";
import { verifyWebSocketToken } from "./ws-auth.js";
import {
  createCallSessionStore,
  createDirectCallLifecycleManager,
} from "./call-routing-state.js";
import { WsConnectionIndex } from "./ws-connection-index.js";
import { parseRedisWsPayload } from "./ws-redis-payload.js";
import {
  forwardTypingSignal,
  markMessageDelivered,
  markMessageRead,
  replayMessageReceipts,
} from "./ws-message-events.js";
import {
  handleGroupCallMediaKeyAckSignal as routeGroupCallMediaKeyAckSignal,
  handleGroupCallMediaKeySignal as routeGroupCallMediaKeySignal,
  handleGroupCallMediaModeSignal as routeGroupCallMediaModeSignal,
  handleGroupCallProducerStateSignal as routeGroupCallProducerStateSignal,
  type GroupCallSignalDeps,
} from "./ws-group-call-signals.js";
import {
  hasDeviceScopedGroupCallParticipants,
  hasGroupCallParticipantDevice,
  hasGroupCallParticipantUser,
  listGroupCallParticipantDevices,
  listGroupCallParticipants,
  removeGroupCallParticipant,
} from "./group-call-presence.js";
import { createDirectCallSignalRouter } from "./ws-direct-call-router.js";
import {
  recordWebSocketConnected,
  recordWebSocketDisconnected,
} from "./observability.js";
function createSignalRunner() {
  let tail = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T> | T): Promise<T> => {
    const next = tail.then(() => task());
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
  return { enqueue };
}

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  sessionId: string | null;
  socketId: string;
  joinedRoomIds: Set<string>;
}

const connections = new WsConnectionIndex<ConnectedClient>();
const callSessionStore = createCallSessionStore(redis);
const directCallLifecycleManager = createDirectCallLifecycleManager({
  callSessionStore,
  loadUserDeviceIds,
  routeToDevice,
  routeToDevices,
});
const directCallSignalRouter = createDirectCallSignalRouter({
  callSessionStore,
  directCallLifecycleManager,
  hasActiveConnectionForDevice,
  loadUserDeviceIds,
  routeToDevice,
  routeToDevices,
});

export function hasActiveConnectionForUser(userId: string): boolean {
  return connections.hasActiveConnectionForUser(userId);
}

export async function hasActiveConnectionForUserAcrossCluster(
  userId: string
): Promise<boolean> {
  if (hasActiveConnectionForUser(userId)) {
    return true;
  }
  return hasRegisteredUserSocket(userId);
}

function hasActiveConnectionForDevice(deviceId: string): boolean {
  return connections.hasActiveConnectionForDevice(deviceId);
}

const wsRateLimiter = new WsRateLimiter();


function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(toWsServerWireMessage(msg)));
  }
}

function sendToDeviceConnections(deviceId: string, msg: WsServerMessage): void {
  connections.forEachByDevice(deviceId, (client) => {
    send(client.ws, msg);
  });
}

function sendToUserConnections(userId: string, msg: WsServerMessage): void {
  connections.forEachByUser(userId, (client) => {
    send(client.ws, msg);
  });
}

function decodeTextFrame(rawData: RawData): string | null {
  if (typeof rawData === "string") return rawData;
  if (Buffer.isBuffer(rawData)) return rawData.toString("utf8");
  if (rawData instanceof ArrayBuffer)
    return Buffer.from(rawData).toString("utf8");
  if (Array.isArray(rawData)) {
    return Buffer.concat(
      rawData.map((chunk) =>
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      )
    ).toString("utf8");
  }
  return null;
}

async function touchDeviceLastSeen(
  deviceId: string,
  log: FastifyInstance["log"]
): Promise<void> {
  try {
    await query(
      `UPDATE devices
       SET last_seen_at = now()
       WHERE id = $1`,
      [deviceId]
    );
  } catch (err) {
    log.warn({ deviceId, err }, "[ws] touchDeviceLastSeen failed");
  }
}

function broadcastPresenceLocally(
  userId: string,
  online: boolean,
  lastSeenAt?: string
): void {
  const payload: WsServerMessage = {
    type: "presence.update",
    userId,
    online,
    lastSeenAt,
  };
  connections.forEach((client) => {
    send(client.ws, payload);
  });
}

async function publishPresenceUpdateAcrossCluster(
  fastify: FastifyInstance,
  userId: string,
  online: boolean,
  lastSeenAt?: string
): Promise<void> {
  try {
    await publishPresenceUpdate({
      type: "presence.update",
      userId,
      online,
      lastSeenAt,
    });
  } catch (err) {
    fastify.log.warn(
      { err, userId, online },
      "Failed to publish presence update over Redis"
    );
    broadcastPresenceLocally(userId, online, lastSeenAt);
  }
}

export async function registerWebSocketHandler(
  fastify: FastifyInstance
): Promise<void> {
  const subscriber = createRedisSubscriber();
  await subscriber.subscribe(MESSAGE_CHANNEL);

  subscriber.on("message", (_channel: string, rawPayload: string) => {
    try {
      const parsed = parseRedisWsPayload(rawPayload);
      if (!parsed) {
        return;
      }
      if (parsed.scope === "presence.broadcast") {
        broadcastPresenceLocally(
          parsed.payload.userId,
          parsed.payload.online,
          parsed.payload.lastSeenAt
        );
      } else if (parsed.scope === "device.force_disconnect") {
        connections.forEachByDevice(parsed.deviceId, (client) => {
          client.ws.close(4003, "Session terminated");
        });
      } else if (parsed.scope === "user") {
        sendToUserConnections(parsed.recipientUserId, parsed.payload);
      } else {
        sendToDeviceConnections(parsed.recipientDeviceId, parsed.payload);
      }
    } catch (err) {
      fastify.log.error({ err }, "Failed to process Redis message");
    }
  });

  fastify.addHook("onClose", async () => {
    directCallSignalRouter.cancelAllDisconnectCleanup();
    try {
      await subscriber.unsubscribe(MESSAGE_CHANNEL);
    } catch (err) {
      fastify.log.warn({ err }, "Failed to unsubscribe WS redis subscriber");
    }
    try {
      await subscriber.quit();
    } catch {
      subscriber.disconnect();
    }
  });

  fastify.get("/ws", { websocket: true }, async (socket, request) => {
    let auth: { sub: string; deviceId: string; sessionId?: string } | null = null;
    try {
      auth = verifyWebSocketToken(fastify, request);
    } catch {
      socket.close(4001, "Unauthorized");
      return;
    }

    const socketId = nanoid();
    const client: ConnectedClient = {
      ws: socket,
      userId: auth.sub,
      deviceId: auth.deviceId,
      sessionId: auth.sessionId ?? null,
      socketId,
      joinedRoomIds: new Set<string>(),
    };
    directCallSignalRouter.cancelDisconnectCleanup(client.deviceId);
    connections.add(client);
    let pingInterval: NodeJS.Timeout | null = null;
    const signalRunner = createSignalRunner();

    const enqueueStatefulSignalTask = (
      task: () => Promise<void>,
      context: Record<string, unknown>,
      failureMessage: string
    ): void => {
      void signalRunner.enqueue(task).catch((err) => {
        fastify.log.warn(
          {
            err,
            socketId,
            userId: client.userId,
            deviceId: client.deviceId,
            ...context,
          },
          failureMessage
        );
      });
    };

    socket.on("message", (rawData, isBinary) => {
      if (isBinary) return;
      const text = decodeTextFrame(rawData);
      if (!text) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        send(client.ws, {
          type: "error",
          code: "MALFORMED_PAYLOAD",
          message: "Malformed websocket payload",
        });
        return;
      }

      const result = safeParseWsClientMessage(parsed);
      if (!result.success) {
        send(client.ws, {
          type: "error",
          code: result.error.code,
          message:
            result.error.code === "UNSUPPORTED_PROTOCOL_VERSION"
              ? `Unsupported websocket protocol version ${String(
                  result.error.receivedVersion ?? "unknown"
                )}`
              : "Invalid websocket payload",
        });

        if (result.error.code === "UNSUPPORTED_PROTOCOL_VERSION") {
          socket.close(1002, "Unsupported websocket protocol version");
        }
        return;
      }
      const msg: WsClientMessage = result.data;

      if (!wsRateLimiter.consume(socketId, msg.type)) {
        const callId = "callId" in msg ? msg.callId : undefined;
        fastify.log.debug(
          {
            socketId,
            userId: client.userId,
            deviceId: client.deviceId,
            messageType: msg.type,
            callId,
          },
          "WS message rate-limited"
        );
        send(client.ws, {
          type: "error",
          code: "RATE_LIMITED",
          message: "Too many messages",
        });
        return;
      }

      switch (msg.type) {
        case "ping":
          send(client.ws, { type: "pong", id: msg.id });
          break;

        case "ack":
          void markMessageDelivered(fastify, msg.messageId, client.deviceId);
          break;

        case "message.read":
          void markMessageRead(
            fastify,
            msg.messageId,
            client.deviceId,
            client.userId
          );
          break;

        case "typing.start":
        case "typing.stop":
          void forwardTypingSignal(
            fastify,
            client,
            msg.targetUserId,
            msg.type,
            (msg as { chatKind?: "plain" | "e2ee" }).chatKind
          );
          break;

        case "call.offer":
        case "call.answer":
        case "call.renegotiate.offer":
        case "call.renegotiate.answer":
        case "call.ice":
        case "call.ice.batch":
        case "call.hangup":
        case "call.media_state":
        case "call.reject":
          enqueueStatefulSignalTask(
            () =>
              directCallSignalRouter.handleSignal(
                fastify,
                client,
                msg as WsClientMessage & { callId: string }
              ),
            { callId: msg.callId, type: msg.type },
            "Failed to route call signal"
          );
          break;

        case "group.call.media-key":
          enqueueStatefulSignalTask(
            () => handleGroupCallMediaKeySignal(fastify, client, msg),
            {
              callId: msg.callId,
              targetDeviceId: msg.targetDeviceId,
              type: msg.type,
            },
            "Failed to route group call media key"
          );
          break;

        case "group.call.media-key.ack":
          enqueueStatefulSignalTask(
            () => handleGroupCallMediaKeyAckSignal(fastify, client, msg),
            {
              callId: msg.callId,
              targetDeviceId: msg.targetDeviceId,
              type: msg.type,
            },
            "Failed to route group call media key ack"
          );
          break;

        case "group.call.media-mode":
          enqueueStatefulSignalTask(
            () => handleGroupCallMediaModeSignal(fastify, client, msg),
            { callId: msg.callId, mode: msg.mode, type: msg.type },
            "Failed to route group call media mode"
          );
          break;

        case "group.call.producer_state":
          enqueueStatefulSignalTask(
            () => handleGroupCallProducerStateSignal(fastify, client, msg),
            {
              callId: msg.callId,
              producerId: msg.producerId,
              kind: msg.kind,
              state: msg.state,
            },
            "Failed to route group call producer state"
          );
          break;

        case "room.join":
        case "room.leave":
          enqueueStatefulSignalTask(
            () => handleRoomSignal(fastify, client, msg),
            { roomId: msg.roomId, type: msg.type },
            "Failed to process room signal"
          );
          break;
      }
    });

    socket.on("close", async () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      recordWebSocketDisconnected();
      connections.remove(client.socketId);
      wsRateLimiter.clear(socketId);
      await cleanupJoinedRoomsOnDisconnect(fastify, client);
      await unregisterDeviceSocket(client.userId, client.deviceId, socketId);
      await touchDeviceLastSeen(client.deviceId, fastify.log);
      directCallSignalRouter.scheduleDisconnectCleanup(fastify, client);
      if (!(await hasActiveConnectionForUserAcrossCluster(client.userId))) {
        await publishPresenceUpdateAcrossCluster(
          fastify,
          client.userId,
          false,
          new Date().toISOString()
        );
      }
      fastify.log.info({ userId: client.userId }, "WS disconnected");
    });

    socket.on("error", (err) => {
      fastify.log.error({ err, userId: client.userId }, "WS error");
    });

    await registerDeviceSocket(auth.sub, auth.deviceId, socketId);
    recordWebSocketConnected();
    await touchDeviceLastSeen(auth.deviceId, fastify.log);
    await publishPresenceUpdateAcrossCluster(fastify, auth.sub, true);
    void replayMessageReceipts(fastify, auth.deviceId);
    void directCallSignalRouter
      .replayPendingOffers(fastify, client)
      .catch((err) => {
        fastify.log.warn(
          { err, userId: auth.sub, deviceId: auth.deviceId },
          "Failed to replay pending direct-call offers after reconnect"
        );
      });

    fastify.log.info(
      { userId: auth.sub, deviceId: auth.deviceId },
      "WS connected"
    );

    pingInterval = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping();
        void touchDeviceSocket(client.userId, client.deviceId).catch((err) => {
          fastify.log.warn({ err, deviceId: client.deviceId }, "Failed to refresh device socket TTL");
        });
      }
    }, 30_000);
  });
}

type WsClientMessage = import("@seclettr/protocol").WsClientMessage;

function uniqueDeviceIds(deviceIds: string[]): string[] {
  return [...new Set(deviceIds)];
}

async function loadUserDeviceIds(userId: string): Promise<string[]> {
  const devices = await query<{ id: string }>(
    `SELECT id FROM devices WHERE user_id = $1`,
    [userId]
  );
  return uniqueDeviceIds(devices.map((device) => device.id));
}

async function routeToDevice(
  deviceId: string,
  msg: WsServerMessage
): Promise<void> {
  await publishMessage({
    ...msg,
    recipientDeviceId: deviceId,
  });
}

async function routeToDevices(
  deviceIds: string[],
  msg: WsServerMessage
): Promise<void> {
  const uniqueTargets = uniqueDeviceIds(deviceIds);
  if (uniqueTargets.length === 0) return;
  await Promise.all(
    uniqueTargets.map((deviceId) => routeToDevice(deviceId, msg))
  );
}

type ActiveRoomSession = {
  id: string;
  group_id: string | null;
};

type GroupParticipantLifecycleEvent = Extract<
  WsServerMessage,
  {
    type:
      | "group.call.participant_joined"
      | "group.call.participant_left"
      | "group.call.participant_device_joined"
      | "group.call.participant_device_left";
  }
>;
type GroupCallMediaKeyMessage = Extract<
  WsClientMessage,
  { type: "group.call.media-key" }
>;
type GroupCallMediaKeyAckMessage = Extract<
  WsClientMessage,
  { type: "group.call.media-key.ack" }
>;
type GroupCallMediaModeMessage = Extract<
  WsClientMessage,
  { type: "group.call.media-mode" }
>;
type GroupCallProducerStateMessage = Extract<
  WsClientMessage,
  { type: "group.call.producer_state" }
>;
type GroupProducerLifecycleEvent = Extract<
  WsServerMessage,
  { type: "group.call.producer_state" }
>;
type GroupMediaModeEvent = Extract<
  WsServerMessage,
  { type: "group.call.media-mode" }
>;

const groupCallSignalDeps: GroupCallSignalDeps = {
  getActiveRoomSession,
  hasDeviceScopedGroupCallParticipants,
  hasGroupCallParticipantDevice,
  hasGroupCallParticipantUser,
  isAllowedGroupMemberDevice,
  routeToDevice,
  publishGroupProducerStateEvent,
  publishGroupMediaModeEvent,
  sendWsMessage: send,
};

async function getActiveRoomSession(
  roomId: string
): Promise<ActiveRoomSession | null> {
  const sessions = await query<ActiveRoomSession>(
    `SELECT id, group_id
     FROM call_sessions
     WHERE id = $1
       AND status IN ('ringing', 'active')`,
    [roomId]
  );
  return sessions[0] ?? null;
}

async function hasActiveGroupMembership(
  groupId: string,
  userId: string
): Promise<boolean> {
  const memberships = await query<{ group_id: string }>(
    `SELECT group_id
     FROM group_members
     WHERE group_id = $1
       AND user_id = $2
       AND removed_at IS NULL`,
    [groupId, userId]
  );
  return memberships.length > 0;
}

async function loadGroupMemberDeviceIds(groupId: string): Promise<string[]> {
  const devices = await query<{ id: string }>(
    `SELECT d.id
     FROM devices d
     INNER JOIN group_members gm ON gm.user_id = d.user_id
     WHERE gm.group_id = $1
       AND gm.removed_at IS NULL`,
    [groupId]
  );
  return uniqueDeviceIds(devices.map((device) => device.id));
}

async function loadParticipantDeviceIdsForUsers(
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const devices = await query<{ id: string }>(
    `SELECT id
     FROM devices
     WHERE user_id = ANY($1::uuid[])`,
    [userIds]
  );

  return uniqueDeviceIds(devices.map((device) => device.id));
}

async function filterAllowedGroupMemberDevices(
  groupId: string,
  deviceIds: string[]
): Promise<string[]> {
  const uniqueDeviceIdsForCheck = uniqueDeviceIds(deviceIds);
  if (uniqueDeviceIdsForCheck.length === 0) return [];

  const allowedDevices = await query<{ id: string }>(
    `SELECT d.id
     FROM devices d
     INNER JOIN group_members gm ON gm.user_id = d.user_id
     WHERE gm.group_id = $1
       AND gm.removed_at IS NULL
       AND d.id = ANY($2::uuid[])`,
    [groupId, uniqueDeviceIdsForCheck]
  );

  return uniqueDeviceIds(allowedDevices.map((device) => device.id));
}

async function loadActiveGroupCallTargetDeviceIds(
  callId: string,
  groupId: string
): Promise<string[]> {
  if (await hasDeviceScopedGroupCallParticipants(callId)) {
    const deviceIds = await listGroupCallParticipantDevices(callId);
    if (deviceIds.length > 0) {
      return filterAllowedGroupMemberDevices(groupId, deviceIds);
    }
  }

  const participantUserIds = await listGroupCallParticipants(callId);
  if (participantUserIds.length > 0) {
    const participantDeviceIds = await loadParticipantDeviceIdsForUsers(
      participantUserIds
    );
    return filterAllowedGroupMemberDevices(groupId, participantDeviceIds);
  }

  return loadGroupMemberDeviceIds(groupId);
}

async function publishGroupParticipantEvent(
  groupId: string,
  payload: GroupParticipantLifecycleEvent
): Promise<void> {
  const deviceIds = await loadGroupMemberDeviceIds(groupId);
  await routeToDevices(deviceIds, payload);
}

async function publishGroupParticipantEvents(
  groupId: string,
  payloads: GroupParticipantLifecycleEvent[]
): Promise<void> {
  if (payloads.length === 0) return;
  await Promise.all(
    payloads.map((payload) => publishGroupParticipantEvent(groupId, payload))
  );
}

async function publishGroupCallEndedEvent(
  groupId: string,
  callId: string,
  endedByUserId: string
): Promise<void> {
  const deviceIds = await loadGroupMemberDeviceIds(groupId);
  await routeToDevices(deviceIds, {
    type: "group.call.ended",
    groupId,
    callId,
    endedByUserId,
    endedAt: new Date().toISOString(),
  });
}

async function publishGroupCallEventExcludingSender(
  callId: string,
  groupId: string,
  senderDeviceId: string,
  payload: WsServerMessage
): Promise<void> {
  const deviceIds = await loadActiveGroupCallTargetDeviceIds(callId, groupId);
  const targetDeviceIds = deviceIds.filter(
    (deviceId) => deviceId !== senderDeviceId
  );
  await routeToDevices(targetDeviceIds, payload);
}

async function publishGroupProducerStateEvent(
  callId: string,
  groupId: string,
  senderDeviceId: string,
  payload: GroupProducerLifecycleEvent
): Promise<void> {
  await publishGroupCallEventExcludingSender(callId, groupId, senderDeviceId, payload);
}

async function publishGroupMediaModeEvent(
  callId: string,
  groupId: string,
  senderDeviceId: string,
  payload: GroupMediaModeEvent
): Promise<void> {
  await publishGroupCallEventExcludingSender(callId, groupId, senderDeviceId, payload);
}

function buildParticipantJoinedEvents(input: {
  groupId: string;
  callId: string;
  userId: string;
  deviceId: string;
  sessionId?: string | null;
  joinedAt: string;
  includeUserEvent: boolean;
}): GroupParticipantLifecycleEvent[] {
  const events: GroupParticipantLifecycleEvent[] = [
    {
      type: "group.call.participant_device_joined",
      groupId: input.groupId,
      callId: input.callId,
      userId: input.userId,
      deviceId: input.deviceId,
      sessionId: input.sessionId ?? undefined,
      joinedAt: input.joinedAt,
    },
  ];

  if (input.includeUserEvent) {
    events.push({
      type: "group.call.participant_joined",
      groupId: input.groupId,
      callId: input.callId,
      userId: input.userId,
      deviceId: input.deviceId,
      sessionId: input.sessionId ?? undefined,
      joinedAt: input.joinedAt,
    });
  }

  return events;
}

function buildParticipantLeftEvents(input: {
  groupId: string;
  callId: string;
  userId: string;
  deviceId: string;
  sessionId?: string | null;
  leftAt: string;
  includeUserEvent: boolean;
}): GroupParticipantLifecycleEvent[] {
  const events: GroupParticipantLifecycleEvent[] = [
    {
      type: "group.call.participant_device_left",
      groupId: input.groupId,
      callId: input.callId,
      userId: input.userId,
      deviceId: input.deviceId,
      sessionId: input.sessionId ?? undefined,
      leftAt: input.leftAt,
    },
  ];

  if (input.includeUserEvent) {
    events.push({
      type: "group.call.participant_left",
      groupId: input.groupId,
      callId: input.callId,
      userId: input.userId,
      deviceId: input.deviceId,
      sessionId: input.sessionId ?? undefined,
      leftAt: input.leftAt,
    });
  }

  return events;
}

async function isAllowedGroupMemberDevice(
  groupId: string,
  deviceId: string
): Promise<boolean> {
  const devices = await query<{ id: string }>(
    `SELECT d.id
     FROM devices d
     INNER JOIN group_members gm ON gm.user_id = d.user_id
     WHERE d.id = $1
       AND gm.group_id = $2
       AND gm.removed_at IS NULL`,
    [deviceId, groupId]
  );
  return devices.length > 0;
}

async function leaveJoinedRoom(
  sender: ConnectedClient,
  roomId: string
): Promise<void> {
  const room = await getActiveRoomSession(roomId);
  if (!room?.group_id) return;

  const removed = await removeGroupCallParticipant(
    room.id,
    sender.userId,
    sender.deviceId
  );
  if (!removed.deviceRemoved) return;

  await publishGroupParticipantEvents(
    room.group_id,
    buildParticipantLeftEvents({
      groupId: room.group_id,
      callId: room.id,
      userId: sender.userId,
      deviceId: sender.deviceId,
      sessionId: sender.sessionId,
      leftAt: new Date().toISOString(),
      includeUserEvent: removed.userRemoved,
    })
  );

  const remainingParticipants = await listGroupCallParticipants(room.id);
  if (remainingParticipants.length > 0) {
    return;
  }

  const updated = await query<{ id: string }>(
    `UPDATE call_sessions
     SET status = 'ended',
         ended_at = COALESCE(ended_at, now())
     WHERE id = $1
       AND status IN ('ringing', 'active')
     RETURNING id`,
    [room.id]
  );
  if (updated.length === 0) {
    return;
  }

  await publishGroupCallEndedEvent(room.group_id, room.id, sender.userId);
}

function detachJoinedRoomTransport(
  sender: ConnectedClient,
  roomId: string
): void {
  sender.joinedRoomIds.delete(roomId);
}

async function cleanupJoinedRoomsOnDisconnect(
  fastify: FastifyInstance,
  client: ConnectedClient
): Promise<void> {
  const roomIds = [...client.joinedRoomIds];
  client.joinedRoomIds.clear();

  for (const roomId of roomIds) {
    try {
      await leaveJoinedRoom(client, roomId);
    } catch (err) {
      fastify.log.debug(
        { err, roomId, userId: client.userId },
        "Failed to cleanup joined room on disconnect"
      );
    }
  }
}

async function handleGroupCallMediaKeySignal(
  fastify: FastifyInstance,
  sender: ConnectedClient,
  msg: GroupCallMediaKeyMessage
): Promise<void> {
  await routeGroupCallMediaKeySignal(groupCallSignalDeps, fastify, sender, msg);
}

async function handleGroupCallMediaKeyAckSignal(
  fastify: FastifyInstance,
  sender: ConnectedClient,
  msg: GroupCallMediaKeyAckMessage
): Promise<void> {
  await routeGroupCallMediaKeyAckSignal(
    groupCallSignalDeps,
    fastify,
    sender,
    msg
  );
}

async function handleGroupCallProducerStateSignal(
  fastify: FastifyInstance,
  sender: ConnectedClient,
  msg: GroupCallProducerStateMessage
): Promise<void> {
  await routeGroupCallProducerStateSignal(
    groupCallSignalDeps,
    fastify,
    sender,
    msg
  );
}

async function handleGroupCallMediaModeSignal(
  fastify: FastifyInstance,
  sender: ConnectedClient,
  msg: GroupCallMediaModeMessage
): Promise<void> {
  await routeGroupCallMediaModeSignal(
    groupCallSignalDeps,
    fastify,
    sender,
    msg
  );
}

async function handleRoomSignal(
  fastify: FastifyInstance,
  sender: ConnectedClient,
  msg: Extract<WsClientMessage, { type: "room.join" | "room.leave" }>
): Promise<void> {
  if (msg.type === "room.leave") {
    detachJoinedRoomTransport(sender, msg.roomId);
    fastify.log.debug(
      { roomId: msg.roomId, userId: sender.userId, deviceId: sender.deviceId },
      "WS room.leave detached live transport without mutating roster"
    );
    return;
  }

  const room = await getActiveRoomSession(msg.roomId);
  if (!room) {
    send(sender.ws, {
      type: "error",
      code: "ROOM_NOT_FOUND",
      message: "Room not found",
    });
    return;
  }

  sender.joinedRoomIds.add(room.id);

  if (!room.group_id) {
    return;
  }

  if (!(await hasActiveGroupMembership(room.group_id, sender.userId))) {
    sender.joinedRoomIds.delete(room.id);
    send(sender.ws, {
      type: "error",
      code: "FORBIDDEN",
      message: "Forbidden",
    });
    return;
  }
  fastify.log.debug(
    { roomId: room.id, userId: sender.userId, deviceId: sender.deviceId },
    "WS room.join attached live transport without mutating roster"
  );
}
