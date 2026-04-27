import { describe, expect, it } from "vitest";
import { ensureSodium, toBase64Url } from "@seclettr/crypto";
import {
  buildAnswerCallAuthMaterial,
  buildOfferCallAuthMaterial,
  buildRenegotiationCallAuthMaterial,
  hashCallSdp,
  verifyServerAnswerCallAuthProof,
  verifyServerOfferCallAuthProof,
  verifyServerRenegotiationCallAuthProof,
} from "../services/call-auth.js";

const OFFER_SDP = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
].join("\r\n");

const ANSWER_SDP = [
  "v=0",
  "o=- 3 4 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
].join("\r\n");

describe("server call-auth verification", () => {
  it("verifies signed offer auth proofs", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const signedAt = new Date().toISOString();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    const sdpHash = hashCallSdp(OFFER_SDP);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildOfferCallAuthMaterial({
          callId,
          senderUserId,
          senderDeviceId,
          recipientUserId,
          callType: "video",
          signedAt,
          sdpHash,
          mediaEncryptionPreferredMode: "transport",
          mediaEncryptionSupportedModesCsv: "transport",
        }),
        signer.privateKey
      )
    );

    await expect(verifyServerOfferCallAuthProof({
      callId,
      senderUserId,
      senderDeviceId,
      recipientUserId,
      callType: "video",
      sdp: OFFER_SDP,
      mediaEncryption: {
        preferredMode: "transport",
        supportedModes: ["transport"],
      },
      auth: {
        version: 1,
        senderUserId,
        senderDeviceId,
        recipientUserId,
        signedAt,
        sdpHash,
        signature,
      },
    }, signer.publicKey)).resolves.toBe(true);
  });

  it("rejects tampered answer auth proofs", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const signedAt = new Date().toISOString();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    const sdpHash = hashCallSdp(ANSWER_SDP);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildAnswerCallAuthMaterial({
          callId,
          senderUserId,
          senderDeviceId,
          recipientUserId,
          signedAt,
          sdpHash,
          mediaEncryptionSelectedMode: "transport",
          mediaEncryptionSupportedModesCsv: "transport",
        }),
        signer.privateKey
      )
    );

    await expect(verifyServerAnswerCallAuthProof({
      callId,
      senderUserId,
      senderDeviceId,
      recipientUserId,
      sdp: `${ANSWER_SDP}\r\na=extmap-allow-mixed`,
      mediaEncryption: {
        selectedMode: "transport",
        supportedModes: ["transport"],
      },
      auth: {
        version: 1,
        senderUserId,
        senderDeviceId,
        recipientUserId,
        signedAt,
        sdpHash,
        signature,
      },
    }, signer.publicKey)).resolves.toBe(false);
  });

  it("rejects legacy renegotiation auth proofs where revision is omitted from signature material", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const signedAt = new Date().toISOString();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    const sdpHash = hashCallSdp(OFFER_SDP);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildRenegotiationCallAuthMaterial({
          kind: "renegotiate-offer",
          callId,
          senderUserId,
          senderDeviceId,
          recipientUserId,
          signedAt,
          sdpHash,
        }),
        signer.privateKey
      )
    );

    await expect(verifyServerRenegotiationCallAuthProof({
      kind: "renegotiate-offer",
      callId,
      revision: 1,
      senderUserId,
      senderDeviceId,
      recipientUserId,
      sdp: OFFER_SDP,
      auth: {
        version: 1,
        senderUserId,
        senderDeviceId,
        recipientUserId,
        signedAt,
        sdpHash,
        signature,
      },
    }, signer.publicKey)).resolves.toBe(false);
  });

  it("verifies renegotiation auth proofs when revision is included in the signature material", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const signedAt = new Date().toISOString();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    const sdpHash = hashCallSdp(OFFER_SDP);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildRenegotiationCallAuthMaterial({
          kind: "renegotiate-answer",
          callId,
          revision: 2,
          senderUserId,
          senderDeviceId,
          recipientUserId,
          signedAt,
          sdpHash,
        }),
        signer.privateKey
      )
    );

    await expect(verifyServerRenegotiationCallAuthProof({
      kind: "renegotiate-answer",
      callId,
      revision: 2,
      senderUserId,
      senderDeviceId,
      recipientUserId,
      sdp: OFFER_SDP,
      auth: {
        version: 1,
        senderUserId,
        senderDeviceId,
        recipientUserId,
        signedAt,
        sdpHash,
        signature,
      },
    }, signer.publicKey)).resolves.toBe(true);
  });

  it("rejects renegotiation auth proofs when the signed revision does not match the message", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const signedAt = new Date().toISOString();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    const sdpHash = hashCallSdp(OFFER_SDP);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildRenegotiationCallAuthMaterial({
          kind: "renegotiate-offer",
          callId,
          revision: 2,
          senderUserId,
          senderDeviceId,
          recipientUserId,
          signedAt,
          sdpHash,
        }),
        signer.privateKey
      )
    );

    await expect(verifyServerRenegotiationCallAuthProof({
      kind: "renegotiate-offer",
      callId,
      revision: 3,
      senderUserId,
      senderDeviceId,
      recipientUserId,
      sdp: OFFER_SDP,
      auth: {
        version: 1,
        senderUserId,
        senderDeviceId,
        recipientUserId,
        signedAt,
        sdpHash,
        signature,
      },
    }, signer.publicKey)).resolves.toBe(false);
  });

  it("rejects stale offer auth proofs outside the freshness window", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const nowMs = Date.parse("2026-03-14T12:00:00.000Z");
    const signedAt = new Date(nowMs - 6 * 60 * 1000).toISOString();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    const sdpHash = hashCallSdp(OFFER_SDP);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildOfferCallAuthMaterial({
          callId,
          senderUserId,
          senderDeviceId,
          recipientUserId,
          callType: "audio",
          signedAt,
          sdpHash,
        }),
        signer.privateKey
      )
    );

    await expect(verifyServerOfferCallAuthProof({
      callId,
      senderUserId,
      senderDeviceId,
      recipientUserId,
      callType: "audio",
      sdp: OFFER_SDP,
      auth: {
        version: 1,
        senderUserId,
        senderDeviceId,
        recipientUserId,
        signedAt,
        sdpHash,
        signature,
      },
    }, signer.publicKey, { nowMs })).resolves.toBe(false);
  });

  it("rejects renegotiation auth proofs too far in the future", async () => {
    const sodium = await ensureSodium();
    const signer = sodium.crypto_sign_keypair();
    const callId = crypto.randomUUID();
    const nowMs = Date.parse("2026-03-14T12:00:00.000Z");
    const signedAt = new Date(nowMs + 3 * 60 * 1000).toISOString();
    const senderUserId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    const sdpHash = hashCallSdp(OFFER_SDP);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildRenegotiationCallAuthMaterial({
          kind: "renegotiate-answer",
          callId,
          senderUserId,
          senderDeviceId,
          recipientUserId,
          signedAt,
          sdpHash,
        }),
        signer.privateKey
      )
    );

    await expect(verifyServerRenegotiationCallAuthProof({
      kind: "renegotiate-answer",
      callId,
      revision: 1,
      senderUserId,
      senderDeviceId,
      recipientUserId,
      sdp: OFFER_SDP,
      auth: {
        version: 1,
        senderUserId,
        senderDeviceId,
        recipientUserId,
        signedAt,
        sdpHash,
        signature,
      },
    }, signer.publicKey, { nowMs })).resolves.toBe(false);
  });
});
