import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { WsClientMessage, WsServerMessage } from "@seclettr/protocol";

type GroupCallMediaKeyMessage = Extract<WsClientMessage, { type: "group.call.media-key" }>;
type GroupCallMediaKeyAckMessage = Extract<WsClientMessage, { type: "group.call.media-key.ack" }>;
type GroupCallMediaModeMessage = Extract<WsClientMessage, { type: "group.call.media-mode" }>;
type GroupCallProducerStateMessage = Extract<WsClientMessage, { type: "group.call.producer_state" }>;
type GroupProducerLifecycleEvent = Extract<WsServerMessage, { type: "group.call.producer_state" }>;
type GroupMediaModeEvent = Extract<WsServerMessage, { type: "group.call.media-mode" }>;

export interface GroupSignalSender {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  sessionId: string | null;
}

export interface GroupSignalRoom {
  id: string;
  group_id: string | null;
}

type ActiveGroupSignalRoom = {
  id: string;
  group_id: string;
};

export interface GroupCallSignalDeps {
  getActiveRoomSession: (roomId: string) => Promise<GroupSignalRoom | null>;
  hasDeviceScopedGroupCallParticipants: (roomId: string) => Promise<boolean>;
  hasGroupCallParticipantDevice: (roomId: string, deviceId: string) => Promise<boolean>;
  hasGroupCallParticipantUser: (roomId: string, userId: string) => Promise<boolean>;
  isAllowedGroupMemberDevice: (groupId: string, deviceId: string) => Promise<boolean>;
  routeToDevice: (deviceId: string, msg: WsServerMessage) => Promise<void>;
  publishGroupProducerStateEvent: (
    roomId: string,
    groupId: string,
    senderDeviceId: string,
    payload: GroupProducerLifecycleEvent
  ) => Promise<void>;
  publishGroupMediaModeEvent: (
    roomId: string,
    groupId: string,
    senderDeviceId: string,
    payload: GroupMediaModeEvent
  ) => Promise<void>;
  sendWsMessage: (ws: WebSocket, msg: WsServerMessage) => void;
}

function sendError(
  deps: GroupCallSignalDeps,
  sender: GroupSignalSender,
  code:
    | "ROOM_NOT_FOUND"
    | "FORBIDDEN"
    | "TARGET_DEVICE_NOT_ALLOWED"
    | "INVALID_PAYLOAD",
  message: string
): void {
  deps.sendWsMessage(sender.ws, {
    type: "error",
    code,
    message,
  });
}

async function ensureRoomAndSenderAllowed(
  deps: GroupCallSignalDeps,
  sender: GroupSignalSender,
  callId: string
): Promise<{ room: ActiveGroupSignalRoom; hasDeviceScopedPresence: boolean } | null> {
  const room = await deps.getActiveRoomSession(callId);
  if (!room?.group_id) {
    sendError(deps, sender, "ROOM_NOT_FOUND", "Room not found");
    return null;
  }
  const activeRoom: ActiveGroupSignalRoom = {
    id: room.id,
    group_id: room.group_id,
  };

  const hasDeviceScopedPresence = await deps.hasDeviceScopedGroupCallParticipants(activeRoom.id);
  const senderAllowed = hasDeviceScopedPresence
    ? await deps.hasGroupCallParticipantDevice(activeRoom.id, sender.deviceId)
    : await deps.hasGroupCallParticipantUser(activeRoom.id, sender.userId);
  if (!senderAllowed) {
    sendError(deps, sender, "FORBIDDEN", "Forbidden");
    return null;
  }

  if (!(await deps.isAllowedGroupMemberDevice(activeRoom.group_id, sender.deviceId))) {
    sendError(deps, sender, "FORBIDDEN", "Forbidden");
    return null;
  }

  return { room: activeRoom, hasDeviceScopedPresence };
}

async function ensureTargetDeviceAllowed(
  deps: GroupCallSignalDeps,
  sender: GroupSignalSender,
  room: ActiveGroupSignalRoom,
  targetDeviceId: string,
  hasDeviceScopedPresence: boolean
): Promise<boolean> {
  const targetAllowedByPresence = hasDeviceScopedPresence
    ? await deps.hasGroupCallParticipantDevice(room.id, targetDeviceId)
    : true;
  const targetAllowedByMembership = await deps.isAllowedGroupMemberDevice(
    room.group_id,
    targetDeviceId
  );
  if (targetAllowedByPresence && targetAllowedByMembership) {
    return true;
  }

  sendError(
    deps,
    sender,
    "TARGET_DEVICE_NOT_ALLOWED",
    "Target device is not allowed for this group call"
  );
  return false;
}

function groupCallSignalLogContext(
  room: ActiveGroupSignalRoom,
  sender: GroupSignalSender,
  details: Record<string, unknown>
): Record<string, unknown> {
  return {
    callId: room.id,
    senderUserId: sender.userId,
    senderDeviceId: sender.deviceId,
    ...details,
  };
}

