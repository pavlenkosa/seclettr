/**
 * @ownedBy auth-runtime / WS message routing
 *
 * `wsClient` is a module-level singleton shared across: auth store (connect/disconnect
 * on sign-in/sign-out), direct-call signal layer (send offer/answer/ICE), group-call
 * signal layer (same), and all stores that subscribe to server push events.
 * The singleton is intentional — one persistent connection per tab.
 * Tests import `SeclettrWebSocket` directly and create fresh instances; `wsClient`
 * is never used in tests and does not need a reset export.
 *
 * WebSocket client with auto-reconnect and message routing.
 */
import {
  WS_AUTH_PROTOCOL_PREFIX,
  WS_CLIENT_PROTOCOL,
  safeParseWsServerMessage,
  type WsServerMessage,
  toWsClientWireMessage,
} from "@seclettr/protocol";
import { logger } from "./logger";
import { resolveApiBaseUrl } from "./runtime-config";

type MessageHandler = (msg: WsServerMessage) => void;
type ConnectionHandler = (connected: boolean) => void;
type WsAuthTokenProvider = (accessToken: string) => Promise<string | null>;
export type WsSendStatus = "sent" | "queued" | "dropped";
export interface WsSendResult {
  status: WsSendStatus;
}
export interface WsSendOptions {
  queueIfDisconnected?: boolean;
  queueKey?: string;
  ttlMs?: number;
}

interface QueuedOutboundMessage {
  payload: string;
  key?: string;
  expiresAt: number;
}

