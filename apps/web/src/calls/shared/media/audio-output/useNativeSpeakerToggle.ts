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
export function useNativeSpeakerToggle(): NativeSpeakerToggleResult {
  const supported = isNativeAudioRouteSupported();
  const [speakerOn, setSpeakerOn] = useState(false);

  // Multi-attempt backoff to win the race against WebRTC's audio session init.
  useEffect(() => {
    if (!supported) return;

    let cancelled = false;
    // Delays at which to check + re-apply earpiece, in ms after mount.
    const DELAYS = [0, 400, 900, 1800] as const;

    const applyEarpiece = async (delay: number): Promise<void> => {
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      if (cancelled) return;
      // Read actual hardware state before writing.
      // If the hardware is already on earpiece, skip the write to avoid
      // an unnecessary AudioManager.setMode() round-trip.
      const actual = await getNativeSpeakerOn();
      if (cancelled) return;
      if (actual) {
        // WebRTC or OS turned speaker on; re-apply earpiece and sync UI.
        await setNativeSpeaker(false);
        if (!cancelled) setSpeakerOn(false);
      }
    };

    const timers: ReturnType<typeof window.setTimeout>[] = [];
    void applyEarpiece(0);
    for (const delay of DELAYS.slice(1)) {
      timers.push(window.setTimeout(() => { void applyEarpiece(delay); }, delay));
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // Restore earpiece on unmount so the device is not left in speaker mode.
      void setNativeSpeaker(false);
    };
  }, [supported]);

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
