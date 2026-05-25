import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import fastifyJwt from "@fastify/jwt";
import * as mediasoup from "mediasoup";
import { nanoid } from "nanoid";
import os from "node:os";
import type { FastifyReply, FastifyRequest } from "fastify";
import { FixedWindowRateLimiter } from "./http-rate-limit.js";
import { config } from "./config.js";
import {
  attachConsumer,
  attachProducer,
  attachTransport,
  buildPeerKey,
  cleanupStaleRooms,
  closePeer,
  createRoomRecord,
  findPeerByConsumer,
  findPeerByTransport,
  getOrCreatePeer,
  removeConsumer,
  removeProducer,
  removeTransport,
  touchPeer,
  touchRoom,
  type PeerIdentity,
  type RoomRecord,
} from "./room-state.js";
import {
  SFU_PROTOCOL_VERSION,
  SfuCloseProducerRequestSchema,
  SfuCloseProducerResponseSchema,
  SfuConnectTransportRequestSchema,
  SfuConnectTransportResponseSchema,
  SfuConsumeRequestSchema,
  SfuConsumeResponseSchema,
  SfuCreateTransportRequestSchema,
  SfuCreateTransportResponseSchema,
  SfuProduceRequestSchema,
  SfuProduceResponseSchema,
  SfuRoomAccessResponseSchema,
  SfuRoomProducersResponseSchema,
  SfuRtpCapabilitiesResponseSchema,
  SfuResumeConsumerRequestSchema,
  SfuResumeConsumerResponseSchema,
  safeParseVersionedWire,
} from "@seclettr/protocol";
import { normalizeSfuRtpParameters } from "./rtp-parameters.js";
import { parseVersionedOrReply } from "./validation.js";

type Worker = mediasoup.types.Worker;
type Router = mediasoup.types.Router;
type WebRtcTransport = mediasoup.types.WebRtcTransport;
type Producer = mediasoup.types.Producer;
type Consumer = mediasoup.types.Consumer;
type RouterRtpCodecCapability = mediasoup.types.RouterRtpCodecCapability;

// Config is loaded and validated at import time in config.ts.
const {
  PORT,
  TRUST_PROXY,
  ANNOUNCED_IP,
  JWT_SECRET,
  API_INTERNAL_URL,
  MIN_PORT,
  MAX_PORT,
  ROOM_ACCESS_TIMEOUT_MS,
  PEER_TTL_MS,
  EMPTY_ROOM_TTL_MS,
  CLEANUP_INTERVAL_MS,
  RATE_LIMIT_WINDOW_MS: SFU_RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS: SFU_RATE_LIMIT_MAX_REQUESTS,
} = config;

interface SfuAuthPayload {
  sub: string;
  deviceId?: string;
  sessionId?: string;
  tokenUse?: string;
  iat?: number;
  exp?: number;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: SfuAuthPayload;
  }
}

const mediaCodecs: RouterRtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: { "sprop-stereo": 1, usedtx: 1, useinbandfec: 1 },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 1000 },
  },
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    parameters: {
      "profile-id": 2,
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 1000,
    },
  },
];

type Room = RoomRecord<Router, WebRtcTransport, Producer, Consumer>;

const workers: Worker[] = [];
let workerIndex = 0;
const rooms = new Map<string, Room>();
const requestRateLimiter = new FixedWindowRateLimiter({
  maxRequests: Math.max(SFU_RATE_LIMIT_MAX_REQUESTS, 1),
  windowMs: Math.max(SFU_RATE_LIMIT_WINDOW_MS, 1000),
});
let cleanupTimer: NodeJS.Timeout | null = null;

async function requireSfuAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    request.auth = request.user as SfuAuthPayload;
    if (
      request.auth.tokenUse !== undefined &&
      request.auth.tokenUse !== "access"
    ) {
      await reply.code(401).send({ error: "Unauthorized" });
    }
  } catch {
    await reply.code(401).send({ error: "Unauthorized" });
  }
}

async function requireSfuRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const decision = requestRateLimiter.check(buildRateLimitKey(request));
  void reply.header("X-RateLimit-Remaining", String(decision.remaining));
  if (!decision.allowed) {
    void reply.header(
      "Retry-After",
      String(Math.max(Math.ceil(decision.retryAfterMs / 1000), 1))
    );
    await reply.code(429).send({ error: "Too Many Requests" });
  }
}

function getNextWorker(): Worker {
  const worker = workers[workerIndex % workers.length];
  workerIndex++;
  if (!worker) throw new Error("No workers available");
  return worker;
}

