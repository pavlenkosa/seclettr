import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startCallAudioSessionRouting,
  supportsCallAudioSessionRouting,
} from "@/calls/shared/media/audio-output/audio-session-routing";

describe("call audio session routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports no support when navigator.audioSession is absent", () => {
    vi.stubGlobal("navigator", {});

    expect(supportsCallAudioSessionRouting()).toBe(false);
  });

  it("switches the session to play-and-record and restores the previous type", () => {
    const audioSession = {
      type: "auto",
    };

    vi.stubGlobal("navigator", {
      audioSession,
    });

    const stopRouting = startCallAudioSessionRouting();

    expect(audioSession.type).toBe("play-and-record");

    stopRouting?.();

    expect(audioSession.type).toBe("auto");
  });

  it("returns null when the browser rejects the audio session change", () => {
    const audioSession = {
      get type() {
        return "auto";
      },
      set type(_nextType: string) {
        throw new DOMException("Rejected", "NotAllowedError");
      },
    };

    vi.stubGlobal("navigator", {
      audioSession,
    });

    expect(startCallAudioSessionRouting()).toBeNull();
  });
});
