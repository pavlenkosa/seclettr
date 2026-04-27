import {
  bootstrapReceiverSession,
  deserializeRatchetState,
  fromBase64Url,
  generateKeyPair,
  initSender,
  loadDecrypted,
  restoreKeyPairFromPrivateKey,
  serializeRatchetState,
  storeEncrypted,
  toBase64Url,
  x3dhSend,
  type KeyPair,
  type RatchetState,
} from "@seclettr/crypto";
import type { PreKeyBundle } from "@seclettr/protocol";

/** Thrown when a peer's identity key differs from the previously trusted value. */
export class IdentityKeyChangedError extends Error {
  constructor(
    public readonly deviceId: string,
    public readonly trustedKeyB64: string,
    public readonly receivedKeyB64: string
  ) {
    super(
      `Identity key for device ${deviceId} has changed. ` +
      "This may indicate a compromised account. Verify the safety number with your contact before continuing."
    );
    this.name = "IdentityKeyChangedError";
  }
}

interface StoredDeviceKeys {
  signedPreKeyPriv: string;
  signedPreKeyPub?: string;
  signedPreKeyId: number;
  otkPrivateKeys?: Record<number, string>;
}

export interface MessageSessionRuntime {
  loadSession: (deviceId: string) => Promise<RatchetState | null>;
  saveSession: (deviceId: string, state: RatchetState) => Promise<void>;
  clearSession: (deviceId: string) => Promise<void>;
  /**
   * Removes the stored TOFU record for a device so the next contact will
   * trust and record whatever identity key is presented.  Call this only after
   * the user has verified the new safety number out-of-band.
   */
  resetTrustedIdentity: (deviceId: string) => Promise<void>;
  getOrCreateOutboundSession: (
    recipientUserId: string,
    recipientDeviceId: string
  ) => Promise<{
    state: RatchetState;
    x3dhHeader?: {
      ephemeralKey: string;
      signedPreKeyId: number;
      oneTimePreKeyId?: number;
      senderIdentityKey: string;
    };
    oneTimePreKeyReservationToken?: string;
    peerIdentityKeyB64?: string;
  }>;
  bootstrapInboundSession: (params: {
    localDeviceId: string;
    senderDeviceId: string;
    x3dhHeader: {
      senderIdentityKey: string;
      ephemeralKey: string;
      signedPreKeyId: number;
      oneTimePreKeyId?: number;
    };
    initialMessage: {
      header: { dh: Uint8Array; pn: number; n: number };
      ciphertext: Uint8Array;
    };
    associatedData: Uint8Array;
  }) => Promise<{
    session: RatchetState;
    plaintext: Uint8Array;
    consumedOneTimePreKeyId?: number;
    commit: () => Promise<void>;
  }>;
}

interface CreateMessageSessionRuntimeOptions {
  getStorageKey: () => CryptoKey | null;
  getIdentityKeyPair: () => KeyPair | null;
  fetchPrekeyBundle: (userId: string, deviceId: string) => Promise<PreKeyBundle>;
}

interface TofuRecord {
  identityKeyB64: string;
}

async function loadTofuRecord(
  storageKey: CryptoKey,
  deviceId: string
): Promise<TofuRecord | null> {
  return loadDecrypted<TofuRecord>(storageKey, `tofu:${deviceId}`);
}

async function saveTofuRecord(
  storageKey: CryptoKey,
  deviceId: string,
  identityKeyB64: string
): Promise<void> {
  await storeEncrypted(storageKey, `tofu:${deviceId}`, { identityKeyB64 } satisfies TofuRecord);
}

async function checkAndRecordTofu(
  storageKey: CryptoKey,
  deviceId: string,
  identityKeyB64: string
): Promise<void> {
  const existing = await loadTofuRecord(storageKey, deviceId);
  if (existing) {
    if (existing.identityKeyB64 !== identityKeyB64) {
      throw new IdentityKeyChangedError(deviceId, existing.identityKeyB64, identityKeyB64);
    }
  } else {
    await saveTofuRecord(storageKey, deviceId, identityKeyB64);
  }
}

