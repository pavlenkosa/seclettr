import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAnswerMaterial,
  buildOfferMaterial,
  buildRenegotiationMaterial,
  hashSdp,
  isFreshSignedAt,
} from "../call-auth-material";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
});

describe("isFreshSignedAt", () => {
  it("returns true for a timestamp just created", () => {
    const now = Date.now();
    expect(isFreshSignedAt(new Date(now).toISOString(), now)).toBe(true);
  });

  it("returns false for a timestamp older than 5 minutes", () => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000 - 1;
    expect(isFreshSignedAt(new Date(fiveMinutesAgo).toISOString(), now)).toBe(false);
  });

  it("returns false for a timestamp more than 2 minutes in the future", () => {
    const now = Date.now();
    const twoMinutesFuture = now + 2 * 60 * 1000 + 1;
    expect(isFreshSignedAt(new Date(twoMinutesFuture).toISOString(), now)).toBe(false);
  });

  it("returns true for a timestamp slightly in the future (within 2 min skew)", () => {
    const now = Date.now();
    const slightlyFuture = now + 30 * 1000;
    expect(isFreshSignedAt(new Date(slightlyFuture).toISOString(), now)).toBe(true);
  });

  it("returns false for an invalid date string", () => {
    expect(isFreshSignedAt("not-a-date")).toBe(false);
  });
});

describe("hashSdp", () => {
  it("returns a non-empty base64url string", async () => {
    const hash = await hashSdp("v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n");
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different hashes for different SDP strings", async () => {
    const h1 = await hashSdp("sdp-content-1");
    const h2 = await hashSdp("sdp-content-2");
    expect(h1).not.toBe(h2);
  });

  it("produces consistent hashes for the same input", async () => {
    const sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111";
    expect(await hashSdp(sdp)).toBe(await hashSdp(sdp));
  });
});

describe("buildOfferMaterial", () => {
  const base = {
    callId: "call-1",
    senderUserId: "user-a",
    senderDeviceId: "device-a",
    recipientUserId: "user-b",
    callType: "audio" as const,
    signedAt: "2026-01-01T00:00:00.000Z",
    sdpHash: "abc123",
  };

  it("returns a Uint8Array containing valid JSON", () => {
    const result = buildOfferMaterial(base);
    const parsed = JSON.parse(new TextDecoder().decode(result));
    expect(parsed.kind).toBe("offer");
    expect(parsed.callId).toBe("call-1");
    expect(parsed.callType).toBe("audio");
  });

  it("includes optional media encryption fields when provided", () => {
    const result = buildOfferMaterial({
      ...base,
      mediaEncryptionPreferredMode: "frame-v1",
      mediaEncryptionSupportedModesCsv: "frame-v1,transport",
      mediaEncryptionEphemeralPublicKey: "pubkey-xyz",
    });
    const parsed = JSON.parse(new TextDecoder().decode(result));
    expect(parsed.mediaEncryptionPreferredMode).toBe("frame-v1");
    expect(parsed.mediaEncryptionSupportedModesCsv).toBe("frame-v1,transport");
    expect(parsed.mediaEncryptionEphemeralPublicKey).toBe("pubkey-xyz");
  });

  it("omits optional fields when not provided", () => {
    const result = buildOfferMaterial(base);
    const parsed = JSON.parse(new TextDecoder().decode(result));
    expect(parsed.mediaEncryptionPreferredMode).toBeUndefined();
  });
});

describe("buildAnswerMaterial", () => {
  const base = {
    callId: "call-2",
    senderUserId: "user-b",
    senderDeviceId: "device-b",
    recipientUserId: "user-a",
    signedAt: "2026-01-01T00:00:00.000Z",
    sdpHash: "def456",
  };

  it("returns a Uint8Array with kind=answer", () => {
    const parsed = JSON.parse(new TextDecoder().decode(buildAnswerMaterial(base)));
    expect(parsed.kind).toBe("answer");
    expect(parsed.callId).toBe("call-2");
  });

  it("includes optional media encryption fields", () => {
    const result = buildAnswerMaterial({
      ...base,
      mediaEncryptionSelectedMode: "transport",
      mediaEncryptionSupportedModesCsv: "frame-v1,transport",
    });
    const parsed = JSON.parse(new TextDecoder().decode(result));
    expect(parsed.mediaEncryptionSelectedMode).toBe("transport");
    expect(parsed.mediaEncryptionSupportedModesCsv).toBe("frame-v1,transport");
  });
});

describe("buildRenegotiationMaterial", () => {
  const base = {
    kind: "renegotiate-offer" as const,
    callId: "call-3",
    senderUserId: "user-a",
    senderDeviceId: "device-a",
    recipientUserId: "user-b",
    signedAt: "2026-01-01T00:00:00.000Z",
    sdpHash: "ghi789",
  };

  it("returns a Uint8Array with the renegotiate kind", () => {
    const parsed = JSON.parse(new TextDecoder().decode(buildRenegotiationMaterial(base)));
    expect(parsed.kind).toBe("renegotiate-offer");
  });

  it("includes revision when provided", () => {
    const parsed = JSON.parse(new TextDecoder().decode(buildRenegotiationMaterial({ ...base, revision: 3 })));
    expect(parsed.revision).toBe(3);
  });

  it("omits revision when not provided", () => {
    const parsed = JSON.parse(new TextDecoder().decode(buildRenegotiationMaterial(base)));
    expect(parsed.revision).toBeUndefined();
  });
});
