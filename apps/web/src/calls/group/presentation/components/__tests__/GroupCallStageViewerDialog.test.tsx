// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupCallStageViewerDialog } from "@/calls/group/presentation/components/GroupCallStageViewerDialog";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";

const stageTile: GroupCallStageTile = {
  id: "stage-tile",
  label: "Remote Screen",
  stream: null,
  audioStream: null,
  fallbackInitials: "RS",
  badge: "Screen",
  hasVideo: true,
  videoSource: "screen",
  isLocal: false,
};

function flushLazyViewer() {
  return act(async () => {
    await vi.dynamicImportSettled();
  });
}

describe("GroupCallStageViewerDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let loadSpy: { mockRestore: () => void };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    loadSpy.mockRestore();
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("closes on Escape without affecting stop-watching actions", async () => {
    const onClose = vi.fn();
    const onStopWatchingStageTile = vi.fn();

    await act(async () => {
      root.render(
        <GroupCallStageViewerDialog
          isOpen
          stageTile={stageTile}
          stageEyebrowLabel="Stage"
          enterFullscreenLabel="Fullscreen"
          exitFullscreenLabel="Exit fullscreen"
          closeViewerLabel="Close viewer"
          canStopWatchingStageTile
          stopWatchingStageLabel="Stop viewing"
          onClose={onClose}
          onStopWatchingStageTile={onStopWatchingStageTile}
        />
      );
    });

    await flushLazyViewer();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStopWatchingStageTile).not.toHaveBeenCalled();
  });

  it("traps focus inside the viewer dialog", async () => {
    await act(async () => {
      root.render(
        <GroupCallStageViewerDialog
          isOpen
          stageTile={stageTile}
          stageEyebrowLabel="Stage"
          enterFullscreenLabel="Fullscreen"
          exitFullscreenLabel="Exit fullscreen"
          closeViewerLabel="Close viewer"
          canStopWatchingStageTile
          stopWatchingStageLabel="Stop viewing"
          onClose={() => {}}
          onStopWatchingStageTile={() => {}}
        />
      );
    });

    await flushLazyViewer();

    // Dialog portals to document.body — query there, not inside container.
    const closeButton = document.body.querySelector('button[aria-label="Close viewer"]');
    const stopWatchingButton = document.body.querySelector('[aria-label="Stop viewing"]');

    expect(closeButton).not.toBeNull();
    expect(stopWatchingButton).not.toBeNull();
    expect(document.activeElement).toBe(closeButton);

    act(() => {
      closeButton?.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    expect(document.activeElement).toBe(stopWatchingButton);

    act(() => {
      stopWatchingButton?.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    });

    expect(document.activeElement).toBe(closeButton);
  });
});
