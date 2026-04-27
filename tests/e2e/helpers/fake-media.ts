import type { BrowserContext } from "@playwright/test";

interface SyntheticMediaInitOptions {
  label: string;
}

export async function installSyntheticMedia(
  context: BrowserContext,
  options: SyntheticMediaInitOptions
): Promise<void> {
  await context.addInitScript(({ label }: SyntheticMediaInitOptions) => {
    const globalStateKey = "__seclettrSyntheticMediaState";
    const win = window as Window & {
      [globalStateKey]?: {
        intervals: number[];
        audioContexts: AudioContext[];
        oscillators: OscillatorNode[];
        streams: MediaStream[];
      };
      webkitAudioContext?: typeof AudioContext;
    };
    const mediaState = win[globalStateKey] ?? {
      intervals: [],
      audioContexts: [],
      oscillators: [],
      streams: [],
    };
    win[globalStateKey] = mediaState;

    const AudioContextCtor = window.AudioContext ?? win.webkitAudioContext ?? null;

    const createAnimatedCanvasTrack = (source: "camera" | "screen"): MediaStreamTrack => {
      const canvas = document.createElement("canvas");
      canvas.width = source === "screen" ? 1280 : 640;
      canvas.height = source === "screen" ? 720 : 480;
      const context2d = canvas.getContext("2d");
      if (!context2d) {
        throw new Error("Synthetic media canvas context unavailable");
      }

      let tick = 0;
      const interval = window.setInterval(() => {
        tick += 1;
        context2d.fillStyle = source === "screen" ? "#102a43" : "#123b6b";
        context2d.fillRect(0, 0, canvas.width, canvas.height);
        context2d.fillStyle = source === "screen" ? "#58a6ff" : "#2dd4bf";
        context2d.fillRect(
          40 + ((tick * 11) % Math.max(80, canvas.width - 220)),
          60 + ((tick * 7) % Math.max(80, canvas.height - 180)),
          source === "screen" ? 220 : 160,
          source === "screen" ? 120 : 160
        );
        context2d.fillStyle = "#ffffff";
        context2d.font = source === "screen" ? "bold 40px sans-serif" : "bold 32px sans-serif";
        context2d.fillText(`${label} ${source}`, 32, 48);
        context2d.font = "24px monospace";
        context2d.fillText(`frame:${tick}`, 32, canvas.height - 40);
      }, 120);

      mediaState.intervals.push(interval);
      const stream = canvas.captureStream(source === "screen" ? 8 : 12);
      mediaState.streams.push(stream);
      const track = stream.getVideoTracks()[0];
      const originalStop = track.stop.bind(track);
      track.stop = () => {
        window.clearInterval(interval);
        originalStop();
      };
      return track;
    };

    const createSyntheticAudioTrack = (): MediaStreamTrack | null => {
      if (!AudioContextCtor) {
        return null;
      }
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.type = "sine";
      oscillator.frequency.value = 440;
      gain.gain.value = 0.01;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      void audioContext.resume().catch(() => undefined);
      mediaState.audioContexts.push(audioContext);
      mediaState.oscillators.push(oscillator);
      mediaState.streams.push(destination.stream);
      const track = destination.stream.getAudioTracks()[0] ?? null;
      if (!track) {
        void audioContext.close().catch(() => undefined);
        return null;
      }
      const originalStop = track.stop.bind(track);
      track.stop = () => {
        try {
          oscillator.stop();
        } catch {}
        void audioContext.close().catch(() => undefined);
        originalStop();
      };
      return track;
    };

    const wantsTrack = (constraint: MediaTrackConstraints | boolean | undefined): boolean => {
      return constraint === true || (typeof constraint === "object" && constraint !== null);
    };

    const createSyntheticStream = (kind: "user" | "display", constraints?: MediaStreamConstraints): MediaStream => {
      const tracks: MediaStreamTrack[] = [];
      if (kind === "user" && wantsTrack(constraints?.audio)) {
        const audioTrack = createSyntheticAudioTrack();
        if (audioTrack) {
          tracks.push(audioTrack);
        }
      }
      const wantsVideo = kind === "display" || wantsTrack(constraints?.video);
      if (wantsVideo) {
        tracks.push(createAnimatedCanvasTrack(kind === "display" ? "screen" : "camera"));
      }
      const stream = new MediaStream(tracks);
      mediaState.streams.push(stream);
      return stream;
    };

    const mediaDevices = navigator.mediaDevices;
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints?: MediaStreamConstraints) => createSyntheticStream("user", constraints),
    });
    Object.defineProperty(mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async (constraints?: MediaStreamConstraints) => createSyntheticStream("display", constraints),
    });
  }, options);
}
