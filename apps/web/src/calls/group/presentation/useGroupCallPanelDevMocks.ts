/**
 * useGroupCallPanelDevMocks — dev-only mock participant injection utilities.
 *
 * Owns:
 *   - mockRemoteMedia state that merges injected fake participants with real remote media
 *   - window.__scInjectMockParticipants(count) — exposed in dev builds for manual testing
 *   - window.__scClearMockParticipants() — clears mock participants
 *   - Auto-cleanup of the window helpers on unmount
 *
 * Only active in import.meta.env.DEV; in production all effects are no-ops.
 * Does not affect any production code paths.
 */
import { useEffect, useMemo, useState } from "react";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime";

export function useGroupCallPanelDevMocks(remoteMedia: GroupCallRemoteMedia[]) {
  const [mockRemoteMedia, setMockRemoteMedia] = useState<GroupCallRemoteMedia[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    window.__scInjectMockParticipants = (count: number) => {
      const participants: GroupCallRemoteMedia[] = [];
      for (let i = 0; i < count; i++) {
        const hasVideo = i % 3 !== 0;
        participants.push({
          mediaId: `mock-${i}:${hasVideo ? "cam" : "audio"}`,
          userId: `mock-user-${i}`,
          deviceId: hasVideo ? `mock-device-${i}` : null,
          hasAudio: true,
          hasVideo,
          audioStream: null,
          videoStream: null,
          videoSource: hasVideo ? "camera" : null,
        });
      }
      setMockRemoteMedia(participants);
    };

    window.__scClearMockParticipants = () => setMockRemoteMedia([]);

    return () => {
      delete window.__scInjectMockParticipants;
      delete window.__scClearMockParticipants;
    };
  }, []);

  return useMemo(
    () => (mockRemoteMedia.length > 0 ? [...remoteMedia, ...mockRemoteMedia] : remoteMedia),
    [mockRemoteMedia, remoteMedia],
  );
}
