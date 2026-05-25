import { useCallback, useEffect } from "react";
import outgoingCallRingtone from "@/components/sound/seclettr-outgoing-ring.mp3";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";

interface UseDirectCallOutgoingRingtoneOptions {
  active: ActiveCall | null;
  outgoingRingtoneRef: React.MutableRefObject<HTMLAudioElement | null>;
}

export function useDirectCallOutgoingRingtone({
  active,
  outgoingRingtoneRef,
}: UseDirectCallOutgoingRingtoneOptions) {
  const stopOutgoingRingtone = useCallback(() => {
    const ringtone = outgoingRingtoneRef.current;
    if (!ringtone) return;
    ringtone.pause();
    ringtone.currentTime = 0;
  }, [outgoingRingtoneRef]);

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }
    const ringtone = new Audio(outgoingCallRingtone);
    ringtone.loop = true;
    ringtone.preload = "auto";
    outgoingRingtoneRef.current = ringtone;
    return () => {
      ringtone.pause();
      ringtone.src = "";
      outgoingRingtoneRef.current = null;
    };
  }, [outgoingRingtoneRef]);

  useEffect(() => {
    const ringtone = outgoingRingtoneRef.current;
    if (!ringtone) return;
    if (active?.direction !== "outbound" || active.state !== "ringing") {
      stopOutgoingRingtone();
      return;
    }
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
  }, [active, outgoingRingtoneRef, stopOutgoingRingtone]);

  return {
    stopOutgoingRingtone,
  };
}
