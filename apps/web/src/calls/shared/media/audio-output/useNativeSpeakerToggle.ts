import { useCallback, useEffect, useState } from "react";
import {
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
    // Default every call to earpiece so the user is not surprised by
    // loudspeaker routing from a prior call or the WebRTC engine default.
    void setNativeSpeaker(false);
    // Android WebRTC resets audio routing when it initialises its own audio
    // session (typically 200-600ms after the call is accepted). Re-apply
    // earpiece after a short delay to win the race against WebRTC's reset.
    const retryTimer = window.setTimeout(() => { void setNativeSpeaker(false); }, 600);
    return () => {
      clearTimeout(retryTimer);
      // Restore earpiece on unmount so the device is not left in speaker mode.
      void setNativeSpeaker(false);
    };
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    const next = !speakerOn;
    setSpeakerOn(next);
    void setNativeSpeaker(next);
  }, [supported, speakerOn]);

  return { supported, speakerOn, toggle };
}
