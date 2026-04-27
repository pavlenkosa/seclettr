import { describe, expect, it } from "vitest";
import { resolveAudioOutputSupport } from "@/calls/shared/media/audio-output/audio-output-capabilities";
import {
  SYSTEM_AUDIO_OUTPUT_PREFERENCE,
  encodeAudioOutputPreference,
} from "@/calls/shared/media/audio-output/audio-output-types";

describe("audio output capabilities", () => {
  it("reports unsupported when sink selection APIs are absent", () => {
    expect(resolveAudioOutputSupport({
      sinkSelectionSupported: false,
      options: [],
    })).toBe("unsupported");
  });

  it("reports system-only when only the default route is available", () => {
    expect(resolveAudioOutputSupport({
      sinkSelectionSupported: true,
      options: [{
        value: SYSTEM_AUDIO_OUTPUT_PREFERENCE,
        deviceId: null,
        label: "System default",
      }],
    })).toBe("system-only");
  });

  it("reports full support when explicit output devices are available", () => {
    expect(resolveAudioOutputSupport({
      sinkSelectionSupported: true,
      options: [
        {
          value: SYSTEM_AUDIO_OUTPUT_PREFERENCE,
          deviceId: null,
          label: "System default",
        },
        {
          value: encodeAudioOutputPreference("bluetooth-headset"),
          deviceId: "bluetooth-headset",
          label: "Bluetooth headset",
        },
      ],
    })).toBe("full");
  });
});
