import type { MutableRefObject } from "react";

/**
 * Attaches mute/unmute/ended listeners to a MediaStreamTrack and returns a
 * cleanup function that removes them. Eliminates the repeated
 * addEventListener/removeEventListener boilerplate across track-lifecycle bindings.
 */
export function bindTrackLifecycle(
  track: MediaStreamTrack,
  handlers: {
    onMute: () => void;
    onUnmute: () => void;
    onEnded: () => void;
  }
): () => void {
  track.addEventListener("mute", handlers.onMute);
  track.addEventListener("unmute", handlers.onUnmute);
  track.addEventListener("ended", handlers.onEnded);
  return () => {
    track.removeEventListener("mute", handlers.onMute);
    track.removeEventListener("unmute", handlers.onUnmute);
    track.removeEventListener("ended", handlers.onEnded);
  };
}

/**
 * Tears down an RTCPeerConnection: removes all event listeners, closes the
 * connection, and nulls the ref. Safe to call if the ref is already null.
 *
 * Extracted as a standalone function (not a hook) because it has no React
 * dependencies — the peerConnectionRef is a stable object and the operation
 * is purely imperative. Used from both useDirectCallSessionReset and
 * useDirectCallPeerConnectionRuntime.
 */
export function closePeerConnection(
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>
): void {
  const pc = peerConnectionRef.current;
  if (!pc) return;
  pc.onicecandidate = null;
  pc.ontrack = null;
  pc.onconnectionstatechange = null;
  pc.oniceconnectionstatechange = null;
  pc.onsignalingstatechange = null;
  pc.onicegatheringstatechange = null;
  pc.onnegotiationneeded = null;
  pc.close();
  peerConnectionRef.current = null;
}
