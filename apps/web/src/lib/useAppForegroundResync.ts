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

    const handleResync = () => {
      const now = Date.now();
      if (now - lastResyncAt.current < RESYNC_DEBOUNCE_MS) return;
      lastResyncAt.current = now;
      void resync();
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") handleResync();
    });

    let capRemove: (() => void) | undefined;
    if (isNativePlatform()) {
      import("@capacitor/app").then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) handleResync();
        }).then((listener) => {
          capRemove = () => listener.remove();
        });
      });
    }

    return () => {
      capRemove?.();
    };
  }, [isReady]);
}
