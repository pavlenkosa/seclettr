/**
 * audio-output-types — type definitions and codec helpers for audio output preferences.
 *
 * Owns:
 *   - SYSTEM_AUDIO_OUTPUT_PREFERENCE — sentinel value for the default system route
 *   - AudioOutputSupport — "unsupported" | "system-only" | "full" capability enum
 *   - AudioOutputOption — UI option record (value, deviceId, label)
 *   - encodeAudioOutputPreference — converts a raw deviceId to a persisted preference string
 *   - decodeAudioOutputPreference — converts a persisted preference back to a setSinkId argument
 *
 * Does not own device enumeration or element sink assignment.
 */
import type { AudioOutputPreference } from "@/ui-settings";

export const SYSTEM_AUDIO_OUTPUT_PREFERENCE: AudioOutputPreference = "system";

export type AudioOutputSupport = "unsupported" | "system-only" | "full";

export interface AudioOutputOption {
  value: AudioOutputPreference;
  deviceId: string | null;
  label: string;
}

/**
 * Encodes a raw audio output device id into a persisted preference value.
 * The explicit prefix prevents collisions with the reserved "system" option.
 */
export function encodeAudioOutputPreference(deviceId: string | null | undefined): AudioOutputPreference {
  if (!deviceId) {
    return SYSTEM_AUDIO_OUTPUT_PREFERENCE;
  }
  return `device:${deviceId}`;
}

/**
 * Decodes a persisted preference value back into a raw sink id used by setSinkId().
 * Returning an empty string keeps playback on the browser's default system route.
 */
export function decodeAudioOutputPreference(preference: AudioOutputPreference): string {
  if (preference === SYSTEM_AUDIO_OUTPUT_PREFERENCE) {
    return "";
  }
  return preference.slice("device:".length);
}
