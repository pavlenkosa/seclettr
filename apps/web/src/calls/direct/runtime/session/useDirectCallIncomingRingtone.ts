import { useCallback, useEffect } from "react";
import incomingCallRingtone from "@/components/sound/seclettr-marimba.mp3";

interface UseDirectCallIncomingRingtoneOptions {
  incomingCallId: string | null;
  incomingRingtoneRef: React.MutableRefObject<HTMLAudioElement | null>;
}

export function useDirectCallIncomingRingtone({
  incomingCallId,
  incomingRingtoneRef,
}: UseDirectCallIncomingRingtoneOptions) {
  const stopIncomingRingtone = useCallback(() => {
    const ringtone = incomingRingtoneRef.current;
    if (!ringtone) return;
    ringtone.pause();
    ringtone.currentTime = 0;
  }, [incomingRingtoneRef]);

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }
    const ringtone = new Audio(incomingCallRingtone);
    ringtone.loop = true;
    ringtone.preload = "auto";
    incomingRingtoneRef.current = ringtone;
    return () => {
      ringtone.pause();
      ringtone.src = "";
      incomingRingtoneRef.current = null;
    };
  }, [incomingRingtoneRef]);

  useEffect(() => {
    const ringtone = incomingRingtoneRef.current;
    if (!ringtone) return;
    if (!incomingCallId) {
      stopIncomingRingtone();
      return;
    }
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
  }, [incomingCallId, incomingRingtoneRef, stopIncomingRingtone]);

  return {
    stopIncomingRingtone,
  };
}
