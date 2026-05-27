/**
 * auth-login-register-runtime — demand-only credential auth provisioning flows.
 *
 * Owns:
 *   - register flow with fresh identity generation and initial device upload
 *   - login flow with device reuse or fresh local identity provisioning
 *   - optional native background-poll token fetch after successful auth
 *
 * Does not own:
 *   - auth store state transitions
 *   - websocket/runtime activation
 *   - session restore / lock / unlock / logout flows
 */
import { api } from "@/lib/api";
import {
  generateIdentityBundle,
  generateOneTimePreKeys,
  generateSignedPreKey,
  loadDecrypted,
  storeEncrypted,
  toBase64Url,
} from "@seclettr/crypto";
import {
  AUTH_PROTOCOL_VERSION,
  type LoginResponse,
  type RegisterResponse,
} from "@seclettr/protocol";
import {
  markCurrentDeviceCryptoMaterialSynced,
} from "@/lib/current-device-crypto-material";
import {
  getOrCreateStoredRegistrationId,
  getStoredDeviceRegistration,
  setStoredDeviceRegistration,
  type StoredDeviceRegistration,
} from "@/lib/browser-trust-store";
import { isNativePlatform } from "@/lib/native-platform";
import { nativeStorageSet, storeNativeRefreshToken } from "@/lib/native-storage";
import {
  type StoredDeviceKeys,
  hasUsableDeviceKeys,
  normalizeStoredDeviceKeys,
  toCurrentDeviceCryptoMaterial,
} from "./auth-device-keys";
import { clearRatchetSessions } from "./auth-session-restore";
import type { AuthReadySnapshot } from "./auth-types";

const BACKGROUND_POLL_TOKEN_KEY = "sc:background_poll_token";
const OTK_BATCH_SIZE = 100;

export interface AuthCredentialFlowResult {
  readonly session: AuthReadySnapshot;
  readonly activationReason: "register" | "login" | "login-reuse";
  readonly shouldFetchBackgroundToken: boolean;
}

export async function fetchAndStoreBackgroundToken(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { token } = await api.post<{ token: string }>("/auth/background-token");
    await nativeStorageSet(BACKGROUND_POLL_TOKEN_KEY, token);
  } catch {
    // Non-critical — background runner just won't work until next login.
  }
}

export async function runRegisterFlow({
  username,
  password,
  deviceName,
  storageKey,
  storageKeyVolatile,
}: {
  username: string;
  password: string;
  deviceName: string;
  storageKey: CryptoKey;
  storageKeyVolatile: boolean;
}): Promise<AuthCredentialFlowResult> {
  const identity = await generateIdentityBundle();
  const registrationId = await getOrCreateStoredRegistrationId(storageKey);
  const spkId = 1;
  const spk = await generateSignedPreKey(spkId, identity.signingKeyPair.privateKey);
  const otks = await generateOneTimePreKeys(1, OTK_BATCH_SIZE);

  const result = await api.post<RegisterResponse>("/auth/register", {
    version: AUTH_PROTOCOL_VERSION,
    username,
    password,
    device: {
      name: deviceName,
      identityKeyPublic: toBase64Url(identity.dhKeyPair.publicKey),
      signingKeyPublic: toBase64Url(identity.signingKeyPair.publicKey),
      registrationId,
      signedPreKey: {
        id: spkId,
        publicKey: toBase64Url(spk.publicKey),
        signature: toBase64Url(spk.signature),
      },
      oneTimePreKeys: otks.map((otk) => ({
        id: otk.id,
        publicKey: toBase64Url(otk.publicKey),
      })),
    },
  });

  // Persist the refresh token to native Preferences so it survives Android
  // process-kill (which can wipe the WebView cookie store).
  if (result.refreshToken) {
    void storeNativeRefreshToken(result.refreshToken);
  }

  const otkPrivateKeys: Record<number, string> = {};
  for (const otk of otks) {
    otkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
  }

  const deviceKeys: StoredDeviceKeys = {
    dhPrivateKey: toBase64Url(identity.dhKeyPair.privateKey),
    dhPublicKey: toBase64Url(identity.dhKeyPair.publicKey),
    signingPrivateKey: toBase64Url(identity.signingKeyPair.privateKey),
    signingPublicKey: toBase64Url(identity.signingKeyPair.publicKey),
    signedPreKeyPriv: toBase64Url(spk.privateKey),
    signedPreKeyPub: toBase64Url(spk.publicKey),
    signedPreKeySig: toBase64Url(spk.signature),
    signedPreKeyId: spkId,
    otkPrivateKeys,
  };
  await storeEncrypted(storageKey, `device:${result.deviceId}:keys`, deviceKeys);

  const regRecord: StoredDeviceRegistration = {
    deviceId: result.deviceId,
    registrationId,
    spkId,
  };
  await setStoredDeviceRegistration(username, regRecord, storageKey);
  markCurrentDeviceCryptoMaterialSynced(
    toCurrentDeviceCryptoMaterial({
      userId: result.userId,
      deviceId: result.deviceId,
      deviceKeys,
    })
  );

  return {
    session: {
      userId: result.userId,
      deviceId: result.deviceId,
      username,
      displayName: null,
      bio: null,
      avatarKey: null,
      accessToken: result.accessToken,
      identityDhKeyPair: identity.dhKeyPair,
      storageKey,
      storageKeyVolatile,
      cryptoSyncReady: true,
    },
    activationReason: "register",
    shouldFetchBackgroundToken: true,
  };
}

