import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { createRoomLifecycleManager } from "../services/ws-room-lifecycle.js";
import type { ConnectedClient } from "../services/ws-runtime.js";

function createFakeWs(): WebSocket {
  return { readyState: 1, send: vi.fn(), close: vi.fn(), ping: vi.fn() } as unknown as WebSocket;
}

function createClient(overrides?: Partial<ConnectedClient>): ConnectedClient {
  return {
    ws: createFakeWs(),
    userId: "user-1",
    deviceId: "dev-1",
    sessionId: null,
    socketId: "sock-1",
    joinedRoomIds: new Set(),
    ...overrides,
  };
}

describe("createRoomLifecycleManager", () => {
  describe("detachJoinedRoomTransport", () => {
    it("removes roomId from joinedRoomIds", () => {
      const manager = createRoomLifecycleManager();
      const client = createClient();
      client.joinedRoomIds.add("room-1");
      client.joinedRoomIds.add("room-2");

      manager.detachJoinedRoomTransport(client, "room-1");

      expect(client.joinedRoomIds.has("room-1")).toBe(false);
      expect(client.joinedRoomIds.has("room-2")).toBe(true);
    });

    it("does nothing when roomId is not joined", () => {
      const manager = createRoomLifecycleManager();
      const client = createClient();

      manager.detachJoinedRoomTransport(client, "room-1");

      expect(client.joinedRoomIds.size).toBe(0);
    });
  });

  describe("getActiveRoomSession", () => {
    it("returns null when no active session exists", async () => {
      const manager = createRoomLifecycleManager({
        query: (async () => []) as never,
      });

      const result = await manager.getActiveRoomSession("nonexistent");

      expect(result).toBeNull();
    });

    it("returns session when found", async () => {
      const manager = createRoomLifecycleManager({
        query: (async (_sql: string, params?: unknown[]) => {
          if (params?.[0] === "room-1") {
            return [{ id: "room-1", group_id: "group-1" }];
          }
          return [];
        }) as never,
      });

      const result = await manager.getActiveRoomSession("room-1");

      expect(result).toEqual({ id: "room-1", group_id: "group-1" });
    });
  });

  describe("handleRoomSignal", () => {
    it("sends ROOM_NOT_FOUND for non-existent room", async () => {
      const send = vi.fn();
      const manager = createRoomLifecycleManager({
        query: async () => [],
        send,
      });
      const client = createClient();

      await manager.handleRoomSignal(
        { log: { debug: vi.fn() } } as never,
        client,
        { type: "room.join", roomId: "no-such-room" } as never
      );

      expect(send).toHaveBeenCalledWith(
        client.ws,
        expect.objectContaining({ code: "ROOM_NOT_FOUND" })
      );
    });

    it("detaches transport on room.leave", async () => {
      const manager = createRoomLifecycleManager();
      const client = createClient();
      client.joinedRoomIds.add("room-1");

      await manager.handleRoomSignal(
        { log: { debug: vi.fn() } } as never,
        client,
        { type: "room.leave", roomId: "room-1" } as never
      );

      expect(client.joinedRoomIds.has("room-1")).toBe(false);
    });
  });

  describe("cleanupJoinedRoomsOnDisconnect", () => {
    it("clears all joined rooms", async () => {
      const leaveJoinedRoom = vi.fn();
      const manager = createRoomLifecycleManager();
      const client = createClient();
      client.joinedRoomIds.add("room-1");
      client.joinedRoomIds.add("room-2");

      await manager.cleanupJoinedRoomsOnDisconnect(
        { log: { debug: vi.fn() } } as never,
        client
      );

      expect(client.joinedRoomIds.size).toBe(0);
    });
  });

  describe("publishGroupCallEventExcludingSender", () => {
    it("calls publishGroupCallFanOutExcludingSender with correct params", async () => {
      const publishGroupCallFanOutExcludingSender = vi.fn();
      const manager = createRoomLifecycleManager({
        publishGroupCallFanOutExcludingSender,
      });

      await manager.publishGroupCallEventExcludingSender(
        "call-1",
        "group-1",
        "dev-1",
        { type: "test.event" }
      );

      expect(publishGroupCallFanOutExcludingSender).toHaveBeenCalledWith(
        "call-1",
        "group-1",
        "dev-1",
        expect.any(Function),
        expect.any(Function),
        { type: "test.event" }
      );
    });
  });

  describe("publishGroupProducerStateEvent", () => {
    it("forwards to publishGroupCallEventExcludingSender", async () => {
      const events: string[] = [];
      const manager = createRoomLifecycleManager({
        publishGroupCallFanOutExcludingSender: async (
          _callId, _groupId, _senderDeviceId,
          _listDevices, _listParticipants, payload
        ) => {
          events.push((payload as { type: string }).type);
        },
      });

      await manager.publishGroupProducerStateEvent(
        "call-1", "group-1", "dev-1",
        { type: "group.call.producer_state" } as never
      );

      expect(events).toEqual(["group.call.producer_state"]);
    });
  });
});
