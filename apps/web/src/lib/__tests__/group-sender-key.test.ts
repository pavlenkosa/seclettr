// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryStore = new Map<string, unknown>();

vi.mock("@seclettr/crypto", async () => {
  const actual = await vi.importActual<typeof import("@seclettr/crypto")>("@seclettr/crypto");
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
});
