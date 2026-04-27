import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSodium } from "@seclettr/crypto";
import { clearCallAuthCache } from "@/calls/direct/runtime/crypto/call-auth-store";
import {
  createAnswerCallAuthProof,
  createOfferCallAuthProof,
  verifyAnswerCallAuthProof,
  verifyOfferCallAuthProof,
} from "@/calls/direct/runtime/crypto/call-auth-proof";

const OFFER_SDP = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=fingerprint:sha-256 76:67:01:63:24:9D:21:34:10:82:32:AB:67:11:CF:B2:20:05:C2:7C:A8:8B:D0:40:AB:F9:B4:90:76:CA:C9:12",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
].join("\r\n");

const ANSWER_SDP = [
  "v=0",
  "o=- 3 4 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=fingerprint:sha-256 84:90:88:7F:0C:BE:C2:31:44:66:E9:8A:6F:BD:D8:3D:A7:C1:C6:C2:42:50:9F:32:18:EE:B7:AD:5D:8A:1F:06",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
].join("\r\n");

describe("call-auth", () => {
  beforeEach(() => {
    clearCallAuthCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs and verifies offer auth proofs", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const auth = await createOfferCallAuthProof({
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      callType: "video",
      sdp: OFFER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    const valid = await verifyOfferCallAuthProof({
      type: "call.offer",
      callId,
      callerUserId: auth.senderUserId,
      callerDeviceId: auth.senderDeviceId,
      targetUserId: auth.recipientUserId,
      sdp: OFFER_SDP,
      callType: "video",
      auth,
    }, signer.publicKey);

    expect(valid).toBe(true);
  });

  it("rejects tampered offer auth proofs", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const auth = await createOfferCallAuthProof({
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      callType: "audio",
      sdp: OFFER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    const valid = await verifyOfferCallAuthProof({
      type: "call.offer",
      callId,
      callerUserId: auth.senderUserId,
      callerDeviceId: auth.senderDeviceId,
      targetUserId: auth.recipientUserId,
      sdp: `${OFFER_SDP}\r\na=extmap-allow-mixed`,
      callType: "audio",
      auth,
    }, signer.publicKey);

    expect(valid).toBe(false);
  });

  it("rejects answers verified with the wrong device key", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const stranger = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const auth = await createAnswerCallAuthProof({
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      sdp: ANSWER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    const valid = await verifyAnswerCallAuthProof({
      type: "call.answered",
      callId,
      answererUserId: auth.senderUserId,
      answererDeviceId: auth.senderDeviceId,
      targetUserId: auth.recipientUserId,
      sdp: ANSWER_SDP,
      auth,
    }, stranger.publicKey);

    expect(valid).toBe(false);
  });

  it("keeps detached signature payload transport-safe", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const auth = await createOfferCallAuthProof({
      callId: crypto.randomUUID(),
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      callType: "audio",
      sdp: OFFER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    expect(auth.signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects stale offer auth proofs outside the freshness window", async () => {
    vi.useFakeTimers();
    const issuedAt = new Date("2026-03-14T12:00:00.000Z");
    vi.setSystemTime(issuedAt);

    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const auth = await createOfferCallAuthProof({
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      callType: "video",
      sdp: OFFER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    vi.setSystemTime(new Date(issuedAt.getTime() + 6 * 60 * 1000));

    const valid = await verifyOfferCallAuthProof({
      type: "call.offer",
      callId,
      callerUserId: auth.senderUserId,
      callerDeviceId: auth.senderDeviceId,
      targetUserId: auth.recipientUserId,
      sdp: OFFER_SDP,
      callType: "video",
      auth,
    }, signer.publicKey);

    expect(valid).toBe(false);
  });

  it("rejects answer auth proofs too far in the future", async () => {
    vi.useFakeTimers();
    const baseTime = new Date("2026-03-14T12:00:00.000Z");
    vi.setSystemTime(new Date(baseTime.getTime() + 3 * 60 * 1000));

    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const auth = await createAnswerCallAuthProof({
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      sdp: ANSWER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    vi.setSystemTime(baseTime);

    const valid = await verifyAnswerCallAuthProof({
      type: "call.answered",
      callId,
      answererUserId: auth.senderUserId,
      answererDeviceId: auth.senderDeviceId,
      targetUserId: auth.recipientUserId,
      sdp: ANSWER_SDP,
      auth,
    }, signer.publicKey);

    expect(valid).toBe(false);
  });

  it("verifies legacy offer signature when mediaEncryption fields are present in payload", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const auth = await createOfferCallAuthProof({
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      callType: "audio",
      sdp: OFFER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    const valid = await verifyOfferCallAuthProof({
      type: "call.offer",
      callId,
      callerUserId: auth.senderUserId,
      callerDeviceId: auth.senderDeviceId,
      targetUserId: auth.recipientUserId,
      sdp: OFFER_SDP,
      callType: "audio",
      mediaEncryption: {
        preferredMode: "transport",
        supportedModes: ["transport"],
      },
      auth,
    }, signer.publicKey);

    expect(valid).toBe(true);
  });

  it("verifies legacy answer signature when mediaEncryption fields are present in payload", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const auth = await createAnswerCallAuthProof({
      callId,
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      recipientUserId: crypto.randomUUID(),
      sdp: ANSWER_SDP,
      signingPrivateKey: signer.privateKey,
    });

    const valid = await verifyAnswerCallAuthProof({
      type: "call.answered",
      callId,
      answererUserId: auth.senderUserId,
      answererDeviceId: auth.senderDeviceId,
      targetUserId: auth.recipientUserId,
      sdp: ANSWER_SDP,
      mediaEncryption: {
        selectedMode: "transport",
        supportedModes: ["transport"],
      },
      auth,
    }, signer.publicKey);

    expect(valid).toBe(true);
  });
});
