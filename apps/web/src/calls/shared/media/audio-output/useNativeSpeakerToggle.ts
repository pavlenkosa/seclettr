import { useCallback, useEffect, useState } from "react";
import {
  getNativeSpeakerOn,
  isNativeAudioRouteSupported,
  setNativeSpeaker,
} from "@/lib/native-audio-route";

interface NativeSpeakerToggleResult {
  supported: boolean;
  speakerOn: boolean;
  toggle: () => void;
}

export function useNativeSpeakerToggle(): NativeSpeakerToggleResult {
  const supported = isNativeAudioRouteSupported();
  const [speakerOn, setSpeakerOn] = useState(false);

  useEffect(() => {
    if (!supported) return;
    void getNativeSpeakerOn().then(setSpeakerOn);
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    const next = !speakerOn;
    setSpeakerOn(next);
    void setNativeSpeaker(next);
  }, [supported, speakerOn]);

  return { supported, speakerOn, toggle };
}
