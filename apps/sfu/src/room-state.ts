/**
 * DEPLOYMENT NOTE: Room state is intentionally single-process in-memory only.
 * This SFU instance cannot be horizontally scaled — all participants in a room
 * must connect to the same SFU process.
 * For multi-node deployments, replace this in-memory store with a distributed
 * room-state backend (e.g. Redis-backed room registry with SFU placement routing).
 *
 * Generic params (single-letter for brevity):
 *   R — Router (mediasoup.Router)
 *   T — Transport (mediasoup.WebRtcTransport)
 *   P — Producer (mediasoup.Producer)
 *   C — Consumer (mediasoup.Consumer)
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

export interface PeerRecord<T extends Closable = Closable, P extends Closable = Closable, C extends Closable = Closable> {
  peerId: string;
  peerKey: string;
  userId: string;
  deviceId: string | null;
  sessionId: string | null;
  lastSeenAt: number;
  transports: Map<string, T>;
  producers: Map<string, P>;
  consumers: Map<string, C>;
}

export interface RoomRecord<R extends Closable = Closable, T extends Closable = Closable, P extends Closable = Closable, C extends Closable = Closable> {
  roomId: string;
  router: R;
  peers: Map<string, PeerRecord<T, P, C>>;
  transportOwners: Map<string, string>;
  producerOwners: Map<string, string>;
  consumerOwners: Map<string, string>;
  producerSources: Map<string, ProducerSource>;
  createdAt: number;
  lastActiveAt: number;
}

export interface PeerTransportLookup<T extends Closable = Closable, P extends Closable = Closable, C extends Closable = Closable> {
  peer: PeerRecord<T, P, C>;
  transport: T;
}

export interface PeerConsumerLookup<T extends Closable = Closable, P extends Closable = Closable, C extends Closable = Closable> {
  peer: PeerRecord<T, P, C>;
  consumer: C;
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

export function createRoomRecord<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  roomId: string, router: R, now = Date.now()
): RoomRecord<R, T, P, C> {
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

export function getOrCreatePeer<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  identity: PeerIdentity,
  createPeerId: () => string,
  now = Date.now()
): PeerRecord<T, P, C> {
  touchRoom(room, now);
  const peerKey = buildPeerKey(identity);
  const existing = room.peers.get(peerKey);
  if (existing) {
    touchPeer(existing, now);
    return existing;
  }

  const peer: PeerRecord<T, P, C> = {
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

export function touchPeer<T extends Closable, P extends Closable, C extends Closable>(
  peer: PeerRecord<T, P, C>, now = Date.now()
): void {
  peer.lastSeenAt = now;
}

export function touchRoom<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>, now = Date.now()
): void {
  room.lastActiveAt = now;
}

export function attachTransport<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  peer: PeerRecord<T, P, C>,
  transportId: string,
  transport: T,
  now = Date.now()
): void {
  peer.transports.set(transportId, transport);
  room.transportOwners.set(transportId, peer.peerKey);
  touchPeer(peer, now);
  touchRoom(room, now);
}

export function attachProducer<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  peer: PeerRecord<T, P, C>,
  producerId: string,
  producer: P,
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

export function attachConsumer<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  peer: PeerRecord<T, P, C>,
  consumerId: string,
  consumer: C,
  now = Date.now()
): void {
  peer.consumers.set(consumerId, consumer);
  room.consumerOwners.set(consumerId, peer.peerKey);
  touchPeer(peer, now);
  touchRoom(room, now);
}

export function findPeerByTransport<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  transportId: string
): PeerTransportLookup<T, P, C> | null {
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

export function findPeerByConsumer<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  consumerId: string
): PeerConsumerLookup<T, P, C> | null {
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

export function removeTransport<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  peer: PeerRecord<T, P, C>,
  transportId: string
): void {
  peer.transports.delete(transportId);
  room.transportOwners.delete(transportId);
}

export function removeProducer<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  peer: PeerRecord<T, P, C>,
  producerId: string
): void {
  peer.producers.delete(producerId);
  room.producerOwners.delete(producerId);
  room.producerSources.delete(producerId);
}

export function removeConsumer<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
  peer: PeerRecord<T, P, C>,
  consumerId: string
): void {
  peer.consumers.delete(consumerId);
  room.consumerOwners.delete(consumerId);
}

export function closePeer<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  room: RoomRecord<R, T, P, C>,
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

export function cleanupStaleRooms<R extends Closable, T extends Closable, P extends Closable, C extends Closable>(
  rooms: Map<string, RoomRecord<R, T, P, C>>,
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
