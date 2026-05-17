// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock, apiPostMock, apiPatchMock, apiDeleteMock, wsOnMock, wsOnConnectionMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPatchMock: vi.fn(),
  apiDeleteMock: vi.fn(),
  wsOnMock: vi.fn(),
  wsOnConnectionMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: apiGetMock, post: apiPostMock, patch: apiPatchMock, delete: apiDeleteMock },
}));
vi.mock("@/lib/websocket", () => ({
  wsClient: { on: wsOnMock, onConnectionChange: wsOnConnectionMock, connected: true },
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: { getState: () => ({ userId: "me", username: "Me", deviceId: "dev" }) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { usePlainGroupsStore } from "../plain-groups-store";

type WsMessage = { type: string; [k: string]: unknown };
let wsHandler: ((message: WsMessage) => void) | null = null;

function wireGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1",
    name: "Group One",
    creatorId: "me",
    members: [
      { userId: "me", username: "Me", role: "owner", joinedAt: "2026-01-01T00:00:00Z" },
      { userId: "bob", username: "Bob", role: "member", joinedAt: "2026-01-01T00:00:00Z" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function groups() {
  return usePlainGroupsStore.getState().groups;
}

async function seedGroup() {
  apiPostMock.mockResolvedValueOnce(wireGroup());
  await usePlainGroupsStore.getState().createGroup("Group One", ["bob"]);
}

describe("plain-groups-store", () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
    apiDeleteMock.mockReset();
    wsHandler = null;
    wsOnMock.mockReset().mockImplementation((cb: (message: WsMessage) => void) => {
      wsHandler = cb;
      return () => {};
    });
    wsOnConnectionMock.mockReset().mockReturnValue(() => {});
    usePlainGroupsStore.getState().reset();
    unsubscribe = usePlainGroupsStore.getState().subscribe();
  });

  afterEach(() => {
    unsubscribe();
  });

  it("adds a created group to the store and returns its id", async () => {
    apiPostMock.mockResolvedValueOnce(wireGroup());
    const id = await usePlainGroupsStore.getState().createGroup("Group One", ["bob"]);
    expect(id).toBe("g1");
    expect(groups()["g1"]?.name).toBe("Group One");
    expect(groups()["g1"]?.members).toHaveLength(2);
  });

  it("optimistically renames a group and rolls back on failure", async () => {
    await seedGroup();

    apiPatchMock.mockRejectedValueOnce(new Error("server rejected"));
    await expect(
      usePlainGroupsStore.getState().renameGroup("g1", "New Name")
    ).rejects.toThrow();

    // Rolled back to the previous name.
    expect(groups()["g1"]?.name).toBe("Group One");
  });

  it("mirrors an owner transfer locally — old owner becomes admin", async () => {
    await seedGroup();
    apiPatchMock.mockResolvedValueOnce(undefined);

    await usePlainGroupsStore.getState().updateMemberRole("g1", "bob", "owner");

    const members = groups()["g1"]?.members ?? [];
    expect(members.find((m) => m.userId === "bob")?.role).toBe("owner");
    expect(members.find((m) => m.userId === "me")?.role).toBe("admin");
  });

  it("removes the whole group from the store on self-leave", async () => {
    await seedGroup();
    apiDeleteMock.mockResolvedValueOnce(undefined);

    await usePlainGroupsStore.getState().removeMember("g1", "me");

    expect(groups()["g1"]).toBeUndefined();
  });

  it("only filters the membership list when removing another member", async () => {
    await seedGroup();
    apiDeleteMock.mockResolvedValueOnce(undefined);

    await usePlainGroupsStore.getState().removeMember("g1", "bob");

    expect(groups()["g1"]).toBeDefined();
    expect(groups()["g1"]?.members.some((m) => m.userId === "bob")).toBe(false);
  });

  it("refreshes the member list after addMember", async () => {
    await seedGroup();
    apiPostMock.mockResolvedValueOnce(undefined);
    apiGetMock.mockResolvedValueOnce(
      wireGroup({
        members: [
          { userId: "me", username: "Me", role: "owner", joinedAt: "2026-01-01T00:00:00Z" },
          { userId: "bob", username: "Bob", role: "member", joinedAt: "2026-01-01T00:00:00Z" },
          { userId: "carol", username: "Carol", role: "member", joinedAt: "2026-02-01T00:00:00Z" },
        ],
      })
    );

    await usePlainGroupsStore.getState().addMember("g1", "carol");

    expect(groups()["g1"]?.members.some((m) => m.userId === "carol")).toBe(true);
  });

  it("optimistically inserts a sent text message, then marks error on failure", async () => {
    await seedGroup();

    apiPostMock.mockRejectedValueOnce(new Error("send failed"));
    await usePlainGroupsStore.getState().sendText("g1", "hello group");

    const msg = groups()["g1"]?.messages.at(-1);
    expect(msg?.content).toBe("hello group");
    expect(msg?.status).toBe("error");
  });

  it("appends an incoming group message from a WS event", async () => {
    await seedGroup();

    wsHandler?.({
      type: "plain_message.new",
      message: {
        id: "srv-1",
        clientId: "wire-c1",
        senderUserId: "bob",
        senderUsername: "Bob",
        groupId: "g1",
        content: "incoming group msg",
        messageType: "text",
        createdAt: new Date(1_700_000_000_000).toISOString(),
      },
    });

    expect(groups()["g1"]?.messages.at(-1)?.content).toBe("incoming group msg");
    expect(groups()["g1"]?.unreadCount).toBe(1);
  });

  it("resets unread count on markRead", async () => {
    await seedGroup();
    wsHandler?.({
      type: "plain_message.new",
      message: {
        id: "srv-2",
        clientId: "wire-c2",
        senderUserId: "bob",
        senderUsername: "Bob",
        groupId: "g1",
        content: "msg",
        messageType: "text",
        createdAt: new Date(1_700_000_000_000).toISOString(),
      },
    });
    expect(groups()["g1"]?.unreadCount).toBe(1);

    usePlainGroupsStore.getState().markRead("g1");
    expect(groups()["g1"]?.unreadCount).toBe(0);
  });
});
