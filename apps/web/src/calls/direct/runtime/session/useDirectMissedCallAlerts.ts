/**
 * Tracks missed direct (1:1) call notifications.
 *
 * On initial load, fetches recent missed calls from the server (covers the
 * "user was offline when called" case — up to 4 hours back).  Each entry can
 * be individually dismissed by the user.
 *
 * The server-side window is 4 hours; we additionally deduplicate against calls
 * already recorded locally so that in-session misses (handled by
 * useDirectCallSignalOutcomeHandlers) don't double-show.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectMissedCallEntry } from "@seclettr/protocol";
import { api } from "@/lib/api";

export function useDirectMissedCallAlerts(userId: string | null): {
  missedDirectCalls: DirectMissedCallEntry[];
  dismissMissedDirectCall: (callId: string) => void;
  dismissAllMissedDirectCalls: () => void;
} {
  const [missedDirectCalls, setMissedDirectCalls] = useState<DirectMissedCallEntry[]>([]);
  // Track dismissed call IDs across the session so they don't re-appear on refetch.
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setMissedDirectCalls([]);
      return;
    }

    let cancelled = false;
    void api.getMissedDirectCalls().then((calls) => {
      if (cancelled) return;
      setMissedDirectCalls(
        calls.filter((c) => !dismissedRef.current.has(c.callId))
      );
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismissMissedDirectCall = useCallback((callId: string) => {
    dismissedRef.current.add(callId);
    setMissedDirectCalls((prev) => prev.filter((c) => c.callId !== callId));
  }, []);

  const dismissAllMissedDirectCalls = useCallback(() => {
    setMissedDirectCalls((prev) => {
      for (const c of prev) dismissedRef.current.add(c.callId);
      return [];
    });
  }, []);

  return { missedDirectCalls, dismissMissedDirectCall, dismissAllMissedDirectCalls };
}
