import { describe, expect, it } from "vitest";
import { encryptAttachment, decryptAttachment } from "../attachment.js";

describe("encryptAttachment / decryptAttachment round-trip", () => {
  it("decrypts to original plaintext", async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const encrypted = await encryptAttachment(plaintext, "image/jpeg");

    const decrypted = await decryptAttachment(encrypted.data, encrypted.key);
    expect(decrypted).toEqual(plaintext);
  });

  it("preserves mimeType and plaintextSize", async () => {
    const plaintext = new Uint8Array(64);
    const encrypted = await encryptAttachment(plaintext, "audio/ogg");

    expect(encrypted.mimeType).toBe("audio/ogg");
    expect(encrypted.plaintextSize).toBe(64);
  });

  it("produces a digest over the ciphertext", async () => {
    const plaintext = new Uint8Array([10, 20, 30]);
    const encrypted = await encryptAttachment(plaintext, "application/octet-stream");

    expect(encrypted.digest).toHaveLength(32);
  });

  it("decrypts successfully when provided the correct digest", async () => {
    const plaintext = new Uint8Array([9, 8, 7]);
    const encrypted = await encryptAttachment(plaintext, "text/plain");

    const decrypted = await decryptAttachment(encrypted.data, encrypted.key, encrypted.digest);
    expect(decrypted).toEqual(plaintext);
  });

  it("throws when digest does not match", async () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptAttachment(plaintext, "text/plain");

    const badDigest = new Uint8Array(32).fill(0xff);
    await expect(decryptAttachment(encrypted.data, encrypted.key, badDigest)).rejects.toThrow("integrity");
  });

  it("produces unique ciphertext for the same plaintext (random IV/key)", async () => {
    const plaintext = new Uint8Array([0, 1, 2, 3]);
    const enc1 = await encryptAttachment(plaintext, "text/plain");
    const enc2 = await encryptAttachment(plaintext, "text/plain");

    expect(enc1.data).not.toEqual(enc2.data);
    expect(enc1.key).not.toEqual(enc2.key);
  });

  it("ciphertext data includes IV prefix (12 bytes) plus ciphertext", async () => {
    const plaintext = new Uint8Array(20);
    const encrypted = await encryptAttachment(plaintext, "text/plain");

    // AES-GCM: data = 12-byte IV + (plaintext.length + 16-byte auth tag)
    expect(encrypted.data.length).toBe(12 + 20 + 16);
  });
});
