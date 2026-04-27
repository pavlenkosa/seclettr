import { ensureSodium } from "./sodium.js";

export type PublicKeyB64 = string & { readonly __brand: "PublicKeyB64" };
export type PrivateKeyBytes = Uint8Array & { readonly __brand: "PrivateKeyBytes" };

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: PrivateKeyBytes;
}

export interface SigningKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SerializedKeyPair {
  publicKey: PublicKeyB64;
  privateKey: string;
}

export interface IdentityKeyPair extends KeyPair {
  readonly __type: "IdentityKeyPair";
}

export interface PreKeyPair extends KeyPair {
  id: number;
}

export interface SignedPreKeyPair extends PreKeyPair {
  signature: Uint8Array;
  createdAt: number;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const sodium = await ensureSodium();
  const kp = sodium.crypto_box_keypair();
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey as PrivateKeyBytes,
  };
}

export interface IdentityBundle {
  dhKeyPair: KeyPair;
  signingKeyPair: SigningKeyPair;
}

export async function generateIdentityBundle(): Promise<IdentityBundle> {
  const sodium = await ensureSodium();
  const dhKP = await generateKeyPair();
  const sigKP = sodium.crypto_sign_keypair();
  return {
    dhKeyPair: dhKP,
    signingKeyPair: {
      publicKey: sigKP.publicKey,
      privateKey: sigKP.privateKey,
    },
  };
}

function clonePrivateKey(privateKey: Uint8Array): PrivateKeyBytes {
  return new Uint8Array(privateKey) as PrivateKeyBytes;
}

function cloneSigningPrivateKey(privateKey: Uint8Array): Uint8Array {
  return new Uint8Array(privateKey);
}

function clonePublicKey(publicKey: Uint8Array): Uint8Array {
  return new Uint8Array(publicKey);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export async function derivePublicKeyFromPrivateKey(privateKey: Uint8Array): Promise<Uint8Array> {
  const sodium = await ensureSodium();
  return sodium.crypto_scalarmult_base(privateKey);
}

export async function restoreKeyPairFromPrivateKey(
  privateKey: Uint8Array,
  publicKey?: Uint8Array | null
): Promise<KeyPair> {
  const derivedPublicKey = await derivePublicKeyFromPrivateKey(privateKey);

  if (publicKey && bytesEqual(publicKey, derivedPublicKey)) {
    return {
      publicKey: clonePublicKey(publicKey),
      privateKey: clonePrivateKey(privateKey),
    };
  }

  return {
    publicKey: derivedPublicKey,
    privateKey: clonePrivateKey(privateKey),
  };
}

export async function deriveSigningPublicKeyFromPrivateKey(privateKey: Uint8Array): Promise<Uint8Array> {
  const sodium = await ensureSodium();
  const seed = privateKey.length === sodium.crypto_sign_SEEDBYTES
    ? privateKey
    : privateKey.subarray(0, sodium.crypto_sign_SEEDBYTES);
  return sodium.crypto_sign_seed_keypair(seed).publicKey;
}

export async function restoreSigningKeyPairFromPrivateKey(
  privateKey: Uint8Array,
  publicKey?: Uint8Array | null
): Promise<SigningKeyPair> {
  const derivedPublicKey = await deriveSigningPublicKeyFromPrivateKey(privateKey);

  if (publicKey && bytesEqual(publicKey, derivedPublicKey)) {
    return {
      publicKey: clonePublicKey(publicKey),
      privateKey: cloneSigningPrivateKey(privateKey),
    };
  }

  return {
    publicKey: derivedPublicKey,
    privateKey: cloneSigningPrivateKey(privateKey),
  };
}

export async function signPublicKey(
  publicKey: Uint8Array,
  signingPrivateKey: Uint8Array
): Promise<Uint8Array> {
  const sodium = await ensureSodium();
  return sodium.crypto_sign_detached(publicKey, signingPrivateKey);
}

export async function generateSignedPreKey(
  id: number,
  signingPrivateKey: Uint8Array
): Promise<SignedPreKeyPair> {
  const sodium = await ensureSodium();
  const kp = await generateKeyPair();
  const signature = sodium.crypto_sign_detached(kp.publicKey, signingPrivateKey);
  return {
    id,
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    signature,
    createdAt: Date.now(),
  };
}

export async function generateOneTimePreKeys(
  startId: number,
  count: number
): Promise<PreKeyPair[]> {
  const keys: PreKeyPair[] = [];
  for (let i = 0; i < count; i++) {
    const kp = await generateKeyPair();
    keys.push({ id: startId + i, ...kp });
  }
  return keys;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fromBase64Url(b64: string): Uint8Array {
  const padded = b64.replaceAll("-", "+").replaceAll("_", "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const full = padded + "=".repeat(pad);
  const binary = atob(full);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i)!;
  return bytes;
}
