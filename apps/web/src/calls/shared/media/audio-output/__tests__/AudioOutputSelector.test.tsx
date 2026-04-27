// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioOutputOption } from "@/calls/shared/media/audio-output/audio-output-types";

function createSelectorState(overrides?: Partial<{
  support: "unsupported" | "system-only" | "full";
  options: AudioOutputOption[];
  isLoading: boolean;
  isPromptingDeviceSelection: boolean;
  canPromptForDevices: boolean;
  isAndroidBrowserManagedOutput: boolean;
  error: string | null;
  selectedPreference: string;
  setSelectedPreference: ReturnType<typeof vi.fn>;
  requestDeviceSelection: ReturnType<typeof vi.fn>;
}>) {
  return {
    support: "system-only" as "unsupported" | "system-only" | "full",
    options: [{ value: "system", deviceId: null, label: "System default" }] as AudioOutputOption[],
    isLoading: false,
    isPromptingDeviceSelection: false,
    canPromptForDevices: false,
    isAndroidBrowserManagedOutput: false,
    error: null as string | null,
    selectedPreference: "system",
    setSelectedPreference: vi.fn(async () => undefined),
    requestDeviceSelection: vi.fn(async () => undefined),
    ...overrides,
  };
}

const selectorState = vi.hoisted(() => ({
  current: createSelectorState(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/calls/shared/media/audio-output/CallAudioOutputProvider", () => ({
  useCallAudioOutput: () => selectorState.current,
}));

import { AudioOutputSelector } from "@/calls/shared/media/audio-output/AudioOutputSelector";

describe("AudioOutputSelector", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    selectorState.current = createSelectorState();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("hides the compact selector when output routing is not user-selectable", () => {
    act(() => {
      root.render(<AudioOutputSelector compact />);
    });

    expect(container.innerHTML).toBe("");
  });

  it("renders the compact selector when explicit output selection is available", () => {
    selectorState.current = createSelectorState({
      support: "full",
      options: [
        { value: "system", deviceId: null, label: "System default" },
        { value: "device:bt-headset", deviceId: "bt-headset", label: "Bluetooth headset" },
      ],
    });

    act(() => {
      root.render(<AudioOutputSelector compact />);
    });

    expect(container.textContent).toContain("call.audioOutput.label");
    expect(container.textContent).toContain("System default");
  });
});
