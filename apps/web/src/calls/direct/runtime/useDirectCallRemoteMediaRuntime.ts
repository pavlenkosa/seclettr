import { useDirectCallRemoteMediaHints } from "./useDirectCallRemoteMediaHints";
import { useDirectCallRemoteMediaState } from "./useDirectCallRemoteMediaState";
import { useDirectCallRemoteTrackIngress } from "./useDirectCallRemoteTrackIngress";
import { type UseDirectCallRemoteMediaRuntimeOptions } from "./direct-call-remote-media-runtime-shared";

export function useDirectCallRemoteMediaRuntime(
  options: UseDirectCallRemoteMediaRuntimeOptions
) {
  const state = useDirectCallRemoteMediaState(options);
  const trackIngress = useDirectCallRemoteTrackIngress({ ...options, ...state });
  const hints = useDirectCallRemoteMediaHints({
    ...options,
    ...state,
    clearRemoteMediaSlot: trackIngress.clearRemoteMediaSlot,
  });

  // pendingReplacementTrackRef is internal to trackIngress — exclude from public API.
  const { pendingReplacementTrackRef: _, ...publicState } = state;
  return { ...publicState, ...trackIngress, ...hints };
}
