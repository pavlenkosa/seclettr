/**
 * useAppForegroundResync — forces a token refresh + WS reconnect when the
 * app returns to the foreground after being backgrounded on Android/iOS.
 *
 * Problem: Android WebView suspends JS while backgrounded.
 *   - The WebSocket TCP connection is killed by the OS.
 *   - The auto-reconnect timer is frozen and may fire late.
 *   - The access token may have expired during the gap.
 *
 * Fix: on `visibilitychange → visible`, immediately try to refresh the token
 * and force the WS to reconnect with a fresh credential, rather than waiting
 * for the exponential-backoff cycle to eventually succeed.
 *
 * The store-level message lists will catch up through the normal subscription
 * path once the WS is live again; individual conversation histories are
 * fetched on demand when the user opens them.
 */
import { useEffect, useRef } from "react";
import { refreshSessionAccessToken } from "./session";
import { wsClient } from "./websocket";

/** Minimum ms between two forced resyncs (debounce rapid visibility flips). */
const RESYNC_DEBOUNCE_MS = 3_000;

export function useAppForegroundResync(isReady: boolean): void {
  const lastResyncAt = useRef(0);

  useEffect(() => {
    if (!isReady) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastResyncAt.current < RESYNC_DEBOUNCE_MS) return;
      lastResyncAt.current = now;

      void (async () => {
        try {
          const token = await refreshSessionAccessToken();
          if (!token) return; // Server rejected — sign-out already triggered
          // If the WS is not connected (died while backgrounded), reconnect
          // immediately with the fresh token instead of waiting for backoff.
          if (!wsClient.connected) {
            wsClient.connect(token);
          }
        } catch {
          // Network still not ready — the WS auto-reconnect will retry.
        }
      })();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isReady]);
}
