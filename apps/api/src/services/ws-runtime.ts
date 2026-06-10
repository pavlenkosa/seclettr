import type { WebSocket } from "ws";
import type { WsServerMessage } from "@seclettr/protocol";
import { toWsServerWireMessage } from "@seclettr/protocol";
import { loadUserDeviceIds } from "./group-call-participant-routing.js";
import { redis, hasRegisteredUserSocket, publishMessage } from "./redis.js";
import { WsConnectionIndex } from "./ws-connection-index.js";
import {
  createCallSessionStore,
  createDirectCallLifecycleManager,
} from "./call-routing-state.js";
import { createDirectCallSignalRouter } from "./ws-direct-call-router.js";
import { WsRateLimiter } from "./ws-rate-limit.js";

export interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  sessionId: string | null;
  socketId: string;
  joinedRoomIds: Set<string>;
}

function routeToDevice(
  deviceId: string,
  msg: WsServerMessage
): Promise<void> {
  return publishMessage({
    ...msg,
    recipientDeviceId: deviceId,
  });
}

function routeToDevices(
  deviceIds: string[],
  msg: WsServerMessage
): Promise<void> {
  const uniqueTargets = [...new Set(deviceIds)];
  if (uniqueTargets.length === 0) return Promise.resolve();
  return Promise.all(
    uniqueTargets.map((deviceId) => routeToDevice(deviceId, msg))
  ).then(() => undefined);
}

export function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(toWsServerWireMessage(msg)));
  }
}

export interface WebSocketRuntime {
  connections: WsConnectionIndex<ConnectedClient>;
  callSessionStore: ReturnType<typeof createCallSessionStore>;
  directCallLifecycleManager: ReturnType<typeof createDirectCallLifecycleManager>;
  directCallSignalRouter: ReturnType<typeof createDirectCallSignalRouter>;
  wsRateLimiter: WsRateLimiter;
  routeToDevice: typeof routeToDevice;
  routeToDevices: typeof routeToDevices;
}

export function createWebSocketRuntime(): WebSocketRuntime {
  const connections = new WsConnectionIndex<ConnectedClient>();

  function hasActiveConnectionForDevice(deviceId: string): boolean {
    return connections.hasActiveConnectionForDevice(deviceId);
  }

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

  return {
    connections,
    callSessionStore,
    directCallLifecycleManager,
    directCallSignalRouter,
    wsRateLimiter: new WsRateLimiter(),
    routeToDevice,
    routeToDevices,
  };
}

let runtime: WebSocketRuntime | null = null;

export function ensureWebSocketRuntime(): WebSocketRuntime {
  if (!runtime) {
    runtime = createWebSocketRuntime();
  }
  return runtime;
}

export async function hasActiveConnectionForUserAcrossCluster(
  userId: string
): Promise<boolean> {
  const rt = ensureWebSocketRuntime();
  if (rt.connections.hasActiveConnectionForUser(userId)) {
    return true;
  }
  return hasRegisteredUserSocket(userId);
}
