import { createHash } from "node:crypto";

export type CallAuthReplayKind =
  | "offer"
  | "answer"
  | "renegotiate-offer"
  | "renegotiate-answer";

export interface CallAuthReplayProof {
  kind: CallAuthReplayKind;
  callId: string;
  senderDeviceId: string;
  signature: string;
}

interface CallAuthReplayRedisClient {
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

interface ClaimCallAuthProofReplayOptions {
  redisClient?: CallAuthReplayRedisClient;
  ttlSeconds?: number;
}

const CALL_AUTH_REPLAY_SCOPE = "qm-call-auth-replay-v1";
const CALL_AUTH_REPLAY_TTL_SECONDS = 7 * 60;
const CALL_AUTH_REPLAY_KEY_PREFIX = "ws:call-auth-replay:";

function buildCallAuthReplayDigest(proof: CallAuthReplayProof): string {
  return createHash("sha256")
    .update(JSON.stringify({
      scope: CALL_AUTH_REPLAY_SCOPE,
      kind: proof.kind,
      callId: proof.callId,
      senderDeviceId: proof.senderDeviceId,
      signature: proof.signature,
    }))
    .digest("base64url");
}

function buildCallAuthReplayKey(proof: CallAuthReplayProof): string {
  return `${CALL_AUTH_REPLAY_KEY_PREFIX}${buildCallAuthReplayDigest(proof)}`;
}

export async function claimCallAuthProofReplay(
  proof: CallAuthReplayProof,
  options: ClaimCallAuthProofReplayOptions = {}
): Promise<boolean> {
  const client = options.redisClient ?? (await import("./redis.js")).redis;
  const ttlSeconds = options.ttlSeconds ?? CALL_AUTH_REPLAY_TTL_SECONDS;
  const key = buildCallAuthReplayKey(proof);

  const count = await client.incr(key);
  let ttl = await client.ttl(key);
  if (count === 1 || ttl < 0) {
    await client.expire(key, ttlSeconds);
    ttl = ttlSeconds;
  }

  return count === 1 && ttl > 0;
}
