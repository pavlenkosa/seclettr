import { isNativePlatform } from "./native-platform";

interface CapacitorAppPlugin {
  addListener: (event: string, handler: (data: { url: string }) => void) => Promise<{ remove: () => void }>;
}

interface CapacitorBridge {
  App?: CapacitorAppPlugin;
  Plugins?: {
    App?: CapacitorAppPlugin;
  };
}

function getAppPlugin(): CapacitorAppPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return cap?.App ?? cap?.Plugins?.App ?? null;
}

export function initDeepLinkHandler(): void {
  if (!isNativePlatform()) return;
  const plugin = getAppPlugin();
  if (!plugin) return;

  void plugin.addListener("appUrlOpen", (data: { url: string }) => {
    if (!data?.url) return;
    const url = new URL(data.url);
    const path = url.pathname + url.search;
    window.history.replaceState(null, "", path);
  });
}
