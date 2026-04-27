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
