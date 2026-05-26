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

interface UseNativeSpeakerToggleOptions {
  readonly preferredSpeakerOn?: boolean;
}

/**
 * Manages earpiece / loudspeaker routing for native Android calls.
 *
 * Problem: Android WebRTC initialises its own audio session 200–900ms after the
 * offer/answer exchange, and in doing so may call AudioManager.setMode() and
 * reset setSpeakerphoneOn() back to true (speaker). A single 600ms retry is not
 * reliable — WebRTC may reset audio *after* the retry fires.
 *
 * Fix: apply earpiece at mount (0ms) then at 400ms, 900ms, and 1800ms.
 * Each attempt reads the actual hardware state first so we only write when the
 * state has drifted, avoiding unnecessary mode resets.
 *
 * State sync: a 2-second periodic check corrects UI state if WebRTC or the OS
 * flips the audio route without going through our toggle.
 */
export function useNativeSpeakerToggle(
  { preferredSpeakerOn = false }: UseNativeSpeakerToggleOptions = {},
): NativeSpeakerToggleResult {
  const supported = isNativeAudioRouteSupported();
  const [speakerOn, setSpeakerOn] = useState(false);

  // Multi-attempt backoff to win the race against WebRTC's audio session init
  // while still allowing the caller to declare the preferred route for the
  // current call mode (earpiece for voice, loudspeaker for video).
  useEffect(() => {
    if (!supported) return;

    let cancelled = false;
    // Delays at which to check + re-apply the preferred route, in ms after mount.
    const DELAYS = [0, 400, 900, 1800] as const;

    const applyPreferredRoute = async (delay: number): Promise<void> => {
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      if (cancelled) return;
      const actual = await getNativeSpeakerOn();
      if (cancelled) return;
      if (actual !== preferredSpeakerOn) {
        await setNativeSpeaker(preferredSpeakerOn);
        if (!cancelled) setSpeakerOn(preferredSpeakerOn);
        return;
      }
      setSpeakerOn(actual);
    };

    const timers: ReturnType<typeof window.setTimeout>[] = [];
    void applyPreferredRoute(0);
    for (const delay of DELAYS.slice(1)) {
      timers.push(window.setTimeout(() => { void applyPreferredRoute(delay); }, delay));
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // Restore earpiece on unmount so the device is not left in speaker mode.
      void setNativeSpeaker(false);
    };
  }, [preferredSpeakerOn, supported]);

  // Periodic state sync: correct React state if the hardware audio route has
  // drifted from what the UI shows (e.g. Bluetooth disconnect, OS override).
  useEffect(() => {
    if (!supported) return;
    const id = window.setInterval(() => {
      void getNativeSpeakerOn().then((actual) => {
        setSpeakerOn((prev) => (prev !== actual ? actual : prev));
      });
    }, 2000);
    return () => clearInterval(id);
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    const next = !speakerOn;
    setSpeakerOn(next);
    void setNativeSpeaker(next);
  }, [supported, speakerOn]);

  return { supported, speakerOn, toggle };
}
