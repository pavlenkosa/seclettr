import { buf } from "./buf.js";

export interface EncryptedAttachment {
  data: Uint8Array;
  key: Uint8Array;
  digest: Uint8Array;
  mimeType: string;
  plaintextSize: number;
}

export async function encryptAttachment(
  plaintext: Uint8Array,
  mimeType: string
): Promise<EncryptedAttachment> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const aesKey = await crypto.subtle.importKey(
    "raw", buf(key), { name: "AES-GCM" }, false, ["encrypt"]
  );
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    buf(plaintext)
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  const data = new Uint8Array(iv.length + ciphertext.length);
  data.set(iv, 0);
  data.set(ciphertext, iv.length);

  const digestBuf = await crypto.subtle.digest("SHA-256", data);
  const digest = new Uint8Array(digestBuf);

  return { data, key, digest, mimeType, plaintextSize: plaintext.length };
}

export async function decryptAttachment(
  data: Uint8Array,
  key: Uint8Array,
  expectedDigest?: Uint8Array
): Promise<Uint8Array> {
  if (expectedDigest) {
    const digestBuf = await crypto.subtle.digest("SHA-256", buf(data));
    const digest = new Uint8Array(digestBuf);
    if (!bytesEqual(digest, expectedDigest)) {
      throw new Error("Attachment integrity check failed");
    }
  }

  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const aesKey = await crypto.subtle.importKey(
    "raw", buf(key), { name: "AES-GCM" }, false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    ciphertext
  );
  return new Uint8Array(plain);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
