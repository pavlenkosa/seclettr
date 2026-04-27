import { ensureSodium } from "./sodium.js";
import { generateKeyPair, restoreKeyPairFromPrivateKey, type KeyPair } from "./keys.js";
import { buf } from "./buf.js";

const MAX_SKIP = 1000;

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw", buf(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, buf(data));
  return new Uint8Array(sig);
}

async function kdfCk(ck: Uint8Array): Promise<{ nextCk: Uint8Array; mk: Uint8Array }> {
  const nextCk = await hmacSha256(ck, new Uint8Array([0x01]));
  const mk = await hmacSha256(ck, new Uint8Array([0x02]));
  return { nextCk, mk };
}

async function kdfRk(
  rk: Uint8Array,
  dhOutput: Uint8Array
): Promise<{ newRk: Uint8Array; newCk: Uint8Array }> {
  const baseKey = await crypto.subtle.importKey(
    "raw", buf(dhOutput), { name: "HKDF" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: buf(rk),
      info: new TextEncoder().encode("Seclettr DoubleRatchet v1"),
    },
    baseKey,
    512
  );
  const result = new Uint8Array(bits);
  return {
    newRk: result.slice(0, 32),
    newCk: result.slice(32, 64),
  };
}

export async function aeadEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData: Uint8Array
): Promise<Uint8Array> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw", buf(key), { name: "HKDF" }, false, ["deriveBits"]
  );
  const material = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("Seclettr AEAD v1"),
    },
    hkdfKey,
    (32 + 12) * 8
  );
  const mat = new Uint8Array(material);
  const aesKey = mat.slice(0, 32);
  const iv = mat.slice(32, 44);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", aesKey, { name: "AES-GCM" }, false, ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: buf(associatedData) },
    cryptoKey,
    buf(plaintext)
  );
  return new Uint8Array(ciphertext);
}

export async function aeadDecrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  associatedData: Uint8Array
): Promise<Uint8Array> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw", buf(key), { name: "HKDF" }, false, ["deriveBits"]
  );
  const material = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("Seclettr AEAD v1"),
    },
    hkdfKey,
    (32 + 12) * 8
  );
  const mat = new Uint8Array(material);
  const aesKey = mat.slice(0, 32);
  const iv = mat.slice(32, 44);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", aesKey, { name: "AES-GCM" }, false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: buf(associatedData) },
    cryptoKey,
    buf(ciphertext)
  );
  return new Uint8Array(plain);
}

export interface RatchetState {
  DHs: KeyPair;
  DHr: Uint8Array | null;
  RK: Uint8Array;
  CKs: Uint8Array | null;
  CKr: Uint8Array | null;
  Ns: number;
  Nr: number;
  PN: number;
  MKSKIPPED: Map<string, Uint8Array>;
}

export interface MessageHeader {
  dh: Uint8Array;
  pn: number;
  n: number;
}

export interface EncryptedMessage {
  header: MessageHeader;
  ciphertext: Uint8Array;
}

async function dhRatchet(myPrivate: Uint8Array, theirPublic: Uint8Array): Promise<Uint8Array> {
  const sodium = await ensureSodium();
  return sodium.crypto_scalarmult(myPrivate, theirPublic);
}

export async function initSender(
  sharedSecret: Uint8Array,
  recipientDHPublicKey: Uint8Array
): Promise<RatchetState> {
  const DHs = await generateKeyPair();
  const dhOut = await dhRatchet(DHs.privateKey, recipientDHPublicKey);
  const { newRk, newCk } = await kdfRk(sharedSecret, dhOut);
  dhOut.fill(0);

  return {
    DHs,
    DHr: recipientDHPublicKey,
    RK: newRk,
    CKs: newCk,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSKIPPED: new Map(),
  };
}

export async function initReceiver(
  sharedSecret: Uint8Array,
  ourDHKeyPair: KeyPair
): Promise<RatchetState> {
  const rootKey = sharedSecret.slice();
  return {
    DHs: ourDHKeyPair,
    DHr: null,
    RK: rootKey,
    CKs: null,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSKIPPED: new Map(),
  };
}

export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
  associatedData: Uint8Array
): Promise<EncryptedMessage> {
  if (!state.CKs) throw new Error("Sending chain not initialised");

  const { nextCk, mk } = await kdfCk(state.CKs);
  state.CKs = nextCk;

  const header: MessageHeader = {
    dh: state.DHs.publicKey,
    pn: state.PN,
    n: state.Ns,
  };
  state.Ns++;

  const headerBytes = encodeHeader(header);
  const ad = concat(associatedData, headerBytes);
  const ciphertext = await aeadEncrypt(mk, plaintext, ad);
  mk.fill(0);

  return { header, ciphertext };
}

export async function ratchetDecrypt(
  state: RatchetState,
  message: EncryptedMessage,
  associatedData: Uint8Array
): Promise<Uint8Array> {
  const { header, ciphertext } = message;
  const headerBytes = encodeHeader(header);
  const ad = concat(associatedData, headerBytes);

  const mk = trySkippedMessageKey(state, header);
  if (mk) {
    const plain = await aeadDecrypt(mk, ciphertext, ad);
    mk.fill(0);
    return plain;
  }

  const dhPubKey = header.dh;
  const isDHStep = !state.DHr || !bytesEqual(dhPubKey, state.DHr);

  if (isDHStep) {
    await skipMessageKeys(state, header.pn);
    await dhRatchetStep(state, dhPubKey);
  }

  await skipMessageKeys(state, header.n);

  if (!state.CKr) throw new Error("Receiving chain not initialised");
  const { nextCk, mk: msgKey } = await kdfCk(state.CKr);
  state.CKr = nextCk;
  state.Nr++;

  const plain = await aeadDecrypt(msgKey, ciphertext, ad);
  msgKey.fill(0);
  return plain;
}

