// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SeclettrCrypto from "@seclettr/crypto";

const memoryStore = new Map<string, unknown>();

vi.mock("@seclettr/crypto", async () => {
  const actual = await vi.importActual<typeof SeclettrCrypto>("@seclettr/crypto");
  return {
    ...actual,
    storeEncrypted: async (_storageKey: CryptoKey, key: string, value: unknown) => {
      memoryStore.set(key, JSON.parse(JSON.stringify(value)));
    },
    loadDecrypted: async <T>(_storageKey: CryptoKey, key: string): Promise<T | null> => {
      const value = memoryStore.get(key);
      return value === undefined ? null : (value as T);
    },
  };
});

import {
  buildSenderKeyDistributionPayload,
  createGroupHistoryReplayContext,
  decryptGroupTextEnvelope,
  decryptGroupTextEnvelopeForHistory,
  encryptGroupTextEnvelope,
  ensureLocalSenderKeyRecord,
  ensureLocalSenderKeyRecordForMemberDevices,
  flushGroupHistoryReplayContext,
  importSenderKeyDistribution,
  markSenderKeyDistributedToDevices,
} from "@/lib/group-sender-key";

describe("group-sender-key", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("encrypts and decrypts sender-key group text payload", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();

    const localRecord = await ensureLocalSenderKeyRecord(storageKey, groupId, senderDeviceId);
    const distribution = buildSenderKeyDistributionPayload(localRecord, groupId, senderDeviceId);
    await importSenderKeyDistribution(storageKey, distribution);

    const encrypted = await encryptGroupTextEnvelope(
      storageKey,
      groupId,
      senderDeviceId,
      "hello group"
    );
    const decrypted = await decryptGroupTextEnvelope(storageKey, encrypted);

    expect(decrypted?.text).toBe("hello group");
  });

  it("keeps own local sender-key decryptable for sent group history", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();

    const encrypted = await encryptGroupTextEnvelope(
      storageKey,
      groupId,
      senderDeviceId,
      "self history"
    );
    const decrypted = await decryptGroupTextEnvelope(storageKey, encrypted);

    expect(decrypted?.text).toBe("self history");
  });

  it("replays group history from initial sender-key state after live decrypt advanced the chain", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();

    const localRecord = await ensureLocalSenderKeyRecord(storageKey, groupId, senderDeviceId);
    const distribution = buildSenderKeyDistributionPayload(localRecord, groupId, senderDeviceId);
    await importSenderKeyDistribution(storageKey, distribution);

    const first = await encryptGroupTextEnvelope(storageKey, groupId, senderDeviceId, "first");
    const second = await encryptGroupTextEnvelope(storageKey, groupId, senderDeviceId, "second");
    const third = await encryptGroupTextEnvelope(storageKey, groupId, senderDeviceId, "third");

    expect((await decryptGroupTextEnvelope(storageKey, first))?.text).toBe("first");
    expect((await decryptGroupTextEnvelope(storageKey, second))?.text).toBe("second");

    const replay = createGroupHistoryReplayContext();
    expect((await decryptGroupTextEnvelopeForHistory(storageKey, first, replay))?.text).toBe("first");
    expect((await decryptGroupTextEnvelopeForHistory(storageKey, second, replay))?.text).toBe("second");
    await flushGroupHistoryReplayContext(storageKey, replay);

    expect((await decryptGroupTextEnvelope(storageKey, third))?.text).toBe("third");
  });

  it("returns null when sender-key distribution is missing", async () => {
    const decrypted = await decryptGroupTextEnvelope({} as CryptoKey, {
      groupId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      distributionId: crypto.randomUUID(),
      chainId: 0,
      messageId: 0,
      ciphertext: "AAAA",
      signature: "BBBB",
      aeadVersion: 0,
    });
    expect(decrypted).toBeNull();
  });

  it("tracks distributed device ids without duplicates", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const record = await ensureLocalSenderKeyRecord(storageKey, groupId, senderDeviceId);

    const targetA = crypto.randomUUID();
    const targetB = crypto.randomUUID();
    await markSenderKeyDistributedToDevices(
      storageKey,
      groupId,
      senderDeviceId,
      record.distributionId,
      [targetA, targetA, targetB]
    );

    const updated = await ensureLocalSenderKeyRecord(storageKey, groupId, senderDeviceId);
    const distributedIds = [...updated.distributedToDeviceIds];
    distributedIds.sort((left, right) => left.localeCompare(right));
    const expectedIds = [targetA, targetB];
    expectedIds.sort((left, right) => left.localeCompare(right));
    expect(distributedIds).toEqual(expectedIds);
  });

  it("rotates local sender-key when the active recipient device set changes", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const targetA = crypto.randomUUID();
    const targetB = crypto.randomUUID();

    const initial = await ensureLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    await markSenderKeyDistributedToDevices(
      storageKey,
      groupId,
      senderDeviceId,
      initial.distributionId,
      [targetA, targetB]
    );

    const adopted = await ensureLocalSenderKeyRecordForMemberDevices(
      storageKey,
      groupId,
      senderDeviceId,
      [targetB, targetA]
    );
    const stable = await ensureLocalSenderKeyRecordForMemberDevices(
      storageKey,
      groupId,
      senderDeviceId,
      [targetA, targetB, targetA]
    );
    const rotated = await ensureLocalSenderKeyRecordForMemberDevices(
      storageKey,
      groupId,
      senderDeviceId,
      [targetB]
    );

    expect(adopted.distributionId).toBe(initial.distributionId);
    expect(stable.distributionId).toBe(initial.distributionId);
    expect(rotated.distributionId).not.toBe(initial.distributionId);
    expect(rotated.distributedToDeviceIds).toEqual([]);
    expect(rotated.memberDeviceFingerprint).toBe(targetB);
  });

  it("does not let an older imported sender-key distribution overwrite newer current state", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();

    const localRecord = await ensureLocalSenderKeyRecord(storageKey, groupId, senderDeviceId);
    const newerDistribution = buildSenderKeyDistributionPayload(
      {
        ...localRecord,
        state: {
          ...localRecord.state,
          chainId: 7,
        },
      },
      groupId,
      senderDeviceId
    );
    const olderDistribution = {
      ...newerDistribution,
      chainId: 3,
    };

    await importSenderKeyDistribution(storageKey, newerDistribution);
    await importSenderKeyDistribution(storageKey, olderDistribution);

    const stored = memoryStore.get(
      `group:sender-key:remote:v1:${groupId}:${senderDeviceId}:${newerDistribution.distributionId}`
    ) as
      | {
          state: { chainId: number };
          initialState?: { chainId: number };
        }
      | undefined;

    expect(stored?.state.chainId).toBe(7);
    expect(stored?.initialState?.chainId).toBe(localRecord.state.chainId);
  });

  it("backfills initialState from an older import when a newer remote chain was stored without it", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const distributionId = crypto.randomUUID();
    const chainKey = "older-chain-key";
    const signingKey = "older-signing-key";

    memoryStore.set(
      `group:sender-key:remote:v1:${groupId}:${senderDeviceId}:${distributionId}`,
      {
        state: {
          chainKey: "newer-chain-key",
          chainId: 9,
          signingPublicKey: "newer-signing-key",
        },
      }
    );

    await importSenderKeyDistribution(storageKey, {
      schemaVersion: 1,
      type: "sender_key_distribution",
      groupId,
      senderDeviceId,
      distributionId,
      chainId: 4,
      chainKey,
      signingKey,
    });

    const stored = memoryStore.get(
      `group:sender-key:remote:v1:${groupId}:${senderDeviceId}:${distributionId}`
    ) as
      | {
          state: {
            chainKey: string;
            chainId: number;
            signingPublicKey: string;
          };
          initialState?: {
            chainKey: string;
            chainId: number;
            signingPublicKey: string;
          };
        }
      | undefined;

    expect(stored?.state.chainId).toBe(9);
    expect(stored?.initialState).toEqual({
      chainKey,
      chainId: 4,
      signingPublicKey: signingKey,
    });
  });

  it("encrypts with the rotated distribution after recipient devices change", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const targetA = crypto.randomUUID();
    const targetB = crypto.randomUUID();

    await ensureLocalSenderKeyRecordForMemberDevices(
      storageKey,
      groupId,
      senderDeviceId,
      [targetA]
    );
    const first = await encryptGroupTextEnvelope(
      storageKey,
      groupId,
      senderDeviceId,
      "before membership change"
    );

    await ensureLocalSenderKeyRecordForMemberDevices(
      storageKey,
      groupId,
      senderDeviceId,
      [targetA, targetB]
    );
    const second = await encryptGroupTextEnvelope(
      storageKey,
      groupId,
      senderDeviceId,
      "after membership change"
    );

    expect(second.distributionId).not.toBe(first.distributionId);
    expect((await decryptGroupTextEnvelope(storageKey, first))?.text).toBe(
      "before membership change"
    );
    expect((await decryptGroupTextEnvelope(storageKey, second))?.text).toBe(
      "after membership change"
    );
  });

  it("serializes concurrent local sender-key encryptions to keep message ids unique", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();

    const localRecord = await ensureLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    const distribution = buildSenderKeyDistributionPayload(
      localRecord,
      groupId,
      senderDeviceId
    );
    await importSenderKeyDistribution(storageKey, distribution);

    const plaintexts = Array.from({ length: 12 }, (_, index) => `message-${index}`);
    const envelopes = await Promise.all(
      plaintexts.map((text) =>
        encryptGroupTextEnvelope(storageKey, groupId, senderDeviceId, text)
      )
    );

    const ids = new Set(
      envelopes.map((envelope) => `${envelope.chainId}:${envelope.messageId}`)
    );
    expect(ids.size).toBe(envelopes.length);
  });

  it("keeps local sender-key state monotonic while marking distribution", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const targetDeviceId = crypto.randomUUID();

    const localRecord = await ensureLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );

    const [first, second] = await Promise.all([
      encryptGroupTextEnvelope(storageKey, groupId, senderDeviceId, "first"),
      markSenderKeyDistributedToDevices(
        storageKey,
        groupId,
        senderDeviceId,
        localRecord.distributionId,
        [targetDeviceId]
      ).then(() =>
        encryptGroupTextEnvelope(storageKey, groupId, senderDeviceId, "second")
      ),
    ]);

    const updated = await ensureLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    const ids = new Set([
      `${first.chainId}:${first.messageId}`,
      `${second.chainId}:${second.messageId}`,
    ]);
    expect(ids.size).toBe(2);
    expect(updated.distributedToDeviceIds).toContain(targetDeviceId);
    expect(updated.state.chainId).toBeGreaterThanOrEqual(second.chainId);
  });

  it("uses browser Web Locks for local sender-key mutations when available", async () => {
    const storageKey = {} as CryptoKey;
    const groupId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis.navigator,
      "locks"
    );
    const request = vi.fn(
      async <T>(
        _name: string,
        _options: { mode: "exclusive" },
        callback: () => Promise<T>
      ) => callback()
    );

    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: { request },
    });

    try {
      await ensureLocalSenderKeyRecord(storageKey, groupId, senderDeviceId);
      await encryptGroupTextEnvelope(storageKey, groupId, senderDeviceId, "locked");
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          globalThis.navigator,
          "locks",
          originalDescriptor
        );
      } else {
        Reflect.deleteProperty(globalThis.navigator, "locks");
      }
    }

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toContain(groupId);
    expect(request.mock.calls[0]?.[0]).toContain(senderDeviceId);
    expect(request.mock.calls[0]?.[1]).toEqual({ mode: "exclusive" });
  });
});
