import { useEffect } from "react";
import { api } from "@/lib/api";
import { logGroupCallWarn } from "./group-call/logger";

const GROUP_CALL_HEARTBEAT_INTERVAL_MS = 15_000;

export function useGroupCallPresenceHeartbeat(callId: string | null): void {
  useEffect(() => {
    if (!callId) return;
    const id = setInterval(() => {
      api.groupCallHeartbeat(callId).catch((err) => {
        logGroupCallWarn("[group-call] heartbeat failed", err);
      });
    }, GROUP_CALL_HEARTBEAT_INTERVAL_MS);
    return () => { clearInterval(id); };
  }, [callId]);
}