function trySkippedMessageKey(
  state: RatchetState,
  header: MessageHeader
): Uint8Array | null {
  const key = `${toHex(header.dh)}:${header.n}`;
  const mk = state.MKSKIPPED.get(key);
  if (mk) {
    state.MKSKIPPED.delete(key);
    return mk;
  }
  return null;
}

async function skipMessageKeys(state: RatchetState, until: number): Promise<void> {
  if (state.Nr + MAX_SKIP < until) {
    throw new Error("Too many skipped messages");
  }
  if (!state.CKr) return;

  while (state.Nr < until) {
    const { nextCk, mk } = await kdfCk(state.CKr);
    state.CKr = nextCk;
    if (!state.DHr) throw new Error("DHr not set");
    const key = `${toHex(state.DHr)}:${state.Nr}`;
    state.MKSKIPPED.set(key, mk);
    state.Nr++;
  }
}

async function dhRatchetStep(state: RatchetState, remoteDH: Uint8Array): Promise<void> {
  state.PN = state.Ns;
  state.Ns = 0;
  state.Nr = 0;
  state.DHr = remoteDH;

  // GC: keep MKSKIPPED bounded by evicting entries from the oldest DH epoch
  // when the total exceeds MAX_SKIP.
  if (state.MKSKIPPED.size > MAX_SKIP) {
    const allKeys = Array.from(state.MKSKIPPED.keys());
    // Group by DH-epoch prefix (everything before the last ':')
    const epochs = new Map<string, string[]>();
    for (const k of allKeys) {
      const sep = k.lastIndexOf(":");
      const epoch = k.slice(0, sep);
      const list = epochs.get(epoch) ?? [];
      list.push(k);
      epochs.set(epoch, list);
    }
    // Sort epochs by the earliest map key (insertion-order proxy)
    const epochOrder = Array.from(epochs.keys());
    for (const epoch of epochOrder) {
      if (state.MKSKIPPED.size <= MAX_SKIP) break;
      for (const k of epochs.get(epoch)!) {
        const mk = state.MKSKIPPED.get(k);
        if (mk) mk.fill(0);
        state.MKSKIPPED.delete(k);
      }
    }
  }

  const dhOut1 = await dhRatchet(state.DHs.privateKey, state.DHr);
  const { newRk: rk1, newCk: ckr } = await kdfRk(state.RK, dhOut1);
  dhOut1.fill(0);

  state.RK = rk1;
  state.CKr = ckr;

  state.DHs = await generateKeyPair();
  const dhOut2 = await dhRatchet(state.DHs.privateKey, state.DHr);
  const { newRk: rk2, newCk: cks } = await kdfRk(state.RK, dhOut2);
  dhOut2.fill(0);

  state.RK = rk2;
  state.CKs = cks;
}

function encodeHeader(h: MessageHeader): Uint8Array {
  const buf = new Uint8Array(40);
  buf.set(h.dh, 0);
  new DataView(buf.buffer).setUint32(32, h.pn, false);
  new DataView(buf.buffer).setUint32(36, h.n, false);
  return buf;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export interface SerializedRatchetState {
  DHs_pub: string;
  DHs_priv: string;
  DHr: string | null;
  RK: string;
  CKs: string | null;
  CKr: string | null;
  Ns: number;
  Nr: number;
  PN: number;
  MKSKIPPED: Array<[string, string]>;
}

export function serializeRatchetState(state: RatchetState): SerializedRatchetState {
  const b64 = (b: Uint8Array) =>
    btoa(String.fromCodePoint(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return {
    DHs_pub: b64(state.DHs.publicKey),
    DHs_priv: b64(state.DHs.privateKey),
    DHr: state.DHr ? b64(state.DHr) : null,
    RK: b64(state.RK),
    CKs: state.CKs ? b64(state.CKs) : null,
    CKr: state.CKr ? b64(state.CKr) : null,
    Ns: state.Ns,
    Nr: state.Nr,
    PN: state.PN,
    MKSKIPPED: Array.from(state.MKSKIPPED.entries()).map(([k, v]) => [k, b64(v)]),
  };
}

export async function deserializeRatchetState(s: SerializedRatchetState): Promise<RatchetState> {
  const fromB64 = (str: string): Uint8Array => {
    const padded = str.replaceAll("-", "+").replaceAll("_", "/");
    const pad = (4 - (padded.length % 4)) % 4;
    const raw = atob(padded + "=".repeat(pad));
    return Uint8Array.from(raw, (c) => c.codePointAt(0)!);
  };
  const mkskipped = new Map<string, Uint8Array>();
  for (const [k, v] of (s.MKSKIPPED ?? [])) {
    mkskipped.set(k, fromB64(v));
  }
  // Derive the public key from the private key so a corrupted stored public key
  // can't produce a mismatched key pair (matches the behaviour of loadSession).
  const DHs = await restoreKeyPairFromPrivateKey(fromB64(s.DHs_priv), fromB64(s.DHs_pub));
  return {
    DHs,
    DHr: s.DHr ? fromB64(s.DHr) : null,
    RK: fromB64(s.RK),
    CKs: s.CKs ? fromB64(s.CKs) : null,
    CKr: s.CKr ? fromB64(s.CKr) : null,
    Ns: s.Ns,
    Nr: s.Nr,
    PN: s.PN,
    MKSKIPPED: mkskipped,
  };
}
