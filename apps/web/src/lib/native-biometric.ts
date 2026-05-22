import { isNativePlatform } from "./native-platform";

type BiometryTypeName = "TouchID" | "FaceID" | "Fingerprint" | "FaceAuthentication" | "IrisAuthentication" | "MultipleFingerprint" | "Unknown";

export type BiometricAvailability =
  | { available: true; biometryType: BiometryTypeName }
  | { available: false; reason: string };

interface BiometricAuthPlugin {
  checkBiometry: () => Promise<{
    isAvailable: boolean;
    biometryType: number;
    reason?: string;
  }>;
  authenticate: (opts: { reason: string; cancelTitle?: string; allowDeviceCredential?: boolean }) => Promise<void>;
  setSecret: (opts: { key: string; value: string }) => Promise<void>;
  getSecret: (opts: { key: string; reason: string; cancelTitle?: string }) => Promise<{ value: string }>;
  deleteSecret: (opts: { key: string }) => Promise<void>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

const BIOMETRY_TYPE_NAMES: Record<number, BiometryTypeName> = {
  1: "TouchID",
  2: "FaceID",
  3: "Fingerprint",
  4: "FaceAuthentication",
  5: "IrisAuthentication",
  6: "MultipleFingerprint",
};

function getPlugin(): BiometricAuthPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["BiometricAuth"];
  return plugin ? (plugin as BiometricAuthPlugin) : null;
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  const plugin = getPlugin();
  if (!plugin) return { available: false, reason: "not_native" };

  try {
    const result = await plugin.checkBiometry();
    if (!result.isAvailable) {
      return { available: false, reason: result.reason ?? "unavailable" };
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
    await plugin.authenticate({ reason });
    return true;
  } catch {
    return false;
  }
}

const BIOMETRIC_PIN_KEY = "seclettr.biometric.pin.v1";

export async function storePinBiometric(pin: string): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;

  try {
    await plugin.setSecret({ key: BIOMETRIC_PIN_KEY, value: pin });
    return true;
  } catch {
    return false;
  }
}

export async function retrievePinBiometric(reason: string): Promise<string | null> {
  const plugin = getPlugin();
  if (!plugin) return null;

  try {
    const result = await plugin.getSecret({ key: BIOMETRIC_PIN_KEY, reason });
    return result.value || null;
  } catch {
    return null;
  }
}

export async function clearPinBiometric(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;

  try {
    await plugin.deleteSecret({ key: BIOMETRIC_PIN_KEY });
  } catch {
    /* ignore — may not exist */
  }
}