export async function handleGroupCallMediaKeySignal(
  deps: GroupCallSignalDeps,
  fastify: FastifyInstance,
  sender: GroupSignalSender,
  msg: GroupCallMediaKeyMessage
): Promise<void> {
  const roomAndPresence = await ensureRoomAndSenderAllowed(deps, sender, msg.callId);
  if (!roomAndPresence) return;
  const { room, hasDeviceScopedPresence } = roomAndPresence;

  if (
    !(await ensureTargetDeviceAllowed(
      deps,
      sender,
      room,
      msg.targetDeviceId,
      hasDeviceScopedPresence
    ))
  ) {
    return;
  }

  await deps.routeToDevice(msg.targetDeviceId, {
    type: "group.call.media-key",
    callId: room.id,
    senderUserId: sender.userId,
    senderDeviceId: sender.deviceId,
    targetDeviceId: msg.targetDeviceId,
    epoch: msg.epoch,
    keyId: msg.keyId,
    algorithm: msg.algorithm,
    encryptedKey: msg.encryptedKey,
    sentAt: new Date().toISOString(),
  });

  fastify.log.debug(
    groupCallSignalLogContext(room, sender, {
      targetDeviceId: msg.targetDeviceId,
      epoch: msg.epoch,
      keyId: msg.keyId,
    }),
    "WS group call media key routed"
  );
}

export async function handleGroupCallMediaKeyAckSignal(
  deps: GroupCallSignalDeps,
  fastify: FastifyInstance,
  sender: GroupSignalSender,
  msg: GroupCallMediaKeyAckMessage
): Promise<void> {
  const roomAndPresence = await ensureRoomAndSenderAllowed(deps, sender, msg.callId);
  if (!roomAndPresence) return;
  const { room, hasDeviceScopedPresence } = roomAndPresence;

  if (
    !(await ensureTargetDeviceAllowed(
      deps,
      sender,
      room,
      msg.targetDeviceId,
      hasDeviceScopedPresence
    ))
  ) {
    return;
  }

  await deps.routeToDevice(msg.targetDeviceId, {
    type: "group.call.media-key.ack",
    callId: room.id,
    senderUserId: sender.userId,
    senderDeviceId: sender.deviceId,
    targetDeviceId: msg.targetDeviceId,
    epoch: msg.epoch,
    keyId: msg.keyId,
    keyProof: msg.keyProof,
    ackedAt: new Date().toISOString(),
  });

  fastify.log.debug(
    groupCallSignalLogContext(room, sender, {
      targetDeviceId: msg.targetDeviceId,
      epoch: msg.epoch,
      keyId: msg.keyId,
    }),
    "WS group call media key ack routed"
  );
}

export async function handleGroupCallProducerStateSignal(
  deps: GroupCallSignalDeps,
  fastify: FastifyInstance,
  sender: GroupSignalSender,
  msg: GroupCallProducerStateMessage
): Promise<void> {
  if (msg.kind === "video" && !msg.source) {
    sendError(
      deps,
      sender,
      "INVALID_PAYLOAD",
      "Video producer state requires source"
    );
    return;
  }
  if (msg.kind === "audio" && msg.source !== undefined) {
    sendError(
      deps,
      sender,
      "INVALID_PAYLOAD",
      "Audio producer state must not declare video source"
    );
    return;
  }

  const roomAndPresence = await ensureRoomAndSenderAllowed(deps, sender, msg.callId);
  if (!roomAndPresence) return;
  const { room } = roomAndPresence;

  const payload: GroupProducerLifecycleEvent = {
    type: "group.call.producer_state",
    groupId: room.group_id,
    callId: room.id,
    userId: sender.userId,
    deviceId: sender.deviceId,
    sessionId: sender.sessionId ?? undefined,
    producerId: msg.producerId,
    kind: msg.kind,
    source: msg.source,
    state: msg.state,
    changedAt: new Date().toISOString(),
  };

  await deps.publishGroupProducerStateEvent(room.id, room.group_id, sender.deviceId, payload);

  fastify.log.debug(
    groupCallSignalLogContext(room, sender, {
      producerId: msg.producerId,
      kind: msg.kind,
      source: msg.source,
      state: msg.state,
    }),
    "WS group call producer state routed"
  );
}

export async function handleGroupCallMediaModeSignal(
  deps: GroupCallSignalDeps,
  fastify: FastifyInstance,
  sender: GroupSignalSender,
  msg: GroupCallMediaModeMessage
): Promise<void> {
  const roomAndPresence = await ensureRoomAndSenderAllowed(deps, sender, msg.callId);
  if (!roomAndPresence) return;
  const { room } = roomAndPresence;

  const payload: GroupMediaModeEvent = {
    type: "group.call.media-mode",
    groupId: room.group_id,
    callId: room.id,
    userId: sender.userId,
    deviceId: sender.deviceId,
    sessionId: sender.sessionId ?? undefined,
    mode: msg.mode,
    changedAt: new Date().toISOString(),
  };

  await deps.publishGroupMediaModeEvent(room.id, room.group_id, sender.deviceId, payload);

  fastify.log.debug(
    groupCallSignalLogContext(room, sender, {
      mode: msg.mode,
    }),
    "WS group call media mode routed"
  );
}
