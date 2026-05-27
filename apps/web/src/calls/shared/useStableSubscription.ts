import { useRef } from "react";

/**
 * useStableSubscription — run-ID guard for subscription effects.
 *
 * Call once per logical subscription in a component.  Each time the effect
 * fires it calls `open()` to capture a fresh run-ID token; the returned
 * `isCurrent()` predicate returns `true` only for callbacks belonging to
 * *this* mount of the effect.  Call `close()` in the effect cleanup to
 * invalidate all pending async callbacks from the outgoing subscription.
 *
 * Eliminates the 3× manually replicated `subscriptionRunIdRef` pattern in
 * `useGroupCallSessionSubscriptions`:
 *
 * ```ts
 * const sub = useStableSubscription();
 *
 * useEffect(() => {
 *   const { isCurrent, close } = sub.open();
 *
 *   const unsubscribe = wsClient.on((msg) => {
 *     if (!isCurrent()) return;
 *     handleMessage(msg);
 *   });
 *
 *   return () => { close(); unsubscribe(); };
 * }, [deps]);
 * ```
 */
export interface StableSubscriptionToken {
  /** Returns `true` while this subscription instance is still active. */
  isCurrent: () => boolean;
  /** Invalidates all callbacks from this subscription instance.
   *  Call at the top of the effect cleanup before any other teardown. */
  close: () => void;
}

export interface StableSubscriptionHandle {
  /** Starts a new subscription instance.  Call at the top of the effect body. */
  open: () => StableSubscriptionToken;
}

export function useStableSubscription(): StableSubscriptionHandle {
  const runIdRef = useRef(0);

  return {
    open(): StableSubscriptionToken {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      return {
        isCurrent: () => runIdRef.current === runId,
        close: () => {
          if (runIdRef.current === runId) {
            runIdRef.current += 1;
          }
        },
      };
    },
  };
}
