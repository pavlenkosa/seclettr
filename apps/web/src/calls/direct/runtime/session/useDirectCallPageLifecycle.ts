import { useEffect, useRef, type MutableRefObject } from "react";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";

type ActiveCallSnapshot = {
  callId: string;
};

export function useDirectCallPageLifecycle(params: {
  activeRef: MutableRefObject<ActiveCallSnapshot | null>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
}): void {
  const { activeRef, debugCallMedia } = params;
  const lastSentCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    const notifyHangupOnPageExit = (trigger: "pagehide" | "beforeunload") => {
      const active = activeRef.current;
      if (!active?.callId) return;
      if (lastSentCallIdRef.current === active.callId) return;
      lastSentCallIdRef.current = active.callId;

      debugCallMedia("page-lifecycle-hangup", {
        callId: active.callId,
        trigger,
      });

      try {
        wsClient.send({ type: "call.hangup", callId: active.callId });
      } catch { /* best-effort hangup on page exit */ }

      api.directHangupCallKeepalive(active.callId);
    };

    const handlePageHide = () => {
      notifyHangupOnPageExit("pagehide");
    };
    const handleBeforeUnload = () => {
      notifyHangupOnPageExit("beforeunload");
    };

    globalThis.addEventListener("pagehide", handlePageHide);
    globalThis.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      globalThis.removeEventListener("pagehide", handlePageHide);
      globalThis.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [activeRef, debugCallMedia]);
}
