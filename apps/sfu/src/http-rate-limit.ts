export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: RateLimitOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.now = options.now ?? (() => Date.now());
  }

  check(key: string): RateLimitDecision {
    const now = this.now();
    this.prune(now);

    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const bucket: RateLimitBucket = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.buckets.set(key, bucket);
      return {
        allowed: true,
        remaining: Math.max(this.maxRequests - 1, 0),
        retryAfterMs: 0,
      };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(existing.resetAt - now, 0),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(this.maxRequests - existing.count, 0),
      retryAfterMs: 0,
    };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