async function getOrCreateRoom(roomId: string): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) {
    touchRoom(existing);
    return existing;
  }
  const worker = getNextWorker();
  const router = await worker.createRouter({ mediaCodecs });
  const room = createRoomRecord<Router, WebRtcTransport, Producer, Consumer>(
    roomId,
    router
  );
  rooms.set(roomId, room);
  return room;
}

function getPeerIdentity(auth: SfuAuthPayload): PeerIdentity {
  return {
    userId: auth.sub,
    deviceId: auth.deviceId ?? null,
    sessionId: auth.sessionId ?? null,
  };
}

function getPeerKeyFromAuth(auth: SfuAuthPayload): string {
  return buildPeerKey(getPeerIdentity(auth));
}

function buildRateLimitKey(request: FastifyRequest): string {
  const ip = request.ip || "unknown-ip";
  const auth = request.auth;
  if (!auth) {
    return `anon:${ip}`;
  }
  return `auth:${auth.sub}:${auth.deviceId ?? "legacy-device"}:${ip}`;
}

function getAuthorizationHeader(request: FastifyRequest): string | null {
  const authHeader: unknown = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.trim().length > 0) {
    return authHeader;
  }
  if (Array.isArray(authHeader)) {
    const first = (authHeader as string[]).find((v) => v.trim().length > 0);
    return first ?? null;
  }
  return null;
}

async function ensureRoomAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  roomId: string
): Promise<boolean> {
  const authorization = getAuthorizationHeader(request);
  if (!authorization) {
    await reply.code(401).send({ error: "Unauthorized" });
    return false;
  }

  let response: Response;
  try {
    response = await fetch(`${API_INTERNAL_URL}/calls/${roomId}/sfu-access`, {
      method: "GET",
      headers: {
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(ROOM_ACCESS_TIMEOUT_MS),
    });
  } catch (err) {
    request.log.warn({ err, roomId }, "SFU room access check failed");
    await reply.code(503).send({ error: "Room authorization unavailable" });
    return false;
  }

  if (response.status === 200) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      await reply
        .code(502)
        .send({ error: "Invalid room authorization response" });
      return false;
    }
    const parsed = safeParseVersionedWire(
      SfuRoomAccessResponseSchema,
      body,
      SFU_PROTOCOL_VERSION
    );
    if (!parsed.success) {
      await reply
        .code(502)
        .send({ error: "Invalid room authorization response" });
      return false;
    }
    return true;
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404
  ) {
    let errorMessage = "Forbidden";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim().length > 0) {
        errorMessage = body.error;
      }
    } catch { /* ignore parse errors */ }
    await reply.code(response.status).send({ error: errorMessage });
    return false;
  }

  await reply.code(502).send({ error: "Room authorization failed" });
  return false;
}

const MAX_RESPAWN_ATTEMPTS = 8;
const RESPAWN_BASE_DELAY_MS = 500;
const RESPAWN_MAX_DELAY_MS = 30_000;

async function spawnWorker(): Promise<Worker> {
  const worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: MIN_PORT,
    rtcMaxPort: MAX_PORT,
  });
  worker.on("died", () => {
    console.error(`mediasoup worker ${worker.pid} died — evicting rooms and respawning`);

    // Remove dead worker from the pool.
    const idx = workers.indexOf(worker);
    if (idx !== -1) workers.splice(idx, 1);

    // Evict rooms whose router is now closed (owned by the dead worker).
    for (const [roomId, room] of rooms) {
      if (room.router.closed) {
        rooms.delete(roomId);
        console.warn(`[sfu] evicted room ${roomId} after worker death`);
      }
    }

    if (workers.length === 0) {
      console.error("[sfu] all mediasoup workers are dead — new calls will fail until respawn");
    }

    // Attempt to spawn a replacement worker with exponential backoff.
    void respawnWithBackoff(1);
  });
  return worker;
}

async function respawnWithBackoff(attempt: number): Promise<void> {
  if (attempt > MAX_RESPAWN_ATTEMPTS) {
    console.error(
      `[sfu] mediasoup worker failed to respawn after ${MAX_RESPAWN_ATTEMPTS} attempts — giving up`
    );
    return;
  }
  const delay = Math.min(
    RESPAWN_BASE_DELAY_MS * Math.pow(2, attempt - 1),
    RESPAWN_MAX_DELAY_MS
  );
  console.info(`[sfu] respawn attempt ${attempt}/${MAX_RESPAWN_ATTEMPTS} in ${delay}ms`);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
  try {
    const w = await spawnWorker();
    workers.push(w);
    console.info(`[sfu] replacement worker ${w.pid} spawned (attempt ${attempt})`);
  } catch (err) {
    console.error(`[sfu] respawn attempt ${attempt} failed:`, err);
    void respawnWithBackoff(attempt + 1);
  }
}

