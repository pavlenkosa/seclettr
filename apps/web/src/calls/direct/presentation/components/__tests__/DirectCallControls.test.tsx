// @vitest-environment jsdom

import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/calls/shared/media/audio-output/CallAudioOutputProvider", () => ({
  useCallAudioOutput: () => ({ support: "unsupported", canPromptForDevices: false }),
  useOptionalCallAudioOutput: () => null,
  useRegisterCallAudioOutputTarget: () => {},
}));

vi.mock("@/calls/shared/media/audio-output/useNativeSpeakerToggle", () => ({
  useNativeSpeakerToggle: () => ({ supported: false, speakerOn: false, toggle: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-is-mobile-viewport", () => ({
  useIsMobileViewport: () => false,
}));

vi.mock("@/lib/native-audio-route", () => ({
  getNativeAudioRoutes: async () => null,
  setNativeAudioRoute: async () => {},
}));

import { DirectCallControls } from "@/calls/direct/presentation/components/DirectCallControls";

function makeProps(overrides?: Partial<React.ComponentProps<typeof DirectCallControls>>) {
  return {
    callType: "video" as const,
    muted: false,
    videoOff: false,
    screenSharing: false,
    onToggleMute: vi.fn(),
    onToggleVideo: vi.fn(),
    onToggleScreenShare: vi.fn(),
    onHangup: vi.fn(),
    hangupButtonRef: { current: null } as RefObject<HTMLButtonElement>,
    muteAriaLabel: "Toggle mute",
    muteLabel: "Mute",
    cameraAriaLabel: "Toggle camera",
    cameraLabel: "Camera",
    screenShareAriaLabel: "Toggle screen share",
    screenShareLabel: "Screen share",
    endAriaLabel: "End call",
    endLabel: "End",
    ...overrides,
  };
}

describe("DirectCallControls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("renders the end call button", () => {
    act(() => {
      root.render(<DirectCallControls {...makeProps()} />);
    });

    const btn = container.querySelector('button[aria-label="End call"]');
    expect(btn).not.toBeNull();
  });

  it("calls onHangup when the end call button is clicked", () => {
    const onHangup = vi.fn();
    act(() => {
      root.render(<DirectCallControls {...makeProps({ onHangup })} />);
    });

    const btn = container.querySelector('button[aria-label="End call"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onHangup).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleMute when the mute button is clicked", () => {
    const onToggleMute = vi.fn();
    act(() => {
      root.render(<DirectCallControls {...makeProps({ onToggleMute })} />);
    });

    const btn = container.querySelector('button[aria-label="Toggle mute"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it("reflects muted state via aria-pressed on the mute button", () => {
    act(() => {
      root.render(<DirectCallControls {...makeProps({ muted: true })} />);
    });

    const btn = container.querySelector('button[aria-label="Toggle mute"]');
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects videoOff state via aria-pressed on the camera button", () => {
    act(() => {
      root.render(<DirectCallControls {...makeProps({ videoOff: true })} />);
    });

    const btn = container.querySelector('button[aria-label="Toggle camera"]');
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
  });
});
