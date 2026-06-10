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
  /** Explicitly set the target route (speaker or earpiece). Used by the audio
   *  route sheet so its selection is reflected in the enforcer's target and
   *  won't be reverted by the next periodic correction tick. */
  setTarget: (enabled: boolean) => void;
}

interface UseNativeSpeakerToggleOptions {
  readonly preferredSpeakerOn?: boolean;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

/**
 * Manages earpiece / loudspeaker routing for native Android calls.
 *
 * Problem: Android WebRTC initialises its own audio session after the
 * offer/answer exchange completes — which can be several seconds after
 * component mount on outgoing calls (waiting for callee to answer).
 * WebRTC calls AudioManager.setMode() and resets setSpeakerphoneOn() to true.
 * Retrying only for the first 1800ms is not enough when call setup takes 3-5s.
 *
 * Fix: track the *target* route separately from the hardware state. The apply
 * effect re-runs whenever the target changes (component mount or user tap) and
 * fires at [0, 500, 1200, 2500, 4500, 7500ms] — a window wide enough to cover
 * WebRTC resets that happen after a slow call connect. Each attempt reads actual
 * hardware state first and only writes when drifted.
 *
 * User override: tapping the speaker button changes the target, which re-arms
 * the same multi-attempt backoff — so the user's choice also wins against
 * a WebRTC reset that fires shortly after the tap.
 *
 * State sync: a 2-second periodic interval keeps the UI in sync with hardware
 * changes the app did not initiate (Bluetooth headset disconnect, OS override).
 */
export function useNativeSpeakerToggle(
  { preferredSpeakerOn = false }: UseNativeSpeakerToggleOptions = {},
): NativeSpeakerToggleResult {
  const supported = isNativeAudioRouteSupported();
  const [speakerOn, setSpeakerOn] = useState(false);
  // targetSpeakerOn: what we want — starts as preferredSpeakerOn, changed by user tap.
  const [targetSpeakerOn, setTargetSpeakerOn] = useState(preferredSpeakerOn);

  // Reset target when the call type changes (e.g. voice → video escalation).
  useEffect(() => {
    setTargetSpeakerOn(preferredSpeakerOn);
  }, [preferredSpeakerOn]);

  // Multi-attempt backoff: apply targetSpeakerOn at each delay.
  // Re-runs every time targetSpeakerOn changes, covering both the initial
  // call-setup race and subsequent user-initiated route changes.
  useEffect(() => {
    if (!supported) return;

    // Delays span the full call setup window. Outgoing calls connect up to
    // ~5s after mount; WebRTC audio init fires ~200-900ms after connect.
    const DELAYS = [0, 500, 1200, 2500, 4500, 7500] as const;
    let cancelled = false;

    const applyTarget = async (delay: number): Promise<void> => {
      if (delay > 0) await wait(delay);
      if (cancelled) return;
      const actual = await getNativeSpeakerOn();
      if (cancelled) return;
      if (actual !== targetSpeakerOn) {
        await setNativeSpeaker(targetSpeakerOn);
        if (!cancelled) setSpeakerOn(targetSpeakerOn);
        return;
      }
      setSpeakerOn(actual);
    };

    void applyTarget(0);
    const timers = (DELAYS.slice(1) as readonly number[]).map((delay) =>
      window.setTimeout(() => { void applyTarget(delay); }, delay)
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // Restore earpiece on unmount so the device is not left in speaker mode.
      void setNativeSpeaker(false);
    };
  }, [supported, targetSpeakerOn]);

  // Periodic enforcer: read hardware state every 2s and correct drift.
  // This catches WebRTC audio resets that happen after the initial backoff window
  // closes (e.g. outgoing call answered 20s+ after mount, WebRTC resets at 20.5s).
  // When the user picks a route via the audio sheet, setTarget() updates
  // targetSpeakerOn so the enforcer does not fight their choice.
  useEffect(() => {
    if (!supported) return;
    const id = window.setInterval(async () => {
      const actual = await getNativeSpeakerOn();
      if (actual !== targetSpeakerOn) {
        await setNativeSpeaker(targetSpeakerOn);
        setSpeakerOn(targetSpeakerOn);
      } else {
        setSpeakerOn((prev) => (prev !== actual ? actual : prev));
      }
    }, 2000);
    return () => clearInterval(id);
  }, [supported, targetSpeakerOn]);

  const toggle = useCallback(() => {
    if (!supported) return;
    const next = !speakerOn;
    setSpeakerOn(next);           // optimistic UI update
    setTargetSpeakerOn(next);     // re-arm backoff with new target
  }, [supported, speakerOn]);

  const setTarget = useCallback((enabled: boolean) => {
    setTargetSpeakerOn(enabled);
    setSpeakerOn(enabled);
  }, []);

  return { supported, speakerOn, toggle, setTarget };
}
