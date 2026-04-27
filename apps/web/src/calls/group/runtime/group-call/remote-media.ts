import type { SfuProducerSource } from "@seclettr/protocol";

export interface RemoteVideoSlot {
  producerId: string;
  stream: MediaStream;
  source: SfuProducerSource | null;
  deviceId: string | null;
}

export interface RemoteParticipantMediaInternal {
  userId: string;
  audioStreamsByProducerId: Map<string, MediaStream>;
  videoSlotsByProducerId: Map<string, RemoteVideoSlot>;
}

export interface GroupCallRemoteMedia {
  mediaId: string;
  userId: string;
  deviceId: string | null;
  hasAudio: boolean;
  hasVideo: boolean;
  audioStream: MediaStream | null;
  videoStream: MediaStream | null;
  videoSource: SfuProducerSource | null;
}

function compareVideoSourcePriority(source: SfuProducerSource | null): number {
  if (source === "camera") return 0;
  if (source === "screen") return 1;
  return 2;
}

export function buildRemoteMediaSnapshot(
  remoteMediaByUserId: Map<string, RemoteParticipantMediaInternal>
): GroupCallRemoteMedia[] {
  const participants: GroupCallRemoteMedia[] = [];

  for (const entry of [...remoteMediaByUserId.values()].sort((left, right) => left.userId.localeCompare(right.userId))) {
    const primaryAudioStream = [...entry.audioStreamsByProducerId.entries()]
      .sort(([leftProducerId], [rightProducerId]) => leftProducerId.localeCompare(rightProducerId))[0]?.[1] ?? null;
    const videoSlots = [...entry.videoSlotsByProducerId.values()].sort((left, right) => (
      compareVideoSourcePriority(left.source) - compareVideoSourcePriority(right.source) ||
      left.producerId.localeCompare(right.producerId)
    ));

    if (videoSlots.length === 0) {
      if (!primaryAudioStream) {
        continue;
      }

      participants.push({
        mediaId: `${entry.userId}:audio`,
        userId: entry.userId,
        deviceId: null,
        hasAudio: true,
        hasVideo: false,
        audioStream: primaryAudioStream,
        videoStream: null,
        videoSource: null,
      });
      continue;
    }

    videoSlots.forEach((videoSlot, index) => {
      const attachedAudioStream = index === 0 ? primaryAudioStream : null;
      participants.push({
        mediaId: `${entry.userId}:${videoSlot.producerId}`,
        userId: entry.userId,
        deviceId: videoSlot.deviceId,
        hasAudio: attachedAudioStream !== null,
        hasVideo: true,
        audioStream: attachedAudioStream,
        videoStream: videoSlot.stream,
        videoSource: videoSlot.source,
      });
    });
  }

  return participants;
}
