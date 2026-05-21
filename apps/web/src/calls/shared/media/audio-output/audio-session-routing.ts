/**
 * audio-session-routing — Audio Session API integration for call audio routing hints.
 *
 * Owns:
 *   - supportsCallAudioSessionRouting — detects navigator.audioSession availability
 *   - setCallAudioSessionType — sets navigator.audioSession.type to "play-and-record"
 *     when a call becomes active (hints the browser to use the earpiece/speaker route)
 *   - clearCallAudioSessionType — resets the session type to "auto" on call teardown
 *
 * The Audio Session API is a best-effort hint; most browsers currently ignore it.
 * Does not own device enumeration or setSinkId routing (see apply-audio-output-sink.ts).
 */
type AudioSessionLike = {
  type: string;
};

type NavigatorWithAudioSession = Navigator & {
  audioSession?: AudioSessionLike | null;
};

const CALL_AUDIO_SESSION_TYPE = "play-and-record";
const DEFAULT_AUDIO_SESSION_TYPE = "auto";

function getNavigatorAudioSession(): AudioSessionLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const audioSession = (navigator as NavigatorWithAudioSession).audioSession;
  return audioSession && typeof audioSession.type === "string"
    ? audioSession
    : null;
}

/**
 * Returns whether the browser exposes the Audio Session API surface needed for
 * best-effort call routing hints such as `play-and-record`.
 */
export function supportsCallAudioSessionRouting(): boolean {
  return getNavigatorAudioSession() !== null;
}

/**
 * Applies a best-effort call audio session hint for the lifetime of an active
 * call. Browsers may use `play-and-record` to favor handset-style routing, but
 * this is advisory and does not guarantee a manual speaker/earpiece toggle.
 */
export function startCallAudioSessionRouting(): (() => void) | null {
  const audioSession = getNavigatorAudioSession();
  if (!audioSession) {
    return null;
  }

  const previousType = audioSession.type || DEFAULT_AUDIO_SESSION_TYPE;

  try {
    audioSession.type = CALL_AUDIO_SESSION_TYPE;
  } catch {
    return null;
  }

  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;

    try {
      audioSession.type = previousType;
    } catch {
      // Ignore restore failures. The browser remains authoritative here.
    }
  };
}
