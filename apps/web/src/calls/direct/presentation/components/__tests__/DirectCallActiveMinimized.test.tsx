// @vitest-environment jsdom

import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/calls/shared/media/audio-output/CallAudioOutputProvider", () => ({
  useRegisterCallAudioOutputTarget: () => {},
  useCallAudioOutput: () => ({ support: "unsupported", canPromptForDevices: false }),
  useOptionalCallAudioOutput: () => null,
}));

import { DirectCallActiveMinimized } from "@/calls/direct/presentation/components/DirectCallActiveMinimized";

const noop = () => {};

function makeProps(overrides?: Partial<React.ComponentProps<typeof DirectCallActiveMinimized>>) {
  return {
    minimizedDockRef: { current: null } as RefObject<HTMLDialogElement>,
    remoteAudioRef: { current: null } as RefObject<HTMLAudioElement>,
    isDraggingMinimizedDock: false,
    minimizedDialogAriaLabel: "Active call",
    dragAriaLabel: "Drag",
    onStartDrag: noop,
    onMoveDrag: noop,
    onStopDrag: noop,
    activeMinimizedSummaryRef: { current: null } as RefObject<HTMLButtonElement>,
    peerInitials: "SP",
    peerDisplayName: "Seclettr Peer",
    callStateText: "Connected",
    duration: 0,
    durationStartedAtMs: null,
    openDetailsAriaLabel: "Open details",
    muted: false,
    muteAriaLabel: "Toggle mute",
    expandAriaLabel: "Expand",
    endAriaLabel: "End call",
    onOpenDetails: vi.fn(),
    onToggleMute: vi.fn(),
    onHangup: vi.fn(),
    ...overrides,
  };
}

describe("DirectCallActiveMinimized", () => {
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

  it("renders the peer display name and call state text", () => {
    act(() => {
      root.render(<DirectCallActiveMinimized {...makeProps()} />);
    });

    expect(container.textContent).toContain("Seclettr Peer");
    expect(container.textContent).toContain("Connected");
  });

  it("calls onHangup when the end call button is clicked", () => {
    const onHangup = vi.fn();
    act(() => {
      root.render(<DirectCallActiveMinimized {...makeProps({ onHangup })} />);
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
      root.render(<DirectCallActiveMinimized {...makeProps({ onToggleMute })} />);
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
      root.render(<DirectCallActiveMinimized {...makeProps({ muted: true })} />);
    });

    const btn = container.querySelector('button[aria-label="Toggle mute"]');
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onOpenDetails when the expand button is clicked", () => {
    const onOpenDetails = vi.fn();
    act(() => {
      root.render(<DirectCallActiveMinimized {...makeProps({ onOpenDetails })} />);
    });

    const btn = container.querySelector('button[aria-label="Expand"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });
});
