/**
 * DEPLOYMENT NOTE: Room state is intentionally single-process in-memory only.
 * This SFU instance cannot be horizontally scaled — all participants in a room
 * must connect to the same SFU process.
 * For multi-node deployments, replace this in-memory store with a distributed
 * room-state backend (e.g. Redis-backed room registry with SFU placement routing).
 */

export interface Closable {
  close(): void;
}

export type ProducerSource = "camera" | "screen";

export interface PeerIdentity {
  userId: string;
  deviceId?: string | null;
  sessionId?: string | null;
}

export interface PeerRecord<
  TTransport extends Closable = Closable,
  TProducer extends Closable = Closable,
  TConsumer extends Closable = Closable,
> {
  peerId: string;
  peerKey: string;
  userId: string;
  deviceId: string | null;
  sessionId: string | null;
  lastSeenAt: number;
  transports: Map<string, TTransport>;
  producers: Map<string, TProducer>;
  consumers: Map<string, TConsumer>;
}

export interface RoomRecord<
  TRouter extends Closable = Closable,
  TTransport extends Closable = Closable,
  TProducer extends Closable = Closable,
  TConsumer extends Closable = Closable,
> {
  roomId: string;
  router: TRouter;
  peers: Map<string, PeerRecord<TTransport, TProducer, TConsumer>>;
  transportOwners: Map<string, string>;
  producerOwners: Map<string, string>;
  consumerOwners: Map<string, string>;
  producerSources: Map<string, ProducerSource>;
  createdAt: number;
  lastActiveAt: number;
}

export interface PeerTransportLookup<
  TTransport extends Closable = Closable,
  TProducer extends Closable = Closable,
  TConsumer extends Closable = Closable,
> {
  peer: PeerRecord<TTransport, TProducer, TConsumer>;
  transport: TTransport;
}

export interface PeerConsumerLookup<
  TTransport extends Closable = Closable,
  TProducer extends Closable = Closable,
  TConsumer extends Closable = Closable,
> {
  peer: PeerRecord<TTransport, TProducer, TConsumer>;
  consumer: TConsumer;
}

export interface CleanupOptions {
  peerTtlMs: number;
  emptyRoomTtlMs: number;
  now?: number;
}

export interface CleanupResult {
  removedPeers: number;
  removedRooms: number;
}

export function createRoomRecord<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(roomId: string, router: TRouter, now = Date.now()): RoomRecord<TRouter, TTransport, TProducer, TConsumer> {
  return {
    roomId,
    router,
    peers: new Map(),
    transportOwners: new Map(),
    producerOwners: new Map(),
    consumerOwners: new Map(),
    producerSources: new Map(),
    createdAt: now,
    lastActiveAt: now,
  };
}

export function buildPeerKey(identity: PeerIdentity): string {
  const devicePart = identity.deviceId?.trim() ? identity.deviceId.trim() : "legacy-device";
  const sessionPart = identity.sessionId?.trim() ? identity.sessionId.trim() : "legacy-session";
  return `${identity.userId}:${devicePart}:${sessionPart}`;
}

export function getOrCreatePeer<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  identity: PeerIdentity,
  createPeerId: () => string,
  now = Date.now()
): PeerRecord<TTransport, TProducer, TConsumer> {
  touchRoom(room, now);
  const peerKey = buildPeerKey(identity);
  const existing = room.peers.get(peerKey);
  if (existing) {
    touchPeer(existing, now);
    return existing;
  }

  const peer: PeerRecord<TTransport, TProducer, TConsumer> = {
    peerId: createPeerId(),
    peerKey,
    userId: identity.userId,
    deviceId: identity.deviceId?.trim() || null,
    sessionId: identity.sessionId?.trim() || null,
    lastSeenAt: now,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  };
  room.peers.set(peerKey, peer);
  return peer;
}

export function touchPeer<
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(peer: PeerRecord<TTransport, TProducer, TConsumer>, now = Date.now()): void {
  peer.lastSeenAt = now;
}

export function touchRoom<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>, now = Date.now()): void {
  room.lastActiveAt = now;
}

export function attachTransport<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  peer: PeerRecord<TTransport, TProducer, TConsumer>,
  transportId: string,
  transport: TTransport,
  now = Date.now()
): void {
  peer.transports.set(transportId, transport);
  room.transportOwners.set(transportId, peer.peerKey);
  touchPeer(peer, now);
  touchRoom(room, now);
}

