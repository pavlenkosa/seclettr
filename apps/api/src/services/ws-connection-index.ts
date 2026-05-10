import type { WebSocket } from "ws";

export interface WsIndexedClient {
  socketId: string;
  userId: string;
  deviceId: string;
  ws: WebSocket;
}

export class WsConnectionIndex<TClient extends WsIndexedClient> {
  private readonly bySocketId = new Map<string, TClient>();
  private readonly socketIdsByDeviceId = new Map<string, Set<string>>();
  private readonly socketIdsByUserId = new Map<string, Set<string>>();

  add(client: TClient): void {
    this.bySocketId.set(client.socketId, client);

    const byDevice = this.socketIdsByDeviceId.get(client.deviceId);
    if (byDevice) {
      byDevice.add(client.socketId);
    } else {
      this.socketIdsByDeviceId.set(client.deviceId, new Set([client.socketId]));
    }

    const byUser = this.socketIdsByUserId.get(client.userId);
    if (byUser) {
      byUser.add(client.socketId);
    } else {
      this.socketIdsByUserId.set(client.userId, new Set([client.socketId]));
    }
  }

  remove(socketId: string): TClient | null {
    const existingClient = this.bySocketId.get(socketId);
    if (!existingClient) {
      return null;
    }
    this.bySocketId.delete(socketId);

    const existingSocketIds = this.socketIdsByDeviceId.get(existingClient.deviceId);
    if (existingSocketIds) {
      existingSocketIds.delete(socketId);
      if (existingSocketIds.size === 0) {
        this.socketIdsByDeviceId.delete(existingClient.deviceId);
      }
    }

    const userSocketIds = this.socketIdsByUserId.get(existingClient.userId);
    if (userSocketIds) {
      userSocketIds.delete(socketId);
      if (userSocketIds.size === 0) {
        this.socketIdsByUserId.delete(existingClient.userId);
      }
    }

    return existingClient;
  }

  forEach(handler: (client: TClient) => void): void {
    for (const client of this.bySocketId.values()) {
      handler(client);
    }
  }

  forEachByDevice(deviceId: string, handler: (client: TClient) => void): void {
    const socketIds = this.socketIdsByDeviceId.get(deviceId);
    if (!socketIds || socketIds.size === 0) {
      return;
    }
    for (const socketId of socketIds) {
      const client = this.bySocketId.get(socketId);
      if (!client) continue;
      handler(client);
    }
  }

  hasActiveConnectionForDevice(deviceId: string): boolean {
    let active = false;
    this.forEachByDevice(deviceId, (client) => {
      if (client.ws.readyState === client.ws.OPEN) {
        active = true;
      }
    });
    return active;
  }

  forEachByUser(userId: string, handler: (client: TClient) => void): void {
    const socketIds = this.socketIdsByUserId.get(userId);
    if (!socketIds || socketIds.size === 0) return;
    for (const socketId of socketIds) {
      const client = this.bySocketId.get(socketId);
      if (!client) continue;
      handler(client);
    }
  }

  hasActiveConnectionForUser(userId: string): boolean {
    const socketIds = this.socketIdsByUserId.get(userId);
    if (!socketIds) return false;
    for (const socketId of socketIds) {
      const client = this.bySocketId.get(socketId);
      if (client?.ws.readyState === client?.ws.OPEN) return true;
    }
    return false;
  }
}

