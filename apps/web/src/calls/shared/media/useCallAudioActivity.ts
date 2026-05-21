/**
 * useCallAudioActivity — React hook for voice-activity detection on a MediaStream.
 *
 * Owns:
 *   - isActive — boolean React state that mirrors the AnalyserNode RMS result
 *   - Subscription lifecycle: calls audioActivityRegistry.subscribe when enabled
 *     and stream is non-null; unsubscribes on cleanup or when either changes
 *
 * Does not own the audio analysis loop or thresholds (see audio-activity-registry.ts).
 * Setting enabled=false immediately sets isActive to false and avoids unnecessary CPU.
 */
import { useEffect, useState } from "react";
import { audioActivityRegistry } from "@/calls/shared/media/audio-activity-registry";

export function useCallAudioActivity(
  stream: MediaStream | null,
  enabled: boolean
): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled || !stream) {
      setIsActive(false);
      return;
    }

    const unsubscribe = audioActivityRegistry.subscribe(stream, (nextIsActive) => {
      setIsActive((current) => (current === nextIsActive ? current : nextIsActive));
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, stream]);

  return isActive;
}
