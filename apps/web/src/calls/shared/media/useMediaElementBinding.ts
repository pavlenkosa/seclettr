import { useEffect, useRef, useState } from "react";
import { useOptionalCallAudioOutput } from "./audio-output/CallAudioOutputProvider";

interface MediaBindingOptions {
  kind: "audio" | "video";
  stream: MediaStream | null;
  muted?: boolean;
}

interface MediaBindingResult<TElement extends HTMLMediaElement> {
  elementRef: React.MutableRefObject<TElement | null>;
  isReady: boolean;
}

function isVideoElementReady(element: HTMLVideoElement): boolean {
  return (
    element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    element.videoWidth > 0 &&
    element.videoHeight > 0
  );
}

export function useMediaElementBinding<TElement extends HTMLMediaElement>(
  options: MediaBindingOptions
): MediaBindingResult<TElement> {
  const elementRef = useRef<TElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const audioOutput = useOptionalCallAudioOutput();

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let disposed = false;
    let readinessPollTimer: number | null = null;
    const attachedStream = options.stream;
    const unregisterAudioElement = options.kind === "audio" && element instanceof HTMLAudioElement
      ? audioOutput?.registerAudioElement(element)
      : undefined;

    const syncReadyState = () => {
      if (disposed) return;
      if (!attachedStream) {
        setIsReady(false);
        return;
      }
      if (options.kind === "audio") {
        setIsReady(true);
        return;
      }

      const videoElement = element as unknown as HTMLVideoElement;
      setIsReady(isVideoElementReady(videoElement));
    };

    const tryPlay = () => {
      if (disposed || !attachedStream) return;
      const playPromise = element.play();
      playPromise?.catch(() => null);
    };

    const clearElement = () => {
      if ((element.srcObject ?? null) === attachedStream) {
        element.srcObject = null;
      }
      element.removeAttribute("src");
      element.load();
    };

    const handleLoadedMetadata = () => {
      syncReadyState();
      tryPlay();
    };
    const handleLoadedData = () => {
      syncReadyState();
      tryPlay();
    };
    const handleCanPlay = () => {
      syncReadyState();
      tryPlay();
    };
    const handlePlaying = () => {
      syncReadyState();
    };
    const handleEmptied = () => {
      syncReadyState();
    };

    element.srcObject = attachedStream;
    if ("playsInline" in element) {
      element.setAttribute("playsinline", "");
    }
    if (options.muted) {
      element.muted = true;
    }

    element.addEventListener("loadedmetadata", handleLoadedMetadata);
    element.addEventListener("loadeddata", handleLoadedData);
    element.addEventListener("canplay", handleCanPlay);
    element.addEventListener("playing", handlePlaying);
    element.addEventListener("emptied", handleEmptied);

    const handleTrackUnmute = () => {
      syncReadyState();
      tryPlay();
    };
    const handleTrackMute = () => {
      syncReadyState();
    };
    const handleTrackEnded = () => {
      syncReadyState();
    };
    const detachTrackListeners: Array<() => void> = [];
    for (const track of attachedStream?.getTracks() ?? []) {
      track.addEventListener("unmute", handleTrackUnmute);
      track.addEventListener("mute", handleTrackMute);
      track.addEventListener("ended", handleTrackEnded);
      detachTrackListeners.push(() => {
        track.removeEventListener("unmute", handleTrackUnmute);
        track.removeEventListener("mute", handleTrackMute);
        track.removeEventListener("ended", handleTrackEnded);
      });
    }

    syncReadyState();
    tryPlay();

    if (options.kind === "video" && attachedStream) {
      readinessPollTimer = globalThis.window.setInterval(() => {
        syncReadyState();
        if (isVideoElementReady(element as unknown as HTMLVideoElement)) {
          if (readinessPollTimer !== null) {
            clearInterval(readinessPollTimer);
            readinessPollTimer = null;
          }
        } else {
          tryPlay();
        }
      }, 500);
    }

    return () => {
      disposed = true;
      if (readinessPollTimer !== null) {
        clearInterval(readinessPollTimer);
      }
      element.removeEventListener("loadedmetadata", handleLoadedMetadata);
      element.removeEventListener("loadeddata", handleLoadedData);
      element.removeEventListener("canplay", handleCanPlay);
      element.removeEventListener("playing", handlePlaying);
      element.removeEventListener("emptied", handleEmptied);
      for (const detach of detachTrackListeners) {
        detach();
      }
      unregisterAudioElement?.();
      setIsReady(false);
      clearElement();
    };
  }, [audioOutput, options.kind, options.muted, options.stream]);

  return { elementRef, isReady };
}
