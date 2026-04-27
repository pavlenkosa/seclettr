/**
 * Pure helpers for serializing and restoring Signal Protocol device key material.
 * These functions have no side effects and no dependencies on the auth store —
 * they operate only on StoredDeviceKeys and the @seclettr/crypto primitives.
 */
import {
  fromBase64Url,
  toBase64Url,
  restoreKeyPairFromPrivateKey,
  restoreSigningKeyPairFromPrivateKey,
  signPublicKey,
  type KeyPair,
} from "@seclettr/crypto";
import type { CurrentDeviceCryptoMaterial } from "@/lib/current-device-crypto-material";

export interface StoredDeviceKeys {
  dhPrivateKey: string;        // base64url
  dhPublicKey?: string;        // base64url — optional; runtime can derive from private half
  signingPrivateKey: string;   // base64url
  signingPublicKey?: string;   // base64url — optional; runtime can derive from private half
  signedPreKeyPriv: string;    // base64url
  signedPreKeyPub?: string;    // base64url — optional; runtime can derive from private half
  signedPreKeySig?: string;    // base64url — Ed25519 signature over SPK pub key
  signedPreKeyId: number;
  otkPrivateKeys: Record<number, string>; // id → base64url private key
}

export function hasUsableDeviceKeys(deviceKeys: StoredDeviceKeys | null): deviceKeys is StoredDeviceKeys {
  return Boolean(
    deviceKeys?.dhPrivateKey &&
    deviceKeys?.signingPrivateKey &&
    deviceKeys?.signedPreKeyPriv &&
    Number.isInteger(deviceKeys?.signedPreKeyId)
  );
}

async function restoreStoredDhKeyPair(deviceKeys: StoredDeviceKeys): Promise<KeyPair> {
  return restoreKeyPairFromPrivateKey(
    fromBase64Url(deviceKeys.dhPrivateKey),
    deviceKeys.dhPublicKey ? fromBase64Url(deviceKeys.dhPublicKey) : undefined
  );
}

export async function normalizeStoredDeviceKeys(
  deviceKeys: StoredDeviceKeys
): Promise<{ deviceKeys: StoredDeviceKeys; identityDhKeyPair: KeyPair }> {
  const identityDhKeyPair = await restoreStoredDhKeyPair(deviceKeys);
  const signingKeyPair = await restoreSigningKeyPairFromPrivateKey(
    fromBase64Url(deviceKeys.signingPrivateKey),
    deviceKeys.signingPublicKey ? fromBase64Url(deviceKeys.signingPublicKey) : undefined
  );
  const signedPreKeyPair = await restoreKeyPairFromPrivateKey(
    fromBase64Url(deviceKeys.signedPreKeyPriv),
    deviceKeys.signedPreKeyPub ? fromBase64Url(deviceKeys.signedPreKeyPub) : undefined
  );
  const signedPreKeySig = await signPublicKey(
    signedPreKeyPair.publicKey,
    signingKeyPair.privateKey
  );

  return {
    identityDhKeyPair,
    deviceKeys: {
      ...deviceKeys,
      dhPublicKey: toBase64Url(identityDhKeyPair.publicKey),
      signingPublicKey: toBase64Url(signingKeyPair.publicKey),
      signedPreKeyPub: toBase64Url(signedPreKeyPair.publicKey),
      signedPreKeySig: toBase64Url(signedPreKeySig),
    },
  };
}

export function toCurrentDeviceCryptoMaterial(params: {
  userId: string;
  deviceId: string;
  deviceKeys: Pick<
    StoredDeviceKeys,
    | "dhPublicKey"
    | "signingPublicKey"
    | "signedPreKeyId"
    | "signedPreKeyPub"
    | "signedPreKeySig"
  >;
}): CurrentDeviceCryptoMaterial {
  return {
    userId: params.userId,
    deviceId: params.deviceId,
    identityKeyPublic: params.deviceKeys.dhPublicKey!,
    signingKeyPublic: params.deviceKeys.signingPublicKey!,
    signedPreKey: {
      id: params.deviceKeys.signedPreKeyId,
      publicKey: params.deviceKeys.signedPreKeyPub!,
      signature: params.deviceKeys.signedPreKeySig!,
    },
  };
}
