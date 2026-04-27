import { beforeEach, describe, expect, it } from "vitest";
import { claimCallAuthProofReplay } from "../services/call-auth-replay.js";

class FakeRedis {
  private readonly values = new Map<string, { value: number; expiresAt: number | null }>();

  constructor(private readonly now: () => number) {}

  private getEntry(key: string): { value: number; expiresAt: number | null } | null {
    const entry = this.values.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return entry;
  }

  async incr(key: string): Promise<number> {
    const entry = this.getEntry(key);
    const nextValue = (entry?.value ?? 0) + 1;
    this.values.set(key, {
      value: nextValue,
      expiresAt: entry?.expiresAt ?? null,
    });
    return nextValue;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.getEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.ceil((entry.expiresAt - this.now()) / 1000);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.getEntry(key);
    if (!entry) return 0;
    entry.expiresAt = this.now() + seconds * 1000;
    return 1;
  }
}

describe("call-auth-replay", () => {
  let nowMs = 0;
  let redis: FakeRedis;

  beforeEach(() => {
    nowMs = 0;
    redis = new FakeRedis(() => nowMs);
  });

  it("claims a valid call auth proof only once inside the TTL window", async () => {
    const proof = {
      kind: "offer" as const,
      callId: "11111111-1111-4111-8111-111111111111",
      senderDeviceId: "22222222-2222-4222-8222-222222222222",
      signature: "proof-signature",
    };

    await expect(claimCallAuthProofReplay(proof, { redisClient: redis, ttlSeconds: 420 })).resolves.toBe(true);
    await expect(claimCallAuthProofReplay(proof, { redisClient: redis, ttlSeconds: 420 })).resolves.toBe(false);
  });

  it("allows the same proof again after the replay TTL expires", async () => {
    const proof = {
      kind: "renegotiate-answer" as const,
      callId: "33333333-3333-4333-8333-333333333333",
      senderDeviceId: "44444444-4444-4444-8444-444444444444",
      signature: "later-proof-signature",
    };

    await expect(claimCallAuthProofReplay(proof, { redisClient: redis, ttlSeconds: 10 })).resolves.toBe(true);

    nowMs = 10_001;

    await expect(claimCallAuthProofReplay(proof, { redisClient: redis, ttlSeconds: 10 })).resolves.toBe(true);
  });
});
