interface RateBucket {
  tokens: number;
  lastRefill: number;
}

export interface WsRateLimiterConfig {
  defaultMax: number;
  defaultWindowMs: number;
  callSignalMax: number;
  callSignalWindowMs: number;
}

export const WS_RATE_LIMIT_DEFAULT_MAX = 60;
export const WS_RATE_LIMIT_DEFAULT_WINDOW_MS = 60_000;
export const WS_RATE_LIMIT_CALL_SIGNAL_MAX = 300;
export const WS_RATE_LIMIT_CALL_SIGNAL_WINDOW_MS = 60_000;

const CALL_SIGNAL_TYPES = new Set<string>([
  "call.offer",
  "call.answer",
  "call.ice",
  "call.ice.batch",
  "call.hangup",
  "call.reject",
  "group.call.media-key",
  "group.call.media-key.ack",
  "group.call.producer_state",
  "room.join",
  "room.leave",
]);

const DEFAULT_CONFIG: WsRateLimiterConfig = {
  defaultMax: WS_RATE_LIMIT_DEFAULT_MAX,
  defaultWindowMs: WS_RATE_LIMIT_DEFAULT_WINDOW_MS,
  callSignalMax: WS_RATE_LIMIT_CALL_SIGNAL_MAX,
  callSignalWindowMs: WS_RATE_LIMIT_CALL_SIGNAL_WINDOW_MS,
};

function consumeFromBucket(
  buckets: Map<string, RateBucket>,
  socketId: string,
  max: number,
  windowMs: number,
  now: number
): boolean {
  let bucket = buckets.get(socketId);
  if (!bucket) {
    bucket = { tokens: max, lastRefill: now };
    buckets.set(socketId, bucket);
  }

  if (now - bucket.lastRefill >= windowMs) {
    bucket.tokens = max;
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

export function isCallSignalType(messageType: string): boolean {
  return CALL_SIGNAL_TYPES.has(messageType);
}

export class WsRateLimiter {
  private readonly config: WsRateLimiterConfig;
  private readonly defaultBuckets = new Map<string, RateBucket>();
  private readonly callSignalBuckets = new Map<string, RateBucket>();

  constructor(config: Partial<WsRateLimiterConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  consume(socketId: string, messageType: string, now = Date.now()): boolean {
    if (isCallSignalType(messageType)) {
      return consumeFromBucket(
        this.callSignalBuckets,
        socketId,
        this.config.callSignalMax,
        this.config.callSignalWindowMs,
        now
      );
    }

    return consumeFromBucket(
      this.defaultBuckets,
      socketId,
      this.config.defaultMax,
      this.config.defaultWindowMs,
      now
    );
  }

  clear(socketId: string): void {
    this.defaultBuckets.delete(socketId);
    this.callSignalBuckets.delete(socketId);
  }
}
