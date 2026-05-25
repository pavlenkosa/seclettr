import { isNativePlatform } from "./native-platform";

export type BiometricAvailability =
  | { available: true; biometryType: BiometryTypeName }
  | { available: false; reason: string };

type BiometryTypeName = "TouchID" | "FaceID" | "Fingerprint" | "FaceAuthentication" | "IrisAuthentication" | "MultipleFingerprint" | "Unknown";

/** BiometryType enum values returned by capacitor-native-biometric */
const BIOMETRY_TYPE_NAMES: Record<number, BiometryTypeName> = {
  1: "TouchID",
  2: "FaceID",
  3: "Fingerprint",
  4: "FaceAuthentication",
  5: "IrisAuthentication",
  6: "MultipleFingerprint",
};

interface NativeBiometricPlugin {
  isAvailable(opts?: { useFallback?: boolean }): Promise<{
    isAvailable: boolean;
    biometryType: number;
    errorCode?: number;
  }>;
  verifyIdentity(opts?: {
    reason?: string;
    title?: string;
    subtitle?: string;
    negativeButtonText?: string;
    useFallback?: boolean;
  }): Promise<void>;
  setCredentials(opts: { username: string; password: string; server: string }): Promise<void>;
  getCredentials(opts: { server: string }): Promise<{ username: string; password: string }>;
  deleteCredentials(opts: { server: string }): Promise<void>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

const BIOMETRIC_SERVER_KEY = "seclettr.biometric.pin.v1";

function getPlugin(): NativeBiometricPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["NativeBiometric"];
  return plugin ? (plugin as NativeBiometricPlugin) : null;
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  const plugin = getPlugin();
  if (!plugin) return { available: false, reason: "not_native" };

  try {
    const result = await plugin.isAvailable();
    if (!result.isAvailable) {
      return { available: false, reason: String(result.errorCode ?? "unavailable") };
    }
    const biometryType = BIOMETRY_TYPE_NAMES[result.biometryType] ?? "Unknown";
    return { available: true, biometryType };
  } catch {
    return { available: false, reason: "check_failed" };
  }
}

export async function authenticateBiometric(reason: string): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;

  try {
    await plugin.verifyIdentity({ reason, negativeButtonText: "Отмена" });
    return true;
  } catch {
    return false;
  }
}

export async function storePinBiometric(pin: string): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;

  try {
    // Delete any stale/invalidated Keystore entry first.
    // Leftover entries from previous installs or failed attempts cause
    // setCredentials to silently fail on some Android versions.
    await plugin.deleteCredentials({ server: BIOMETRIC_SERVER_KEY }).catch(() => undefined);
    await plugin.setCredentials({
      username: "pin",
      password: pin,
      server: BIOMETRIC_SERVER_KEY,
    });
    return true;
  } catch {
    return false;
  }
}

export async function retrievePinBiometric(reason: string): Promise<string | null> {
  const plugin = getPlugin();
  if (!plugin) return null;

  try {
    await plugin.verifyIdentity({ reason, negativeButtonText: "Ввести вручную" });
    const result = await plugin.getCredentials({ server: BIOMETRIC_SERVER_KEY });
    return result.password || null;
  } catch {
    return null;
  }
}

export async function clearPinBiometric(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;

  try {
    await plugin.deleteCredentials({ server: BIOMETRIC_SERVER_KEY });
  } catch {
    /* ignore — may not exist */
  }
}
