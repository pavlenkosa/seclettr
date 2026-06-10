import { useEffect, useRef } from "react";
import { isNativePlatform } from "./native-platform";
import { refreshSessionAccessToken } from "./session";
import { wsClient } from "./websocket";

const RESYNC_DEBOUNCE_MS = 3_000;

async function resync(): Promise<void> {
  try {
    const token = await refreshSessionAccessToken();
    if (!token) return;
    wsClient.disconnect();
    wsClient.connect(token);
  } catch {
    // WS auto-reconnect will retry
  }
}

export function useAppForegroundResync(isReady: boolean): void {
  const lastResyncAt = useRef(0);

  useEffect(() => {
    if (!isReady) return;

    // The session was just restored and the access token is already fresh.
    // Initialising lastResyncAt here suppresses the appStateChange / visibilitychange
    // event that Capacitor fires at the very moment the app becomes active after a
    // process kill — without this guard that event triggers an immediate second
    // /auth/refresh while the network stack is still stabilising, causing a
    // "Failed to fetch" that stalls WS reconnection for several seconds.
    lastResyncAt.current = Date.now();

    let disposed = false;
    let capRemove: (() => void) | null = null;

    const handleResync = () => {
      const now = Date.now();
      if (now - lastResyncAt.current < RESYNC_DEBOUNCE_MS) return;
      lastResyncAt.current = now;
      void resync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleResync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (isNativePlatform()) {
      import("@capacitor/app").then(({ App }) => {
        if (disposed) {
          return null;
        }

        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) handleResync();
        }).then((listener) => {
          if (disposed) {
            void listener.remove();
            return;
          }
          capRemove = () => { void listener.remove(); };
        }).catch(() => {
          // Capacitor not available (web/SSR)
        });
      }).catch(() => {
        // @capacitor/app not installed (web/SSR)
      });
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      capRemove?.();
    };
  }, [isReady]);
}
