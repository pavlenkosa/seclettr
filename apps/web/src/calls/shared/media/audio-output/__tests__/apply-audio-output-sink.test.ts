import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAudioOutputPreference,
  supportsAudioOutputSelection,
} from "@/calls/shared/media/audio-output/apply-audio-output-sink";
import {
  SYSTEM_AUDIO_OUTPUT_PREFERENCE,
  encodeAudioOutputPreference,
} from "@/calls/shared/media/audio-output/audio-output-types";

describe("apply audio output sink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a no-op when sink selection is not supported", async () => {
    const element = {} as HTMLAudioElement;
    await expect(applyAudioOutputPreference(element, SYSTEM_AUDIO_OUTPUT_PREFERENCE)).resolves.toBeUndefined();
  });

  it("switches to the system default route using an empty sink id", async () => {
    const setSinkId = vi.fn(async () => undefined);
    const element = {
      sinkId: "bluetooth-speaker",
      setSinkId,
    } as unknown as HTMLAudioElement;

    await applyAudioOutputPreference(element, SYSTEM_AUDIO_OUTPUT_PREFERENCE);

    expect(setSinkId).toHaveBeenCalledWith("");
  });

  it("switches to an explicit audio device when one is selected", async () => {
    const setSinkId = vi.fn(async () => undefined);
    const element = {
      sinkId: "",
      setSinkId,
    } as unknown as HTMLAudioElement;

    await applyAudioOutputPreference(element, encodeAudioOutputPreference("bt-headphones"));

    expect(setSinkId).toHaveBeenCalledWith("bt-headphones");
  });

  it("detects support from the media element prototype", () => {
    class FakeMediaElement {}

    Object.defineProperty(FakeMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: async () => undefined,
    });

    vi.stubGlobal("HTMLMediaElement", FakeMediaElement);

    expect(supportsAudioOutputSelection()).toBe(true);
  });
});
