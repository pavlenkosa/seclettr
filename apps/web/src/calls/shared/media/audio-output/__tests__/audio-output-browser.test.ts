import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAndroidBrowserManagedAudioOutput,
  requestAudioOutputDevice,
  supportsAudioOutputDevicePrompt,
} from "@/calls/shared/media/audio-output/audio-output-browser";
import { SYSTEM_AUDIO_OUTPUT_PREFERENCE, encodeAudioOutputPreference } from "@/calls/shared/media/audio-output/audio-output-types";

describe("audio output browser prompt helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports no prompt support when the browser picker API is absent", () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {},
    });

    expect(supportsAudioOutputDevicePrompt()).toBe(false);
  });

  it("reports prompt support when selectAudioOutput is available", () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        selectAudioOutput: vi.fn(),
      },
    });

    expect(supportsAudioOutputDevicePrompt()).toBe(true);
  });

  it("treats Android browsers as system-managed for handset routing", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/135.0.0.0 Mobile Safari/537.36",
      mediaDevices: {},
    });

    expect(isAndroidBrowserManagedAudioOutput()).toBe(true);
  });

  it("does not flag desktop browsers as Android-managed", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
      mediaDevices: {},
    });

    expect(isAndroidBrowserManagedAudioOutput()).toBe(false);
  });

  it("passes the current sink preference into the browser picker", async () => {
    const device = {
      deviceId: "bt-headphones",
      kind: "audiooutput",
      label: "Bluetooth headset",
      groupId: "group-1",
      toJSON: () => ({}),
    } satisfies MediaDeviceInfo;
    const selectAudioOutput = vi.fn(async () => device);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        selectAudioOutput,
      },
    });

    await expect(requestAudioOutputDevice(SYSTEM_AUDIO_OUTPUT_PREFERENCE)).resolves.toEqual(device);
    await expect(requestAudioOutputDevice(encodeAudioOutputPreference("bt-headphones"))).resolves.toEqual(device);

    expect(selectAudioOutput).toHaveBeenNthCalledWith(1, { deviceId: undefined });
    expect(selectAudioOutput).toHaveBeenNthCalledWith(2, { deviceId: "bt-headphones" });
  });
});
