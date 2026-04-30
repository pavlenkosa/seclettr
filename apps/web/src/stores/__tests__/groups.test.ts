import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockGetGroupMemberDevices = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    post: mockPost,
    get: mockGet,
    put: vi.fn(),
    delete: vi.fn(),
    getGroupMemberDevices: mockGetGroupMemberDevices,
  },
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: () => ({
      userId: "me",
      deviceId: "device-me",
      storageKey: null,
    }),
  },
}));

vi.mock("@/stores/messages", () => ({
  useMessagesStore: {
    getState: () => ({}),
  },
}));

vi.mock("@/lib/group-message-codec", () => ({
  decodeGroupTextCiphertext: vi.fn(),
  GROUP_MESSAGE_UNREADABLE: "[unreadable]",
}));

vi.mock("@/lib/group-sender-key", () => ({
  buildSenderKeyDistributionPayload: vi.fn(),
  createGroupHistoryReplayContext: vi.fn(),
  decryptGroupTextEnvelope: vi.fn(),
  decryptGroupTextEnvelopeForHistory: vi.fn(),
  encryptGroupTextEnvelope: vi.fn(),
  ensureLocalSenderKeyRecord: vi.fn(),
  ensureLocalSenderKeyRecordForMemberDevices: vi.fn(),
  flushGroupHistoryReplayContext: vi.fn(),
  markSenderKeyDistributedToDevices: vi.fn(),
}));

vi.mock("@/lib/display-text", () => ({
  sanitizeDisplayText: (value: string) => value,
  sanitizeDisplayTextOrFallback: (value: string, fallback: string) => value || fallback,
}));

describe("useGroupsStore.createGroup", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useGroupsStore } = await import("@/stores/groups");
    useGroupsStore.setState({
      groups: {},
      activeGroupId: null,
      loadingGroups: false,
      loadingMessagesByGroup: {},
      processedGroupMessageKeys: new Set(),
    });
  });

  it("marks a freshly created group as history-loaded so the thread can open immediately", async () => {
    mockPost.mockResolvedValue({
      groupId: "group-1",
      name: "Team room",
      createdAt: "2026-03-10T10:00:00.000Z",
      members: [
        {
          userId: "me",
          username: "me",
          joinedAt: "2026-03-10T10:00:00.000Z",
          role: "admin",
        },
        {
          userId: "alice",
          username: "alice",
          joinedAt: "2026-03-10T10:00:00.000Z",
          role: "member",
        },
      ],
    });
    mockGetGroupMemberDevices.mockResolvedValue([
      {
        userId: "me",
        devices: [{ deviceId: "device-me", identityKeyPublic: "identity-me" }],
      },
      {
        userId: "alice",
        devices: [{ deviceId: "device-alice", identityKeyPublic: "identity-alice" }],
      },
    ]);

    const { useGroupsStore } = await import("@/stores/groups");
    const created = await useGroupsStore.getState().createGroup("Team room", ["alice"]);
    const stored = useGroupsStore.getState().groups["group-1"];

    expect(created.historyLoaded).toBe(true);
    expect(created.messages).toEqual([]);
    expect(stored?.historyLoaded).toBe(true);
    expect(stored?.messages).toEqual([]);
    expect(mockPost).toHaveBeenCalledWith("/groups", {
      version: 1,
      name: "Team room",
      memberUserIds: ["alice"],
    });
  });

  it("fails group creation when the authoritative member-devices contract is unavailable instead of falling back to per-user device enumeration", async () => {
    mockPost.mockResolvedValue({
      groupId: "group-1",
      name: "Team room",
      createdAt: "2026-03-10T10:00:00.000Z",
      members: [
        {
          userId: "me",
          username: "me",
          joinedAt: "2026-03-10T10:00:00.000Z",
          role: "admin",
        },
        {
          userId: "alice",
          username: "alice",
          joinedAt: "2026-03-10T10:00:00.000Z",
          role: "member",
        },
      ],
    });
    mockGetGroupMemberDevices.mockRejectedValue(
      new Error("Invalid API payload")
    );

    const { useGroupsStore } = await import("@/stores/groups");

    await expect(
      useGroupsStore.getState().createGroup("Team room", ["alice"])
    ).rejects.toThrow("Invalid API payload");
    expect(mockGet).not.toHaveBeenCalled();
  });
});
