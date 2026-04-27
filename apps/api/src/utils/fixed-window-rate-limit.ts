import { redis } from "../services/redis.js";

interface FixedWindowRateLimitOptions {
  key: string;
  max: number;
  windowSec: number;
}

export async function consumeFixedWindowRateLimit({
  key,
  max,
  windowSec,
}: FixedWindowRateLimitOptions): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  // Fail open: if Redis is unavailable the request is allowed through.
  // A rate-limiter outage should never take down the entire API.
  let count: number;
  let ttl: number;
  try {
    count = await redis.incr(key);
    ttl = await redis.ttl(key);
    if (count === 1 || ttl < 0) {
      await redis.expire(key, windowSec);
      ttl = windowSec;
    }
  } catch {
    return { allowed: true };
  }

  if (count > max) {
    return {
      allowed: false,
      retryAfterSec: ttl > 0 ? ttl : windowSec,
    };
  }

  return { allowed: true };
}
