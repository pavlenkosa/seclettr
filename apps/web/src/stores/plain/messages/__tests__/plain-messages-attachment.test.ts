// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock, apiPostMock, apiDeleteMock, wsOnMock, wsOnConnectionMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiDeleteMock: vi.fn(),
  wsOnMock: vi.fn(),
  wsOnConnectionMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: apiGetMock, post: apiPostMock, delete: apiDeleteMock },
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

import { usePlainMessagesStore } from "../plain-messages-store";

/** Minimal XHR stub: resolves the upload immediately with HTTP 200. */
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

function conversations() {
  return usePlainMessagesStore.getState().conversations;
}

function lastMessage(key: string) {
  return conversations()[key]?.messages.at(-1);
}

describe("plain-messages-store sendAttachment", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiDeleteMock.mockReset();
    wsOnMock.mockReset().mockReturnValue(() => {});
    wsOnConnectionMock.mockReset().mockReturnValue(() => {});
    vi.stubGlobal("XMLHttpRequest", MockXHR);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:local-preview"),
      revokeObjectURL: vi.fn(),
    });
    usePlainMessagesStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("inserts an optimistic attachment message before upload completes", () => {
    let resolveInit: (value: unknown) => void = () => {};
    apiPostMock.mockReturnValue(new Promise((resolve) => { resolveInit = resolve; }));

    const file = new File(["data"], "voice.webm", { type: "audio/webm" });
    void usePlainMessagesStore.getState().sendAttachment("peer", "Peer", file, { kind: "voice_note" });

    const msg = lastMessage("peer");
    expect(msg?.type).toBe("voice_note");
    expect(msg?.status).toBe("sending");
    expect(msg?.uploadProgress).toBe(0);
    expect(msg?.attachment?.localUrl).toBe("blob:local-preview");
    expect(msg?.attachment?.fileName).toBe("voice.webm");
    resolveInit({ attachmentId: "att1", uploadUrl: "https://up" });
  });

  it("completes the init -> upload -> confirm -> send flow and marks the message sent", async () => {
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
    await usePlainMessagesStore.getState().sendAttachment("peer", "Peer", file);

    const msg = lastMessage("peer");
    expect(msg?.status).toBe("sent");
    expect(msg?.uploadProgress).toBeUndefined();
    expect(msg?.attachment?.attachmentId).toBe("att1");
    expect(msg?.attachment?.localUrl).toBe("https://dl/att1");
    // init + confirm + send
    expect(apiPostMock).toHaveBeenCalledTimes(3);
  });

  it("marks the message as error and cleans up the orphan attachment on failure", async () => {
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
    await usePlainMessagesStore.getState().sendAttachment("peer", "Peer", file);

    expect(lastMessage("peer")?.status).toBe("error");
    expect(apiDeleteMock).toHaveBeenCalledWith("/plain/attachments/att1");
  });
});
