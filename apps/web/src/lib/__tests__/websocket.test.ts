import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WS_AUTH_PROTOCOL_PREFIX,
  WS_CLIENT_PROTOCOL,
  WS_PROTOCOL_VERSION,
} from "@seclettr/protocol";
import { SeclettrWebSocket } from "@/lib/websocket";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sentPayloads: string[] = [];
  throwOnSend = false;

  constructor(
    public readonly url: string,
    public readonly protocols?: string[]
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string): void {
    if (this.throwOnSend) {
      throw new Error("Simulated send failure");
    }
    this.sentPayloads.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({
      code: code ?? 1000,
      reason: reason ?? "",
    } as CloseEvent);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({
      data: typeof data === "string" ? data : JSON.stringify(data),
    } as MessageEvent);
  }
}

function serverMessage(payload: Record<string, unknown>) {
  return {
    version: WS_PROTOCOL_VERSION,
    ...payload,
  };
}

describe("SeclettrWebSocket.send", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("queues critical outbound messages while disconnected and flushes them on reconnect", () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-1");
    const socket = FakeWebSocket.instances[0]!;

    const result = client.send(
      { type: "group.call.media-key", callId: "call-1" },
      {
        queueIfDisconnected: true,
        queueKey: "group.call.media-key:call-1:device-a:key-1",
      }
    );

    expect(result.status).toBe("queued");
    expect(socket.sentPayloads).toHaveLength(0);

    socket.open();

    expect(socket.sentPayloads).toHaveLength(1);
    expect(JSON.parse(socket.sentPayloads[0]!)).toMatchObject({
      type: "group.call.media-key",
      callId: "call-1",
    });
  });

  it("deduplicates queued messages by queueKey and keeps the latest payload", () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-2");
    const socket = FakeWebSocket.instances[0]!;

    client.send(
      {
        type: "group.call.producer_state",
        callId: "call-1",
        producerId: "producer-1",
        kind: "audio",
        state: "added",
      },
      { queueIfDisconnected: true, queueKey: "producer:call-1:added" }
    );
    client.send(
      {
        type: "group.call.producer_state",
        callId: "call-1",
        producerId: "producer-1",
        kind: "audio",
        state: "removed",
      },
      { queueIfDisconnected: true, queueKey: "producer:call-1:added" }
    );

    socket.open();

    expect(socket.sentPayloads).toHaveLength(1);
    expect(JSON.parse(socket.sentPayloads[0]!)).toMatchObject({
      type: "group.call.producer_state",
      state: "removed",
    });
  });

  it("returns dropped for non-critical sends while disconnected", () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-3");
    const socket = FakeWebSocket.instances[0]!;

    const result = client.send({ type: "typing", conversationId: "c1" });

    expect(result.status).toBe("dropped");
    socket.open();
    expect(socket.sentPayloads).toHaveLength(0);
  });

  it("queues critical message when send throws despite OPEN readyState", () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-4");
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.throwOnSend = true;

    const result = client.send(
      { type: "group.call.media-key", callId: "call-2" },
      {
        queueIfDisconnected: true,
        queueKey: "group.call.media-key:call-2:device-a:key-2",
      }
    );

    expect(result.status).toBe("queued");
    expect(socket.sentPayloads).toHaveLength(0);
  });

  it("uses jittered reconnect backoff within bounded ranges", () => {
    vi.useFakeTimers();
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1);
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-5");
    const firstSocket = FakeWebSocket.instances[0]!;

    firstSocket.close(1006, "network error");

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    const firstDelay = timeoutSpy.mock.calls[0]?.[1] as number;
    expect(firstDelay).toBeGreaterThanOrEqual(800);
    expect(firstDelay).toBeLessThanOrEqual(1200);

    vi.advanceTimersByTime(firstDelay);
    const secondSocket = FakeWebSocket.instances[1]!;
    secondSocket.close(1006, "network error");

    expect(timeoutSpy).toHaveBeenCalledTimes(2);
    const secondDelay = timeoutSpy.mock.calls[1]?.[1] as number;
    expect(secondDelay).toBeGreaterThanOrEqual(1600);
    expect(secondDelay).toBeLessThanOrEqual(2400);

    randomSpy.mockRestore();
  });

  it("retains queued payloads when flush send fails and retries on next connection", () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-6");
    const firstSocket = FakeWebSocket.instances[0]!;

    client.send(
      { type: "group.call.media-key", callId: "call-3" },
      {
        queueIfDisconnected: true,
        queueKey: "group.call.media-key:call-3:device-a:key-3",
      }
    );

    firstSocket.throwOnSend = true;
    firstSocket.open();
    expect(firstSocket.sentPayloads).toHaveLength(0);

    client.connect("token-6b");
    const secondSocket = FakeWebSocket.instances[1]!;
    secondSocket.open();

    expect(secondSocket.sentPayloads).toHaveLength(1);
    expect(JSON.parse(secondSocket.sentPayloads[0]!)).toMatchObject({
      type: "group.call.media-key",
      callId: "call-3",
    });
  });

  it("isolates inbound handler failures so one bad handler does not break others", () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-7");
    const socket = FakeWebSocket.instances[0]!;
    const healthyHandler = vi.fn();

    client.on(() => {
      throw new Error("handler failed");
    });
    client.on(healthyHandler);

    socket.open();
    socket.emitMessage(serverMessage({ type: "pong", id: "ping-1" }));

    expect(healthyHandler).toHaveBeenCalledTimes(1);
    expect(healthyHandler).toHaveBeenCalledWith({ type: "pong", id: "ping-1" });
  });

  it("runs only one auth refresh for concurrent 4001 closes", async () => {
    vi.useFakeTimers();
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    const refresh = vi
      .fn<[], Promise<string | null>>()
      .mockResolvedValue("new-token");
    client.setAuthErrorHandler(refresh);
    client.connect("token-8");

    const firstSocket = FakeWebSocket.instances[0]!;
    firstSocket.close(4001, "Unauthorized");
    firstSocket.close(4001, "Unauthorized");

    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not schedule duplicate reconnect timers for repeated close events", () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-9");
    const socket = FakeWebSocket.instances[0]!;

    socket.close(1006, "network error");
    socket.close(1006, "network error");

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("uses ws auth token provider for subprotocol auth token", async () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.setWsAuthTokenProvider(async () => "ws-ticket-1");
    client.connect("access-token-1");

    await Promise.resolve();
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.protocols).toEqual([
      WS_CLIENT_PROTOCOL,
      `${WS_AUTH_PROTOCOL_PREFIX}ws-ticket-1`,
    ]);
  });

  it("hard-fails on incompatible inbound websocket protocol version", () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-10");
    const socket = FakeWebSocket.instances[0]!;

    socket.open();
    socket.emitMessage({
      version: WS_PROTOCOL_VERSION + 1,
      type: "pong",
      id: "ping-1",
    });

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  const CALL_OFFER_FIXTURE = {
    type: "call.offer" as const,
    callId: "11111111-1111-1111-1111-111111111111",
    callerUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    callerDeviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    targetUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    sdp: "v=0",
    callType: "audio" as const,
  };

  it("buffers a call.offer that arrives before any handler is registered and replays it on first on()", async () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-buf");
    const socket = FakeWebSocket.instances[0]!;
    socket.open();

    // Offer arrives before any handler is registered
    socket.emitMessage(serverMessage(CALL_OFFER_FIXTURE));

    const received: unknown[] = [];
    client.on((msg) => received.push(msg));

    // Buffered offer is replayed asynchronously via queueMicrotask
    await Promise.resolve();

    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("call.offer");
  });

  it("does not double-deliver when handler is registered before the offer arrives", async () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-buf-2");
    const socket = FakeWebSocket.instances[0]!;
    socket.open();

    // Handler registered before the offer arrives
    const received: unknown[] = [];
    client.on((msg) => received.push(msg));

    socket.emitMessage(serverMessage(CALL_OFFER_FIXTURE));

    await Promise.resolve();

    // Received exactly once directly — no replay
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("call.offer");
  });

  it("clears the buffered call.offer on a new connect() call", async () => {
    const client = new SeclettrWebSocket("ws://unit.test/ws");
    client.connect("token-buf-3");
    const socket = FakeWebSocket.instances[0]!;
    socket.open();

    socket.emitMessage(serverMessage(CALL_OFFER_FIXTURE));

    // Reconnect clears the buffer
    client.connect("token-buf-3-new");
    await Promise.resolve();

    const received: unknown[] = [];
    client.on((msg) => received.push(msg));
    await Promise.resolve();

    expect(received).toHaveLength(0);
  });
});