export function createMessageSessionRuntime(
  options: CreateMessageSessionRuntimeOptions
): MessageSessionRuntime {
  const loadSession = async (deviceId: string): Promise<RatchetState | null> => {
    const storageKey = options.getStorageKey();
    if (!storageKey) return null;

    const data = await loadDecrypted<ReturnType<typeof serializeRatchetState>>(
      storageKey,
      `session:${deviceId}`
    );
    if (!data) return null;

    return deserializeRatchetState(data);
  };

  const saveSession = async (deviceId: string, state: RatchetState): Promise<void> => {
    const storageKey = options.getStorageKey();
    if (!storageKey) return;
    await storeEncrypted(storageKey, `session:${deviceId}`, serializeRatchetState(state));
  };

  const clearSession = async (deviceId: string): Promise<void> => {
    const storageKey = options.getStorageKey();
    if (!storageKey) return;
    await storeEncrypted(storageKey, `session:${deviceId}`, null);
  };

  const resetTrustedIdentity = async (deviceId: string): Promise<void> => {
    const storageKey = options.getStorageKey();
    if (!storageKey) return;
    await storeEncrypted(storageKey, `tofu:${deviceId}`, null);
  };

  const getOrCreateOutboundSession = async (
    recipientUserId: string,
    recipientDeviceId: string
  ): Promise<{
    state: RatchetState;
    x3dhHeader?: {
      ephemeralKey: string;
      signedPreKeyId: number;
      oneTimePreKeyId?: number;
      senderIdentityKey: string;
    };
    oneTimePreKeyReservationToken?: string;
    peerIdentityKeyB64?: string;
  }> => {
    const existing = await loadSession(recipientDeviceId);
    if (existing) {
      return { state: existing };
    }

    const myKeyPair = options.getIdentityKeyPair();
    if (!myKeyPair) {
      throw new Error("No identity key pair in memory. Sign in again to re-provision E2EE keys.");
    }

    const bundle = await options.fetchPrekeyBundle(recipientUserId, recipientDeviceId);

    // TOFU: verify (or record on first contact) the recipient's identity key.
    const storageKey = options.getStorageKey();
    if (storageKey) {
      await checkAndRecordTofu(storageKey, recipientDeviceId, bundle.identityKeyPublic);
    }

    const recipientIdentityKey = fromBase64Url(bundle.identityKeyPublic);
    const recipientSigningKey = fromBase64Url(bundle.signingKeyPublic);
    const recipientSignedPreKeyPublic = fromBase64Url(bundle.signedPreKey.publicKey);
    const recipientSignedPreKeySignature = fromBase64Url(bundle.signedPreKey.signature);
    const ephemeralKeyPair = await generateKeyPair();

    const { sharedSecret } = await x3dhSend(
      myKeyPair,
      ephemeralKeyPair,
      {
        registrationId: bundle.registrationId,
        identityKey: recipientIdentityKey,
        signingKey: recipientSigningKey,
        signedPreKey: {
          id: bundle.signedPreKey.id,
          publicKey: recipientSignedPreKeyPublic,
          signature: recipientSignedPreKeySignature,
        },
        oneTimePreKey: bundle.oneTimePreKey
          ? {
            id: bundle.oneTimePreKey.id,
            publicKey: fromBase64Url(bundle.oneTimePreKey.publicKey),
          }
          : undefined,
      }
    );

    const state = await initSender(sharedSecret, recipientSignedPreKeyPublic);
    sharedSecret.fill(0);

    await saveSession(recipientDeviceId, state);

    return {
      state,
      x3dhHeader: {
        ephemeralKey: toBase64Url(ephemeralKeyPair.publicKey),
        signedPreKeyId: bundle.signedPreKey.id,
        oneTimePreKeyId: bundle.oneTimePreKey?.id,
        senderIdentityKey: toBase64Url(myKeyPair.publicKey),
      },
      oneTimePreKeyReservationToken: bundle.oneTimePreKey?.reservationToken,
      peerIdentityKeyB64: bundle.identityKeyPublic,
    };
  };

  const bootstrapInboundSession = async (params: {
    localDeviceId: string;
    senderDeviceId: string;
    x3dhHeader: {
      senderIdentityKey: string;
      ephemeralKey: string;
      signedPreKeyId: number;
      oneTimePreKeyId?: number;
    };
    initialMessage: {
      header: { dh: Uint8Array; pn: number; n: number };
      ciphertext: Uint8Array;
    };
    associatedData: Uint8Array;
  }): Promise<{
    session: RatchetState;
    plaintext: Uint8Array;
    consumedOneTimePreKeyId?: number;
    commit: () => Promise<void>;
  }> => {
    const receiverIdentityKeyPair = options.getIdentityKeyPair();
    if (!receiverIdentityKeyPair) {
      throw new Error("No identity key pair in memory. Sign in again to re-provision E2EE keys.");
    }

    const storageKey = options.getStorageKey();
    const deviceKeys = storageKey
      ? await loadDecrypted<StoredDeviceKeys>(
        storageKey,
        `device:${params.localDeviceId}:keys`
      )
      : null;

    if (!deviceKeys) {
      throw new Error(`Device keys not found in local storage for ${params.localDeviceId}`);
    }

    const receiverSignedPreKeyPair = await restoreKeyPairFromPrivateKey(
      fromBase64Url(deviceKeys.signedPreKeyPriv),
      deviceKeys.signedPreKeyPub ? fromBase64Url(deviceKeys.signedPreKeyPub) : undefined
    );

    let receiverOneTimePreKeyPair:
      | {
        id: number;
        publicKey: Uint8Array;
        privateKey: Uint8Array & { readonly __brand: "PrivateKeyBytes" };
      }
      | undefined;
    if (params.x3dhHeader.oneTimePreKeyId !== undefined) {
      const oneTimePreKeyPrivate = deviceKeys.otkPrivateKeys?.[params.x3dhHeader.oneTimePreKeyId];
      if (!oneTimePreKeyPrivate) {
        throw new Error(
          `Missing one-time prekey ${params.x3dhHeader.oneTimePreKeyId} for device ${params.localDeviceId}. ` +
          "Server returned an OTK we don't have a private half for; X3DH cannot complete."
        );
      }

      receiverOneTimePreKeyPair = {
        id: params.x3dhHeader.oneTimePreKeyId,
        ...(await restoreKeyPairFromPrivateKey(fromBase64Url(oneTimePreKeyPrivate))),
      };
    }

    // TOFU: verify (or record on first contact) the sender's identity key.
    if (storageKey) {
      await checkAndRecordTofu(storageKey, params.senderDeviceId, params.x3dhHeader.senderIdentityKey);
    }

    const bootstrap = await bootstrapReceiverSession({
      receiverIdentityKeyPair,
      receiverSignedPreKeyPair: {
        ...receiverSignedPreKeyPair,
        id: deviceKeys.signedPreKeyId,
      },
      receiverOneTimePreKeyPair,
      senderIdentityPublicKey: fromBase64Url(params.x3dhHeader.senderIdentityKey),
      senderEphemeralPublicKey: fromBase64Url(params.x3dhHeader.ephemeralKey),
      initialMessage: params.initialMessage,
      associatedData: params.associatedData,
    });

    const commit = async (): Promise<void> => {
      await saveSession(params.senderDeviceId, bootstrap.session);

      if (
        bootstrap.consumedOneTimePreKeyId === undefined ||
        !storageKey ||
        deviceKeys.otkPrivateKeys?.[bootstrap.consumedOneTimePreKeyId] === undefined
      ) {
        return;
      }

      const nextDeviceKeys: StoredDeviceKeys = {
        ...deviceKeys,
        otkPrivateKeys: {
          ...deviceKeys.otkPrivateKeys,
        },
      };
      delete nextDeviceKeys.otkPrivateKeys?.[bootstrap.consumedOneTimePreKeyId];
      await storeEncrypted(storageKey, `device:${params.localDeviceId}:keys`, nextDeviceKeys);
    };

    return {
      session: bootstrap.session,
      plaintext: bootstrap.plaintext,
      consumedOneTimePreKeyId: bootstrap.consumedOneTimePreKeyId,
      commit,
    };
  };

  return {
    loadSession,
    saveSession,
    clearSession,
    resetTrustedIdentity,
    getOrCreateOutboundSession,
    bootstrapInboundSession,
  };
}
