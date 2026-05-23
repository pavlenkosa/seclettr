import type { KeyPair } from "@seclettr/crypto";
import type { AuthErrorCode } from "@/lib/auth-error-codes";

export type AuthLifecycleState =
  | "signed_out"
  | "restoring"
  | "ready"
  | "locked"
  | "recovery_required";

export type AuthRecoveryReason =
  | "missing_local_keys"
  | "unexpected_restore_failure";

export type AuthOperationState = "idle" | "unlocking";

export interface AuthReadySnapshot {
  userId: string;
  deviceId: string;
  username: string | null;
  accessToken: string;
  identityDhKeyPair: KeyPair;
  storageKey: CryptoKey;
  storageKeyVolatile: boolean;
  cryptoSyncReady: boolean;
}

export interface AuthLockedSnapshot {
  userId: string;
  deviceId: string;
  username: string | null;
}

export type RestoreSessionResult =
  | { outcome: "signed_out" }
  | { outcome: "ready"; session: AuthReadySnapshot }
  | { outcome: "locked"; session: AuthLockedSnapshot }
  | {
      outcome: "recovery_required";
      reason: AuthRecoveryReason;
      errorCode: AuthErrorCode;
    };

export type SignedOutStateFields =
  | "userId"
  | "deviceId"
  | "username"
  | "accessToken"
  | "identityDhKeyPair"
  | "storageKey"
  | "storageKeyVolatile"
  | "authLifecycle"
  | "authRecoveryReason"
  | "authOperation"
  | "error"
  | "cryptoReady";

export interface AuthState {
  userId: string | null;
  deviceId: string | null;
  username: string | null;
  accessToken: string | null;
  identityDhKeyPair: KeyPair | null;
  storageKey: CryptoKey | null;
  /** True when the storage key could not be persisted to IndexedDB and lives
   *  only in RAM — all encrypted data will be lost on page reload. */
  storageKeyVolatile: boolean;
  authLifecycle: AuthLifecycleState;
  authRecoveryReason: AuthRecoveryReason | null;
  authOperation: AuthOperationState;
  error: string | AuthErrorCode | null;

  /** True when a PIN passcode is required to unlock. */
  pinEnabled: boolean;

  /**
   * True when current-device crypto material has been confirmed synced with the
   * server. When false the session is functionally usable for chat, but
   * security-critical features (call signing, key exchange) will fail. This
   * state is surfaced so UI and call runtimes can react explicitly rather than
   * encountering a silent null signer.
   */
  cryptoReady: boolean;

  register: (username: string, password: string, deviceName: string) => Promise<void>;
  login: (username: string, password: string, deviceName: string) => Promise<void>;
  tryRestoreSession: () => Promise<boolean>;
  /** Lock the session: clear keys + decrypted messages from memory, disconnect WS. */
  lock: () => Promise<void>;
  /** Unlock: verify PIN (if set), then restore session from IDB + JWT cookie. Returns true on success. */
  unlock: (pin?: string) => Promise<boolean>;
  /** Set (or update) the app-lock PIN passcode. */
  setPin: (pin: string) => Promise<void>;
  /** Remove the app-lock PIN passcode. */
  removePin: () => Promise<void>;
  /** Sign out the current web session and clear local secure material on this browser. */
  logout: () => Promise<void>;
  /** Destructively forget this browser's local device state and encrypted key material. */
  resetLocalDeviceData: () => Promise<void>;
  clearError: () => void;
}
