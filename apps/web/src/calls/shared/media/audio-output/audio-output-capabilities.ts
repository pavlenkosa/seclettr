import type { AudioOutputOption, AudioOutputSupport } from "./audio-output-types";

interface AudioOutputCapabilityParams {
  sinkSelectionSupported: boolean;
  options: AudioOutputOption[];
}

/**
 * Resolves how much control the current browser exposes for call output routing.
 * "full" means there is at least one non-default device to target explicitly.
 */
export function resolveAudioOutputSupport({
  sinkSelectionSupported,
  options,
}: AudioOutputCapabilityParams): AudioOutputSupport {
  if (!sinkSelectionSupported) {
    return "unsupported";
  }

  const explicitDeviceCount = options.filter((option) => option.deviceId).length;
  return explicitDeviceCount > 0 ? "full" : "system-only";
}