function resolveWsUrl(): string {
  const apiUrl = resolveApiBaseUrl();
  if (apiUrl.startsWith("http")) {
    return apiUrl.replace(/^http/, "ws").replace(/\/api$/, "") + "/ws";
  }
  if (typeof location === "undefined") {
    return "ws://localhost/ws";
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/** How long a buffered call.offer survives before it is considered stale. */
const CALL_OFFER_BUFFER_TTL_MS = 60_000;

export class SeclettrWebSocket {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxDelay = 30_000;
  private readonly minReconnectDelay = 250;
  private readonly reconnectJitterMin = 0.8;
  private readonly reconnectJitterMax = 1.2;
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private readonly handlers = new Set<MessageHandler>();
  private readonly connectionHandlers = new Set<ConnectionHandler>();
  private token: string | null = null;
  private wsAuthTokenProvider: WsAuthTokenProvider | null = null;
  private intentionalClose = false;
  private authErrorHandler: (() => Promise<string | null>) | null = null;
  private authRefreshInFlight: Promise<string | null> | null = null;
  // Resolved lazily on first connect() so that the native-server URL set in
  // localStorage after module init (NativeServerSetup flow) is picked up.
  private wsUrl: string | null = null;
  private readonly queuedOutboundMessages: QueuedOutboundMessage[] = [];
  private readonly defaultQueueTtlMs = 15_000;
  private readonly maxQueuedMessages = 200;
  /**
   * Buffer for a call.offer that arrived before any signal handler was
   * registered (race between WebSocket connect and React effect mount).
   * Consumed and cleared the first time a handler subscribes.
   */
  private bufferedCallOffer: { msg: WsServerMessage; receivedAt: number } | null = null;

  constructor(private readonly fixedWsUrl?: string) {}

  connect(accessToken: string): void {
    // Recompute URL on every explicit connect so the native-server URL from
    // localStorage (which may have been set after module init) is always used.
    this.wsUrl = this.fixedWsUrl ?? resolveWsUrl();
    // Close any previous connection cleanly before opening a new one.
    // Without this, the abandoned old WS fires onclose → scheduleReconnect → infinite loop.
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      const old = this.ws;
      old.onclose = null; // detach handler so it doesn't trigger reconnect
      old.close(1000, "replaced");
    }
    this.token = accessToken;
    this.intentionalClose = false;
    this.bufferedCallOffer = null;
    void this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, "Client disconnect");
    this.ws = null;
    this.notifyConnection(false);
  }

  send(msg: object, options: WsSendOptions = {}): WsSendResult {
    const payload = JSON.stringify(toWsClientWireMessage(msg as never));
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
        return { status: "sent" };
      } catch {
        if (options.queueIfDisconnected) {
          this.enqueueOutboundMessage(payload, options.queueKey, options.ttlMs);
          return { status: "queued" };
        }
        return { status: "dropped" };
      }
    }

    if (options.queueIfDisconnected) {
      this.enqueueOutboundMessage(payload, options.queueKey, options.ttlMs);
      return { status: "queued" };
    }

    return { status: "dropped" };
  }

  on(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    // Replay a buffered call.offer to this handler if it arrived before any
    // handlers were registered (race between WS connect and React effect mount).
    const buffered = this.bufferedCallOffer;
    if (buffered && Date.now() - buffered.receivedAt < CALL_OFFER_BUFFER_TTL_MS) {
      this.bufferedCallOffer = null;
      queueMicrotask(() => {
        if (this.handlers.has(handler)) {
          try {
            handler(buffered.msg);
          } catch (err) {
            logger.warn("[WS] buffered call.offer replay handler threw", err);
          }
        }
      });
    } else {
      this.bufferedCallOffer = null;
    }
    return () => this.handlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    handler(this.connected);
    return () => this.connectionHandlers.delete(handler);
  }

  /** Register a handler that will be called when the server closes with 4001 (JWT expired).
   *  The handler should refresh the token and return the new one, or null on failure. */
  setAuthErrorHandler(fn: () => Promise<string | null>): void {
    this.authErrorHandler = fn;
  }

  setWsAuthTokenProvider(fn: WsAuthTokenProvider): void {
    this.wsAuthTokenProvider = fn;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private notifyConnection(connected: boolean): void {
    for (const handler of this.connectionHandlers) {
      handler(connected);
    }
  }

  private async doConnect(): Promise<void> {
    if (!this.token) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const accessToken = this.token;
    let wsAuthToken: string | null = accessToken;
    if (this.wsAuthTokenProvider) {
      try {
        wsAuthToken = await this.wsAuthTokenProvider(accessToken);
      } catch {
        wsAuthToken = null;
      }
    }
    if (!wsAuthToken) {
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
      return;
    }
    if (this.intentionalClose || this.token !== accessToken) return;

    this.ws = new WebSocket(this.wsUrl!, [
      WS_CLIENT_PROTOCOL,
      `${WS_AUTH_PROTOCOL_PREFIX}${wsAuthToken}`,
    ]);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.notifyConnection(true);
      this.flushQueuedOutboundMessages();
    };

    this.ws.onmessage = (ev) => {
      try {
        if (typeof ev.data !== "string") {
          return;
        }
        const raw = JSON.parse(ev.data) as unknown;
        const result = safeParseWsServerMessage(raw);
        if (result.success) {
          if (this.handlers.size === 0 && result.data.type === "call.offer") {
            // Buffer the offer in case it arrived before signal handlers mounted.
            this.bufferedCallOffer = { msg: result.data, receivedAt: Date.now() };
          }
          for (const handler of this.handlers) {
            try {
              handler(result.data);
            } catch (handlerError) {
              logger.warn("[WS] message handler threw unexpectedly", handlerError);
            }
          }
        } else if (result.error.code === "UNSUPPORTED_PROTOCOL_VERSION") {
          logger.error(
            "[WS] incompatible server protocol version:",
            result.error.receivedVersion
          );
          this.failProtocol("Unsupported websocket protocol version");
        } else {
          logger.error(
            "[WS] message validation failed:",
            result.error.details
          );
        }
      } catch (e) {
        logger.error("[WS] parse error:", e);
      }
    };

    this.ws.onclose = (ev) => {
      this.notifyConnection(false);
      if (this.intentionalClose) return;

      if (ev.code === 4001 && this.authErrorHandler) {
        // JWT expired — refresh silently and reconnect without backoff reset
        const refreshPromise =
          this.authRefreshInFlight ?? this.authErrorHandler();
        this.authRefreshInFlight = refreshPromise;
        refreshPromise
          .then((newToken) => {
            if (this.authRefreshInFlight === refreshPromise) {
              this.authRefreshInFlight = null;
            }
            if (newToken && !this.intentionalClose) {
              this.token = newToken;
              this.reconnectDelay = 1000;
              void this.doConnect();
            } else if (!this.intentionalClose) {
              // Refresh returned null (network error or server rejection).
              // Schedule a retry — if the session was truly expired, the
              // sign-out path will call disconnect() which sets intentionalClose
              // = true, making the next doConnect() a harmless no-op.
              this.scheduleReconnect();
            }
          })
          .catch(() => {
            if (this.authRefreshInFlight === refreshPromise) {
              this.authRefreshInFlight = null;
            }
            if (!this.intentionalClose) {
              this.scheduleReconnect();
            }
          });
      } else {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose — no extra handling needed
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const baseDelay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    const jitterSpread = this.reconnectJitterMax - this.reconnectJitterMin;
    const jitterMultiplier =
      this.reconnectJitterMin + Math.random() * jitterSpread;
    const delay = Math.min(
      this.maxDelay,
      Math.max(this.minReconnectDelay, Math.round(baseDelay * jitterMultiplier))
    );
    this.reconnectTimer = globalThis.setTimeout(() => {
      if (!this.intentionalClose) {
        void this.doConnect();
      }
    }, delay);
  }

  private failProtocol(reason: string): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1002, reason);
    this.ws = null;
    this.notifyConnection(false);
  }

  private enqueueOutboundMessage(
    payload: string,
    queueKey?: string,
    ttlMs?: number
  ): void {
    const now = Date.now();
    const expiresAt = now + (ttlMs ?? this.defaultQueueTtlMs);

    this.pruneExpiredQueuedMessages(now);

    if (queueKey) {
      const existingIndex = this.queuedOutboundMessages.findIndex(
        (item) => item.key === queueKey
      );
      if (existingIndex >= 0) {
        this.queuedOutboundMessages.splice(existingIndex, 1);
      }
    }

    this.queuedOutboundMessages.push({ payload, key: queueKey, expiresAt });

    while (this.queuedOutboundMessages.length > this.maxQueuedMessages) {
      this.queuedOutboundMessages.shift();
    }
  }

  private flushQueuedOutboundMessages(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    const now = Date.now();
    this.pruneExpiredQueuedMessages(now);
    if (this.queuedOutboundMessages.length === 0) {
      return;
    }

    const queued = this.queuedOutboundMessages.splice(
      0,
      this.queuedOutboundMessages.length
    );
    for (let index = 0; index < queued.length; index += 1) {
      const item = queued[index]!;
      try {
        this.ws.send(item.payload);
      } catch {
        // Keep remaining queued payloads in original order for next reconnect/open.
        this.queuedOutboundMessages.unshift(...queued.slice(index));
        return;
      }
    }
  }

  private pruneExpiredQueuedMessages(now = Date.now()): void {
    for (
      let index = this.queuedOutboundMessages.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (this.queuedOutboundMessages[index]!.expiresAt <= now) {
        this.queuedOutboundMessages.splice(index, 1);
      }
    }
  }
}

export const wsClient = new SeclettrWebSocket();
