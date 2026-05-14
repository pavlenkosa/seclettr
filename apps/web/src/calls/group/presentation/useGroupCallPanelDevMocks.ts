import { useEffect, useMemo, useState } from "react";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";

export function useGroupCallPanelDevMocks(remoteMedia: GroupCallRemoteMedia[]) {
  const [mockRemoteMedia, setMockRemoteMedia] = useState<GroupCallRemoteMedia[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    type MockWindow = Window & {
      __scInjectMockParticipants?: (count: number) => void;
      __scClearMockParticipants?: () => void;
    };
    const w = globalThis as unknown as MockWindow;

    w.__scInjectMockParticipants = (count: number) => {
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

    w.__scClearMockParticipants = () => setMockRemoteMedia([]);

    return () => {
      delete w.__scInjectMockParticipants;
      delete w.__scClearMockParticipants;
    };
  }, []);

  return useMemo(
    () => (mockRemoteMedia.length > 0 ? [...remoteMedia, ...mockRemoteMedia] : remoteMedia),
    [mockRemoteMedia, remoteMedia],
  );
}