export async function runLoginFlow({
  username,
  password,
  deviceName,
  storageKey,
  storageKeyVolatile,
}: {
  username: string;
  password: string;
  deviceName: string;
  storageKey: CryptoKey;
  storageKeyVolatile: boolean;
}): Promise<AuthCredentialFlowResult> {
  const savedReg = await getStoredDeviceRegistration(username, storageKey);
  if (savedReg) {
    const existingKeys = await loadDecrypted<StoredDeviceKeys>(
      storageKey,
      `device:${savedReg.deviceId}:keys`
    );

    if (!hasUsableDeviceKeys(existingKeys)) {
      throw new Error(
        "Local secure keys for this device are missing. Use recovery to reset local secure data and sign in again."
      );
    }

    const normalized = await normalizeStoredDeviceKeys(existingKeys);
    const normalizedKeys = normalized.deviceKeys;
    const existingOtkIds = Object.keys(normalizedKeys.otkPrivateKeys).map(Number);
    const maxOtkId = existingOtkIds.length > 0 ? Math.max(...existingOtkIds) : 0;
    const newOtkStartId = maxOtkId + 1000;
    const topupOtks = await generateOneTimePreKeys(newOtkStartId, OTK_BATCH_SIZE);

    const result = await api.post<LoginResponse>("/auth/login", {
      version: AUTH_PROTOCOL_VERSION,
      username,
      password,
      device: {
        name: deviceName,
        identityKeyPublic: normalizedKeys.dhPublicKey!,
        signingKeyPublic: normalizedKeys.signingPublicKey!,
        registrationId: savedReg.registrationId,
        signedPreKey: {
          id: normalizedKeys.signedPreKeyId,
          publicKey: normalizedKeys.signedPreKeyPub!,
          signature: normalizedKeys.signedPreKeySig!,
        },
        oneTimePreKeys: topupOtks.map((otk) => ({
          id: otk.id,
          publicKey: toBase64Url(otk.publicKey),
        })),
      },
    });

    // Persist the refresh token to native Preferences.
    if (result.refreshToken) {
      void storeNativeRefreshToken(result.refreshToken);
    }

    await clearRatchetSessions("login");

    for (const otk of topupOtks) {
      normalizedKeys.otkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
    }
    await storeEncrypted(storageKey, `device:${result.deviceId}:keys`, normalizedKeys);
    markCurrentDeviceCryptoMaterialSynced(
      toCurrentDeviceCryptoMaterial({
        userId: result.userId,
        deviceId: result.deviceId,
        deviceKeys: normalizedKeys,
      })
    );

    return {
      session: {
        userId: result.userId,
        deviceId: result.deviceId,
        username: result.user.username,
        displayName: null,
        bio: null,
        avatarKey: null,
        accessToken: result.accessToken,
        identityDhKeyPair: normalized.identityDhKeyPair,
        storageKey,
        storageKeyVolatile,
        cryptoSyncReady: true,
      },
      activationReason: "login-reuse",
      shouldFetchBackgroundToken: false,
    };
  }

  const identity = await generateIdentityBundle();
  const registrationId = await getOrCreateStoredRegistrationId(storageKey);
  const spkIdBuf = new Uint32Array(1);
  crypto.getRandomValues(spkIdBuf);
  const spkId = (spkIdBuf[0]! % 1000000) + 1;
  const spk = await generateSignedPreKey(spkId, identity.signingKeyPair.privateKey);
  const otks = await generateOneTimePreKeys(spkId * 1000, OTK_BATCH_SIZE);

  const result = await api.post<LoginResponse>("/auth/login", {
    version: AUTH_PROTOCOL_VERSION,
    username,
    password,
    device: {
      name: deviceName,
      identityKeyPublic: toBase64Url(identity.dhKeyPair.publicKey),
      signingKeyPublic: toBase64Url(identity.signingKeyPair.publicKey),
      registrationId,
      signedPreKey: {
        id: spkId,
        publicKey: toBase64Url(spk.publicKey),
        signature: toBase64Url(spk.signature),
      },
      oneTimePreKeys: otks.map((otk) => ({
        id: otk.id,
        publicKey: toBase64Url(otk.publicKey),
      })),
    },
  });

  // Persist the refresh token to native Preferences.
  if (result.refreshToken) {
    void storeNativeRefreshToken(result.refreshToken);
  }

  await clearRatchetSessions("login");

  const loginOtkPrivateKeys: Record<number, string> = {};
  for (const otk of otks) {
    loginOtkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
  }
  const freshDeviceKeys: StoredDeviceKeys = {
    dhPrivateKey: toBase64Url(identity.dhKeyPair.privateKey),
    dhPublicKey: toBase64Url(identity.dhKeyPair.publicKey),
    signingPrivateKey: toBase64Url(identity.signingKeyPair.privateKey),
    signingPublicKey: toBase64Url(identity.signingKeyPair.publicKey),
    signedPreKeyPriv: toBase64Url(spk.privateKey),
    signedPreKeyPub: toBase64Url(spk.publicKey),
    signedPreKeySig: toBase64Url(spk.signature),
    signedPreKeyId: spkId,
    otkPrivateKeys: loginOtkPrivateKeys,
  };
  await storeEncrypted(storageKey, `device:${result.deviceId}:keys`, freshDeviceKeys);

  const regRecord: StoredDeviceRegistration = {
    deviceId: result.deviceId,
    registrationId,
    spkId,
  };
  await setStoredDeviceRegistration(username, regRecord, storageKey);
  markCurrentDeviceCryptoMaterialSynced(
    toCurrentDeviceCryptoMaterial({
      userId: result.userId,
      deviceId: result.deviceId,
      deviceKeys: freshDeviceKeys,
    })
  );

  return {
    session: {
      userId: result.userId,
      deviceId: result.deviceId,
      username: result.user.username,
      displayName: null,
      bio: null,
      avatarKey: null,
      accessToken: result.accessToken,
      identityDhKeyPair: identity.dhKeyPair,
      storageKey,
      storageKeyVolatile,
      cryptoSyncReady: true,
    },
    activationReason: "login",
    shouldFetchBackgroundToken: true,
  };
}
