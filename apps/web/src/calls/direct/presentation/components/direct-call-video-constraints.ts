import type { VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";

export const VIDEO_RESOLUTION_DIMENSIONS: Record<VideoResolution, [number, number]> = {
  "360p": [640, 360],
  "480p": [854, 480],
  "720p": [1280, 720],
  "1080p": [1920, 1080],
};

export const VIDEO_FRAME_RATE = { ideal: 30, max: 30 } as const;
