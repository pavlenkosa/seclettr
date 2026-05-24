import type { AuthErrorCode } from "@/lib/auth-error-codes";
import type {
  AuthLockedSnapshot,
  AuthReadySnapshot,
  AuthRecoveryReason,
  AuthState,
  SignedOutStateFields,
} from "./auth-types";

export function buildSignedOutState(): Pick<AuthState, SignedOutStateFields> {
  return {
    userId: null,
    deviceId: null,
    username: null,
    displayName: null,
    bio: null,
    avatarKey: null,
    accessToken: null,
    identityDhKeyPair: null,
    storageKey: null,
    storageKeyVolatile: false,
    authLifecycle: "signed_out",
    authRecoveryReason: null,
    authOperation: "idle",
    error: null,
    cryptoReady: false,
  };
}

export function buildReadyState(
  session: AuthReadySnapshot
): Pick<AuthState, SignedOutStateFields> {
  return {
    userId: session.userId,
    deviceId: session.deviceId,
    username: session.username,
    displayName: session.displayName,
    bio: session.bio,
    avatarKey: session.avatarKey,
    accessToken: session.accessToken,
    identityDhKeyPair: session.identityDhKeyPair,
    storageKey: session.storageKey,
    storageKeyVolatile: session.storageKeyVolatile,
    authLifecycle: "ready",
    authRecoveryReason: null,
    authOperation: "idle",
    error: null,
    cryptoReady: session.cryptoSyncReady,
  };
}

export function buildRecoveryRequiredState(
  reason: AuthRecoveryReason,
  error: AuthErrorCode
): Pick<AuthState, SignedOutStateFields> {
  return {
    userId: null,
    deviceId: null,
    username: null,
    displayName: null,
    bio: null,
    avatarKey: null,
    accessToken: null,
    identityDhKeyPair: null,
    storageKey: null,
    storageKeyVolatile: false,
    authLifecycle: "recovery_required",
    authRecoveryReason: reason,
    authOperation: "idle",
    error,
    cryptoReady: false,
  };
}

export function buildLockedState(
  snapshot: AuthLockedSnapshot
): Pick<AuthState, SignedOutStateFields> {
  return {
    userId: snapshot.userId,
    deviceId: snapshot.deviceId,
    username: snapshot.username,
    displayName: snapshot.displayName,
    bio: snapshot.bio,
    avatarKey: snapshot.avatarKey,
    accessToken: null,
    identityDhKeyPair: null,
    storageKey: null,
    storageKeyVolatile: false,
    authLifecycle: "locked",
    authRecoveryReason: null,
    authOperation: "idle",
    error: null,
    cryptoReady: false,
  };
}
