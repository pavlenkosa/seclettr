const PROOF_LABEL = new TextEncoder().encode("seclettr-mk-ack-v1");

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCodePoint(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const padded = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.codePointAt(0) ?? 0);
}

async function importHmacKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKey.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * Compute HMAC-SHA-256(rawKey, label || keyId || ":" || epoch) encoded as base64url.
 * Binding epoch makes the proof unique per rotation even if keyId were to repeat
 * (e.g. after epoch wrap). Called by the key *recipient* when sending the ACK.
 */
export async function computeMediaKeyAckProof(
  rawKey: Uint8Array,
  keyId: string,
  epoch: number
): Promise<string> {
  const cryptoKey = await importHmacKey(rawKey);
  const keyIdBytes = new TextEncoder().encode(`${keyId}:${epoch}`);
  const data = new Uint8Array(PROOF_LABEL.length + keyIdBytes.length);
  data.set(PROOF_LABEL, 0);
  data.set(keyIdBytes, PROOF_LABEL.length);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return b64url(sig);
}

/**
 * Verify that the ACK proof matches the raw key we sent.
 * Returns true if the proof is valid, false if invalid.
 * Returns true (accept) if proof is absent — backward compat with old clients
 * that do not yet send keyProof.
 */
export async function verifyMediaKeyAckProof(
  rawKey: Uint8Array,
  keyId: string,
  epoch: number,
  proof: string | undefined
): Promise<boolean> {
  if (!proof) return true;
  try {
    const cryptoKey = await importHmacKey(rawKey);
    const keyIdBytes = new TextEncoder().encode(`${keyId}:${epoch}`);
    const data = new Uint8Array(PROOF_LABEL.length + keyIdBytes.length);
    data.set(PROOF_LABEL, 0);
    data.set(keyIdBytes, PROOF_LABEL.length);
    const proofBytes = fromB64url(proof);
    return crypto.subtle.verify("HMAC", cryptoKey, proofBytes.buffer as ArrayBuffer, data);
  } catch {
    return false;
  }
}
