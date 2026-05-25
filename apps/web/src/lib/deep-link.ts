import { isNativePlatform } from "./native-platform";

interface CapacitorApp {
  addListener: (event: string, handler: (data: { url: string }) => void) => Promise<{ remove: () => void }>;
}

function getAppPlugin(): CapacitorApp | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: { App?: CapacitorApp } }).Capacitor;
  return cap?.App ?? null;
}

export function initDeepLinkHandler(): void {
  const app = getAppPlugin();
  if (!app) return;

  app.addListener("appUrlOpen", (data: { url: string }) => {
    if (!data?.url) return;
    const url = new URL(data.url);
    const path = url.pathname + url.search;
    window.history.replaceState(null, "", path);
  });
}
