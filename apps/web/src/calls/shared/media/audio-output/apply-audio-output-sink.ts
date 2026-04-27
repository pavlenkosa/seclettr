import type { AudioOutputPreference } from "@/ui-settings";
import { decodeAudioOutputPreference } from "./audio-output-types";

type AudioSinkCapableElement = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function supportsAudioOutputSelection(): boolean {
  if (typeof HTMLMediaElement === "undefined") {
    return false;
  }

  return "setSinkId" in HTMLMediaElement.prototype;
}

/**
 * Applies the preferred output route to an audio element when the browser supports sink selection.
 * Unsupported browsers are treated as a no-op so call playback still works on the default route.
 */
export async function applyAudioOutputPreference(
  element: HTMLAudioElement,
  preference: AudioOutputPreference
): Promise<void> {
  const sinkElement = element as AudioSinkCapableElement;
  if (typeof sinkElement.setSinkId !== "function") {
    return;
  }

  const nextSinkId = decodeAudioOutputPreference(preference);
  if (typeof sinkElement.sinkId === "string" && sinkElement.sinkId === nextSinkId) {
    return;
  }

  await sinkElement.setSinkId(nextSinkId);
}