async function main() {
  const numWorkers = Math.min(os.cpus().length, 4);
  for (let i = 0; i < numWorkers; i++) {
    workers.push(await spawnWorker());
  }
  console.log(`Spawned ${numWorkers} mediasoup workers`);

  const fastify = Fastify({
    logger: { level: "info" },
    trustProxy: TRUST_PROXY,
  });
  fastify.addHook("onRequest", async (request, reply) => {
    const contentType = request.headers["content-type"];
    if (typeof contentType === "string" && /[\t\r\n]/.test(contentType)) {
      return reply.code(400).send({ error: "Invalid Content-Type header" });
    }
  });

  await fastify.register(fastifyCors, {
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
    credentials: true,
  });
  await fastify.register(fastifyWebsocket);
  await fastify.register(fastifyJwt, {
    secret: JWT_SECRET,
    verify: { algorithms: ["HS256"] },
  });

  cleanupTimer = setInterval(() => {
    const result = cleanupStaleRooms(rooms, {
      peerTtlMs: Math.max(PEER_TTL_MS, 1000),
      emptyRoomTtlMs: Math.max(EMPTY_ROOM_TTL_MS, 1000),
    });
    if (result.removedPeers > 0 || result.removedRooms > 0) {
      fastify.log.info(result, "SFU stale cleanup completed");
    }
  }, Math.max(CLEANUP_INTERVAL_MS, 1000));
  cleanupTimer.unref();

  fastify.get<{ Params: { roomId: string } }>(
    "/rooms/:roomId/rtp-capabilities",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      if (!(await ensureRoomAccess(request, reply, request.params.roomId)))
        return;
      const room = await getOrCreateRoom(request.params.roomId);
      touchRoom(room);
      return SfuRtpCapabilitiesResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        rtpCapabilities: room.router.rtpCapabilities,
      });
    }
  );

  fastify.post(
    "/transports",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      const body = parseVersionedOrReply(
        reply,
        SfuCreateTransportRequestSchema,
        request.body,
        SFU_PROTOCOL_VERSION
      );
      if (!body) return;
      if (body.userId !== request.auth.sub) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      if (!(await ensureRoomAccess(request, reply, body.roomId))) return;
      const room = await getOrCreateRoom(body.roomId);
      const peer = getOrCreatePeer(room, getPeerIdentity(request.auth), () =>
        nanoid()
      );

      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: ANNOUNCED_IP }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1_000_000,
      });

      attachTransport(room, peer, transport.id, transport);
      transport.on("dtlsstatechange", (state) => {
        if (state === "closed") {
          removeTransport(room, peer, transport.id);
        }
      });

      return SfuCreateTransportResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        transportId: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    }
  );

  fastify.post(
    "/transports/connect",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      const body = parseVersionedOrReply(
        reply,
        SfuConnectTransportRequestSchema,
        request.body,
        SFU_PROTOCOL_VERSION
      );
      if (!body) return;
      if (!(await ensureRoomAccess(request, reply, body.roomId))) return;
      const room = rooms.get(body.roomId);
      if (!room) return reply.code(404).send({ error: "Room not found" });

      const owned = findPeerByTransport(room, body.transportId);
      if (!owned) return reply.code(404).send({ error: "Transport not found" });
      if (owned.peer.peerKey !== getPeerKeyFromAuth(request.auth)) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      touchPeer(owned.peer);
      touchRoom(room);
      await owned.transport.connect({
        dtlsParameters: body.dtlsParameters as mediasoup.types.DtlsParameters,
      });
      return SfuConnectTransportResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        ok: true,
      });
    }
  );

  fastify.post(
    "/produce",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      const body = parseVersionedOrReply(
        reply,
        SfuProduceRequestSchema,
        request.body,
        SFU_PROTOCOL_VERSION
      );
      if (!body) return;
      if (!(await ensureRoomAccess(request, reply, body.roomId))) return;
      const room = rooms.get(body.roomId);
      if (!room) return reply.code(404).send({ error: "Room not found" });

      const owned = findPeerByTransport(room, body.transportId);
      if (!owned) return reply.code(404).send({ error: "Transport not found" });
      if (owned.peer.peerKey !== getPeerKeyFromAuth(request.auth)) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      const producer = await owned.transport.produce({
        kind: body.kind,
        rtpParameters: normalizeSfuRtpParameters(
          body.rtpParameters as mediasoup.types.RtpParameters
        ) as mediasoup.types.RtpParameters,
      });
      const producerSource =
        body.kind === "video" ? body.source ?? "camera" : null;
      attachProducer(room, owned.peer, producer.id, producer, producerSource);
      producer.on("transportclose", () => {
        removeProducer(room, owned.peer, producer.id);
      });

      return SfuProduceResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        producerId: producer.id,
      });
    }
  );

  fastify.post<{ Params: { producerId: string } }>(
    "/producers/:producerId/close",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      const { producerId } = request.params;
      const body = parseVersionedOrReply(
        reply,
        SfuCloseProducerRequestSchema,
        request.body,
        SFU_PROTOCOL_VERSION
      );
      if (!body) return;
      if (!(await ensureRoomAccess(request, reply, body.roomId))) return;

      const room = rooms.get(body.roomId);
      if (!room) {
        return SfuCloseProducerResponseSchema.parse({
          version: SFU_PROTOCOL_VERSION,
          ok: true,
        });
      }

      const ownerKey = room.producerOwners.get(producerId);
      if (!ownerKey) {
        return SfuCloseProducerResponseSchema.parse({
          version: SFU_PROTOCOL_VERSION,
          ok: true,
        });
      }
      if (ownerKey !== getPeerKeyFromAuth(request.auth)) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      const peer = room.peers.get(ownerKey);
      const producer = peer?.producers.get(producerId);
      if (!peer || !producer) {
        room.producerOwners.delete(producerId);
        room.producerSources.delete(producerId);
        return SfuCloseProducerResponseSchema.parse({
          version: SFU_PROTOCOL_VERSION,
          ok: true,
        });
      }

      touchPeer(peer);
      touchRoom(room);
      producer.close();
      removeProducer(room, peer, producerId);
      return SfuCloseProducerResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        ok: true,
      });
    }
  );

  fastify.post(
    "/consume",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      const body = parseVersionedOrReply(
        reply,
        SfuConsumeRequestSchema,
        request.body,
        SFU_PROTOCOL_VERSION
      );
      if (!body) return;
      if (body.userId !== request.auth.sub) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      if (!(await ensureRoomAccess(request, reply, body.roomId))) return;

      const room = rooms.get(body.roomId);
      if (!room) return reply.code(404).send({ error: "Room not found" });

      const peerKey = getPeerKeyFromAuth(request.auth);
      const peer = room.peers.get(peerKey);
      if (!peer) return reply.code(404).send({ error: "Peer not found" });
      const owned = findPeerByTransport(room, body.transportId);
      if (!owned) return reply.code(404).send({ error: "Transport not found" });
      if (owned.peer.peerKey !== peerKey) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      if (
        !room.router.canConsume({
          producerId: body.producerId,
          rtpCapabilities:
            body.rtpCapabilities as mediasoup.types.RtpCapabilities,
        })
      ) {
        return reply.code(400).send({ error: "Cannot consume" });
      }

      const consumer = await owned.transport.consume({
        producerId: body.producerId,
        rtpCapabilities:
          body.rtpCapabilities as mediasoup.types.RtpCapabilities,
        paused: true,
      });
      attachConsumer(room, peer, consumer.id, consumer);
      consumer.on("transportclose", () => {
        removeConsumer(room, peer, consumer.id);
      });
      consumer.on("producerclose", () => {
        removeConsumer(room, peer, consumer.id);
      });

      return SfuConsumeResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        consumerId: consumer.id,
        producerId: body.producerId,
        kind: consumer.kind,
        rtpParameters: normalizeSfuRtpParameters(consumer.rtpParameters),
      });
    }
  );

  fastify.post<{
    Params: { consumerId: string };
    Body: { roomId: string; userId: string };
  }>(
    "/consumers/:consumerId/resume",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      const { consumerId } = request.params;
      const body = parseVersionedOrReply(
        reply,
        SfuResumeConsumerRequestSchema,
        request.body,
        SFU_PROTOCOL_VERSION
      );
      if (!body) return;
      const { roomId, userId } = body;
      if (userId !== request.auth.sub) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      if (!(await ensureRoomAccess(request, reply, roomId))) return;
      const room = rooms.get(roomId);
      if (!room) return reply.code(404).send({ error: "Room not found" });
      const owned = findPeerByConsumer(room, consumerId);
      if (!owned) return reply.code(404).send({ error: "Consumer not found" });
      if (owned.peer.peerKey !== getPeerKeyFromAuth(request.auth)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      touchPeer(owned.peer);
      touchRoom(room);
      await owned.consumer.resume();
      return SfuResumeConsumerResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        ok: true,
      });
    }
  );

  fastify.get<{ Params: { roomId: string } }>(
    "/rooms/:roomId/producers",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      if (!(await ensureRoomAccess(request, reply, request.params.roomId)))
        return;
      const room = rooms.get(request.params.roomId);
      if (!room) return reply.code(404).send({ error: "Room not found" });
      const peerKey = getPeerKeyFromAuth(request.auth);
      const currentPeer = room.peers.get(peerKey);
      if (!currentPeer) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      touchPeer(currentPeer);
      touchRoom(room);

      const producers: Array<{
        producerId: string;
        userId: string;
        deviceId?: string;
        sessionId?: string;
        kind: "audio" | "video";
        source?: "camera" | "screen";
      }> = [];
      for (const peer of room.peers.values()) {
        for (const [producerId, producer] of peer.producers) {
          const producerInfo: {
            producerId: string;
            userId: string;
            deviceId?: string;
            sessionId?: string;
            kind: "audio" | "video";
            source?: "camera" | "screen";
          } = {
            producerId,
            userId: peer.userId,
            kind: producer.kind,
          };
          if (peer.deviceId) {
            producerInfo.deviceId = peer.deviceId;
          }
          if (peer.sessionId) {
            producerInfo.sessionId = peer.sessionId;
          }
          const producerSource = room.producerSources.get(producerId);
          if (producerSource) {
            producerInfo.source = producerSource;
          }
          producers.push(producerInfo);
        }
      }
      return SfuRoomProducersResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        producers,
      });
    }
  );

  fastify.delete<{ Params: { roomId: string; userId: string } }>(
    "/rooms/:roomId/peers/:userId",
    { preHandler: [requireSfuAuth, requireSfuRateLimit] },
    async (request, reply) => {
      const { roomId, userId } = request.params;
      if (userId !== request.auth.sub) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const room = rooms.get(roomId);
      if (!room) return { ok: true };
      closePeer(room, getPeerKeyFromAuth(request.auth));

      if (room.peers.size === 0) {
        room.router.close();
        rooms.delete(roomId);
      }

      return SfuCloseProducerResponseSchema.parse({
        version: SFU_PROTOCOL_VERSION,
        ok: true,
      });
    }
  );

  // GET /health/live — process liveness (no worker check, cheap)
  fastify.get("/health/live", () => ({ status: "ok" }));

  // GET /health/ready — readiness: requires at least one live mediasoup worker
  fastify.get("/health/ready", async (_request, reply) => {
    const alive = workers.filter((w) => !w.closed).length;
    if (alive === 0) {
      return reply.code(503).send({
        status: "degraded",
        reason: "no live mediasoup workers",
        topology: config.TOPOLOGY,
      });
    }
    return {
      status: "ok",
      topology: config.TOPOLOGY,
      workers: alive,
      rooms: rooms.size,
    };
  });

  // GET /health — legacy alias for /health/ready
  fastify.get("/health", async (_request, reply) => {
    const alive = workers.filter((w) => !w.closed).length;
    if (alive === 0) {
      return reply.code(503).send({ status: "degraded", workers: 0 });
    }
    return { status: "ok", workers: alive, rooms: rooms.size };
  });

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  console.log(
    `[sfu] Listening on port ${PORT} | topology=${config.TOPOLOGY} | workers=${workers.length} | announcedIp=${ANNOUNCED_IP}`
  );
  if (ANNOUNCED_IP === "127.0.0.1" || ANNOUNCED_IP === "localhost") {
    console.warn(
      "[sfu] WARNING: ANNOUNCED_IP is set to localhost. Remote clients will not be able to establish WebRTC connections. Set ANNOUNCED_IP to the public/LAN IP in production."
    );
  }

  process.on("SIGTERM", () => {
    void (async () => {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }

      const forceExitTimer = setTimeout(() => {
        console.error("SFU graceful shutdown timed out — forcing exit");
        process.exit(1);
      }, 10_000).unref();

      await fastify.close();
      for (const w of workers) w.close();
      clearTimeout(forceExitTimer);
    })();
  });
}

try {
  await main();
} catch (err) {
  console.error("SFU startup failed:", err);
  process.exit(1);
}
