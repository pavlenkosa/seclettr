/**
 * audio-output-browser — browser-specific audio output routing utilities.
 *
 * Owns:
 *   - isAndroidBrowserManagedAudioOutput — detects Android where the OS owns
 *     handset/speaker routing and web setSinkId cannot override it
 *   - resolveAudioOutputDevices — enumerates available audiooutput devices and maps
 *     them to AudioOutputOption values usable in the settings UI
 *   - promptAudioOutputDevice — wraps selectAudioOutput (Chrome 116+) for explicit
 *     user-driven audio output device selection
 *
 * Does not own audio element sink assignment (see apply-audio-output-sink.ts) or
 * the audio output context (see CallAudioOutputProvider).
 */
import { decodeAudioOutputPreference } from "./audio-output-types";
import type { AudioOutputPreference } from "@/ui-settings";

type AudioOutputPromptCapableMediaDevices = MediaDevices & {
  selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
};

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
  };
};

/**
 * Chrome on Android does not expose reliable handset-vs-speaker routing control
 * to web apps. The browser/OS keeps ownership of that route selection.
 */
export function isAndroidBrowserManagedAudioOutput(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const browserNavigator = navigator as NavigatorWithUAData;
  const uaDataPlatform = browserNavigator.userAgentData?.platform;
  if (typeof uaDataPlatform === "string" && /android/i.test(uaDataPlatform)) {
    return true;
  }

  return /android/i.test(browserNavigator.userAgent ?? "");
}

/**
 * Returns whether the current browser can show an explicit audio-output picker.
 * This requires the browser-specific `selectAudioOutput()` prompt surface in
 * addition to `setSinkId()` support used for actual routing.
 */
export function supportsAudioOutputDevicePrompt(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const mediaDevices = navigator.mediaDevices as AudioOutputPromptCapableMediaDevices | undefined;
  return Boolean(mediaDevices && typeof mediaDevices.selectAudioOutput === "function");
}

/**
 * Opens the browser's native audio-output chooser when supported and returns
 * the selected sink device descriptor. Browsers that do not implement the API
 * resolve with `null` so the caller can keep the system-managed route.
 */
export async function requestAudioOutputDevice(
  preference: AudioOutputPreference
): Promise<MediaDeviceInfo | null> {
  if (typeof navigator === "undefined") {
    return null;
  }

  const mediaDevices = navigator.mediaDevices as AudioOutputPromptCapableMediaDevices | undefined;
  if (!mediaDevices || typeof mediaDevices.selectAudioOutput !== "function") {
    return null;
  }

  const preferredDeviceId = decodeAudioOutputPreference(preference);
  return mediaDevices.selectAudioOutput({
    deviceId: preferredDeviceId || undefined,
  });
}
