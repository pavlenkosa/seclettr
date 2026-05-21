import { isNativePlatform } from "./native-platform";

interface AppPlugin {
  addListener: (event: string, handler: (data: { canGoBack: boolean }) => void) => Promise<{ remove: () => void }>;
  exitApp: () => Promise<void>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

function getPlugin(): AppPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["App"];
  return plugin ? (plugin as AppPlugin) : null;
}

// LIFO stack of close-handlers registered by modals/panels.
// Each entry is a function that closes something (modal, panel, drawer, etc.).
const handlerStack: Array<() => void> = [];

export function pushBackHandler(handler: () => void): () => void {
  handlerStack.push(handler);
  return () => {
    const idx = handlerStack.lastIndexOf(handler);
    if (idx !== -1) handlerStack.splice(idx, 1);
  };
}

let _initialized = false;

export function initNativeBackHandler(): void {
  if (_initialized || !isNativePlatform()) return;
  _initialized = true;

  const plugin = getPlugin();
  if (!plugin) return;

  void plugin.addListener("backButton", ({ canGoBack }) => {
    // 1. Close topmost overlay if any
    if (handlerStack.length > 0) {
      handlerStack[handlerStack.length - 1]!();
      return;
    }

    // 2. Navigate back in browser history
    if (canGoBack) {
      window.history.back();
      return;
    }

    // 3. Exit the app
    void plugin.exitApp();
  });
}
