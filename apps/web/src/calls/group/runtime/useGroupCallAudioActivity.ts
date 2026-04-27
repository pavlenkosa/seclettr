import { useCallAudioActivity } from "@/calls/shared/media/useCallAudioActivity";

/**
 * Hook for detecting voice activity in group calls.
 * Uses WebAudio API to analyze audio track amplitude and detect when a participant is speaking.
 */
export function useGroupCallAudioActivity(
  stream: MediaStream | null,
  enabled: boolean
): boolean {
  return useCallAudioActivity(stream, enabled);
}
