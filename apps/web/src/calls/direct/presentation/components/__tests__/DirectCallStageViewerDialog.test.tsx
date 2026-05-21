// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectCallStageViewerDialog } from "@/calls/direct/presentation/components/DirectCallStageViewerDialog";

const defaultProps = {
  isOpen: true,
  stream: null,
  peerDisplayName: "Seclettr Peer",
  callStateText: "Connected",
  screenStageLabel: "Screen share",
  dialogAriaLabel: "Screen share viewer",
  enterFullscreenLabel: "Enter fullscreen",
  exitFullscreenLabel: "Exit fullscreen",
  closeViewerLabel: "Close viewer",
  stopWatchingScreenLabel: "Stop watching screen share",
};

describe("DirectCallStageViewerDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let loadSpy: { mockRestore: () => void };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    loadSpy.mockRestore();
    container.remove();
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    Reflect.deleteProperty(document, "exitFullscreen");
  });

  it("closes on Escape without triggering stop-watching", async () => {
    const onClose = vi.fn();
    const onStopWatchingScreen = vi.fn();

    act(() => {
      root.render(
        <DirectCallStageViewerDialog
          {...defaultProps}
          onClose={onClose}
          onStopWatchingScreen={onStopWatchingScreen}
        />
      );
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStopWatchingScreen).not.toHaveBeenCalled();
  });

  it("stop-watching button calls both handlers", async () => {
    const onClose = vi.fn();
    const onStopWatchingScreen = vi.fn();

    act(() => {
      root.render(
        <DirectCallStageViewerDialog
          {...defaultProps}
          onClose={onClose}
          onStopWatchingScreen={onStopWatchingScreen}
        />
      );
    });

    const stopWatchingButton = document.querySelector('[aria-label="Stop watching screen share"]') as HTMLButtonElement | null;
    expect(stopWatchingButton).not.toBeNull();

    await act(async () => {
      stopWatchingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onStopWatchingScreen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows enter fullscreen toggle button when not in native fullscreen", () => {
    const onClose = vi.fn();
    const onStopWatchingScreen = vi.fn();

    act(() => {
      root.render(
        <DirectCallStageViewerDialog
          {...defaultProps}
          onClose={onClose}
          onStopWatchingScreen={onStopWatchingScreen}
        />
      );
    });

    const fsToggleButton = document.querySelector('[aria-label="Enter fullscreen"]');
    expect(fsToggleButton).not.toBeNull();
  });

  it("uses icon-button controls on mobile without native fullscreen toggle", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(max-width: 640px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    const onClose = vi.fn();
    const onStopWatchingScreen = vi.fn();

    act(() => {
      root.render(
        <DirectCallStageViewerDialog
          {...defaultProps}
          onClose={onClose}
          onStopWatchingScreen={onStopWatchingScreen}
        />
      );
    });

    // Native fullscreen toggle is hidden on mobile viewports
    expect(document.querySelector('[aria-label="Enter fullscreen"]')).toBeNull();
    // Close and stop-watching are icon buttons (aria-label only, no visible text)
    expect(document.querySelector('button[aria-label="Close viewer"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Stop watching screen share"]')).not.toBeNull();
  });

  it("renders nothing when closed", () => {
    const onClose = vi.fn();
    const onStopWatchingScreen = vi.fn();

    act(() => {
      root.render(
        <DirectCallStageViewerDialog
          {...defaultProps}
          isOpen={false}
          onClose={onClose}
          onStopWatchingScreen={onStopWatchingScreen}
        />
      );
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