export function attachProducer<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  peer: PeerRecord<TTransport, TProducer, TConsumer>,
  producerId: string,
  producer: TProducer,
  source: ProducerSource | null = null,
  now = Date.now()
): void {
  peer.producers.set(producerId, producer);
  room.producerOwners.set(producerId, peer.peerKey);
  if (source) {
    room.producerSources.set(producerId, source);
  } else {
    room.producerSources.delete(producerId);
  }
  touchPeer(peer, now);
  touchRoom(room, now);
}

export function attachConsumer<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  peer: PeerRecord<TTransport, TProducer, TConsumer>,
  consumerId: string,
  consumer: TConsumer,
  now = Date.now()
): void {
  peer.consumers.set(consumerId, consumer);
  room.consumerOwners.set(consumerId, peer.peerKey);
  touchPeer(peer, now);
  touchRoom(room, now);
}

export function findPeerByTransport<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  transportId: string
): PeerTransportLookup<TTransport, TProducer, TConsumer> | null {
  const peerKey = room.transportOwners.get(transportId);
  if (!peerKey) {
    return null;
  }
  const peer = room.peers.get(peerKey);
  const transport = peer?.transports.get(transportId);
  if (!peer || !transport) {
    room.transportOwners.delete(transportId);
    return null;
  }
  return { peer, transport };
}

export function findPeerByConsumer<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  consumerId: string
): PeerConsumerLookup<TTransport, TProducer, TConsumer> | null {
  const peerKey = room.consumerOwners.get(consumerId);
  if (!peerKey) {
    return null;
  }
  const peer = room.peers.get(peerKey);
  const consumer = peer?.consumers.get(consumerId);
  if (!peer || !consumer) {
    room.consumerOwners.delete(consumerId);
    return null;
  }
  return { peer, consumer };
}

export function removeTransport<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  peer: PeerRecord<TTransport, TProducer, TConsumer>,
  transportId: string
): void {
  peer.transports.delete(transportId);
  room.transportOwners.delete(transportId);
}

export function removeProducer<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  peer: PeerRecord<TTransport, TProducer, TConsumer>,
  producerId: string
): void {
  peer.producers.delete(producerId);
  room.producerOwners.delete(producerId);
  room.producerSources.delete(producerId);
}

export function removeConsumer<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  peer: PeerRecord<TTransport, TProducer, TConsumer>,
  consumerId: string
): void {
  peer.consumers.delete(consumerId);
  room.consumerOwners.delete(consumerId);
}

export function closePeer<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  room: RoomRecord<TRouter, TTransport, TProducer, TConsumer>,
  peerKey: string,
  now = Date.now()
): boolean {
  const peer = room.peers.get(peerKey);
  if (!peer) {
    return false;
  }

  for (const [transportId, transport] of peer.transports) {
    safeClose(transport);
    room.transportOwners.delete(transportId);
  }
  for (const [producerId, producer] of peer.producers) {
    safeClose(producer);
    room.producerOwners.delete(producerId);
    room.producerSources.delete(producerId);
  }
  for (const [consumerId, consumer] of peer.consumers) {
    safeClose(consumer);
    room.consumerOwners.delete(consumerId);
  }

  peer.transports.clear();
  peer.producers.clear();
  peer.consumers.clear();
  room.peers.delete(peerKey);
  touchRoom(room, now);
  return true;
}

export function cleanupStaleRooms<
  TRouter extends Closable,
  TTransport extends Closable,
  TProducer extends Closable,
  TConsumer extends Closable,
>(
  rooms: Map<string, RoomRecord<TRouter, TTransport, TProducer, TConsumer>>,
  options: CleanupOptions
): CleanupResult {
  const now = options.now ?? Date.now();
  let removedPeers = 0;
  let removedRooms = 0;

  for (const [roomId, room] of rooms) {
    for (const [peerKey, peer] of room.peers) {
      if (now - peer.lastSeenAt > options.peerTtlMs) {
        if (closePeer(room, peerKey, now)) {
          removedPeers += 1;
        }
      }
    }

    if (room.peers.size === 0 && now - room.lastActiveAt > options.emptyRoomTtlMs) {
      safeClose(room.router);
      rooms.delete(roomId);
      removedRooms += 1;
    }
  }

  return { removedPeers, removedRooms };
}

function safeClose(target: Closable): void {
  try {
    target.close();
  } catch {
  }
}
