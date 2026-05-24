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

/** Returns true when the SPA query-string has an active conversation/group param. */
function hasActiveThread(): boolean {
  try {
    const search = window.location.search;
    return (
      search.includes("?chat=") ||
      search.includes("?group=") ||
      search.includes("?plain-chat=") ||
      search.includes("?plain-group=") ||
      search.includes("?saved=")
    );
  } catch {
    return false;
  }
}

let _initialized = false;

export function initNativeBackHandler(): void {
  if (_initialized || !isNativePlatform()) return;
  _initialized = true;

  const plugin = getPlugin();
  if (!plugin) return;

  void plugin.addListener("backButton", () => {
    // 1. Close topmost overlay if any
    if (handlerStack.length > 0) {
      handlerStack[handlerStack.length - 1]!();
      return;
    }

    // 2. SPA back-navigation — don't trust the native canGoBack property
    // because Android WebView does not reliably track pushState history.
    // Instead check our own query-string convention.
    if (hasActiveThread()) {
      // If the WebView history stack has entries, cleanly navigate back.
      // Fallback: clear the search params directly.
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.search = "";
      }
      return;
    }

    // 3. Exit the app
    void plugin.exitApp();
  });
}
