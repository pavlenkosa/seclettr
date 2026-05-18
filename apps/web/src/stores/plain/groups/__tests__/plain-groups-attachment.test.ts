// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  apiGetMock,
  apiPostMock,
  apiPatchMock,
  apiDeleteMock,
  wsOnMock,
  wsOnConnectionMock,
} = vi.hoisted(() => ({
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

class MockXHR {
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 200;
  open(): void {}
  setRequestHeader(): void {}
  send(): void {
    queueMicrotask(() => this.onload?.());
  }
}

function groups() {
  return usePlainGroupsStore.getState().groups;
}

function lastMessage(groupId: string) {
  return groups()[groupId]?.messages.at(-1);
}

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

async function seedGroup() {
  apiPostMock.mockResolvedValueOnce(wireGroup());
  await usePlainGroupsStore.getState().createGroup("Group One", ["bob"]);
  apiPostMock.mockClear();
}

describe("plain-groups-store sendAttachment", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
    apiDeleteMock.mockReset();
    wsOnMock.mockReset().mockReturnValue(() => {});
    wsOnConnectionMock.mockReset().mockReturnValue(() => {});
    vi.stubGlobal("XMLHttpRequest", MockXHR);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:local-preview"),
      revokeObjectURL: vi.fn(),
    });
    usePlainGroupsStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("inserts an optimistic attachment message before upload completes", async () => {
    await seedGroup();

    apiPostMock.mockReturnValueOnce(new Promise(() => {}));

    const file = new File(["data"], "voice.webm", { type: "audio/webm" });
    void usePlainGroupsStore.getState().sendAttachment("g1", file, { kind: "voice_note" });

    const msg = lastMessage("g1");
    expect(msg?.type).toBe("voice_note");
    expect(msg?.status).toBe("sending");
    expect(msg?.uploadProgress).toBe(0);
    expect(msg?.attachment?.localUrl).toBe("blob:local-preview");
    expect(msg?.attachment?.fileName).toBe("voice.webm");
  });

  it("completes the init -> upload -> confirm -> send flow and marks the message sent", async () => {
    await seedGroup();

    apiPostMock.mockImplementation((path: string) => {
      if (path === "/plain/attachments/init") {
        return Promise.resolve({ attachmentId: "att1", uploadUrl: "https://up" });
      }
      if (path.endsWith("/confirm")) {
        return Promise.resolve({ attachmentId: "att1", downloadUrl: "https://dl/att1" });
      }
      return Promise.resolve({ id: "srv-1", clientId: "x", createdAt: "" });
    });

    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    await usePlainGroupsStore.getState().sendAttachment("g1", file);

    const msg = lastMessage("g1");
    expect(msg?.status).toBe("sent");
    expect(msg?.uploadProgress).toBeUndefined();
    expect(msg?.attachment?.attachmentId).toBe("att1");
    expect(msg?.attachment?.localUrl).toBe("https://dl/att1");
    expect(apiPostMock).toHaveBeenCalledTimes(3);
  });

  it("marks the message as error and cleans up the orphan attachment on failure", async () => {
    await seedGroup();

    apiPostMock.mockImplementation((path: string) => {
      if (path === "/plain/attachments/init") {
        return Promise.resolve({ attachmentId: "att1", uploadUrl: "https://up" });
      }
      if (path.endsWith("/confirm")) {
        return Promise.reject(new Error("confirm failed"));
      }
      return Promise.resolve({ id: "srv-1", clientId: "x", createdAt: "" });
    });
    apiDeleteMock.mockResolvedValue(undefined);

    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    await usePlainGroupsStore.getState().sendAttachment("g1", file);

    expect(lastMessage("g1")?.status).toBe("error");
    expect(apiDeleteMock).toHaveBeenCalledWith("/plain/attachments/att1");
  });
});
