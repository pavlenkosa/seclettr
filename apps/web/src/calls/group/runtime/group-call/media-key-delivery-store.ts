import type { GroupCallMediaKeyDeliveryStore } from "./media-key-delivery";

const STORAGE_KEY_PREFIX = "sc.mkd.";
const MAX_ENTRIES = 500;

function storageKey(callId: string, deviceId: string): string {
  return `${STORAGE_KEY_PREFIX}${callId}:${deviceId}`;
}

export function createSessionStorageDeliveryStore(
  callId: string,
  deviceId: string
): GroupCallMediaKeyDeliveryStore {
  const key = storageKey(callId, deviceId);

  const readRaw = (): string[] => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]).filter((v) => typeof v === "string") : [];
    } catch {
      return [];
    }
  };

  const writeRaw = (entries: string[]): void => {
    try {
      sessionStorage.setItem(key, JSON.stringify(entries));
    } catch {
      // Storage quota exceeded — skip persistence silently.
    }
  };

  return {
    load(): Set<string> {
      return new Set(readRaw());
    },

    add(deliveryKey: string): void {
      const entries = readRaw();
      if (entries.includes(deliveryKey)) return;
      entries.push(deliveryKey);
      // Prune oldest entries if the set grows too large.
      writeRaw(entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries);
    },

    clear(): void {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Ignore.
      }
    },
  };
}
