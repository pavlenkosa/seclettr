// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";
import {
  useGroupCallPanelUiState,
  useGroupCallPanelUiStateSync,
} from "@/calls/group/presentation/useGroupCallPanelUiState";

type GroupCallPanelUiStateApi = ReturnType<typeof useGroupCallPanelUiState>;

function createTile(id: string): GroupCallStageTile {
  return {
    id,
    label: `Tile ${id}`,
    stream: null,
    audioStream: null,
    fallbackInitials: id.toUpperCase(),
    badge: "",
    hasVideo: true,
    videoSource: "screen",
    isLocal: false,
  };
}

function HookHarness(props: {
  sessionGroupId: string | null;
  runtimeError: string | null;
  callTiles: GroupCallStageTile[];
  isCompactStagePreview: boolean;
  capture: (api: GroupCallPanelUiStateApi) => void;
}) {
  const api = useGroupCallPanelUiState({
    sessionGroupId: props.sessionGroupId,
  });

  useGroupCallPanelUiStateSync({
    runtimeError: props.runtimeError,
    callTiles: props.callTiles,
    isCompactStagePreview: props.isCompactStagePreview,
    setSuppressedStageTileIds: api.setSuppressedStageTileIds,
    setIsDetailsOpen: api.setIsDetailsOpen,
    setIsStageViewerOpen: api.setIsStageViewerOpen,
  });

  props.capture(api);
  return null;
}

describe("useGroupCallPanelUiState", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: GroupCallPanelUiStateApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function render(props?: Partial<React.ComponentProps<typeof HookHarness>>) {
    act(() => {
      root.render(
        <HookHarness
          sessionGroupId={props?.sessionGroupId ?? "group-1"}
          runtimeError={props?.runtimeError ?? null}
          callTiles={props?.callTiles ?? [createTile("tile-1"), createTile("tile-2")]}
          isCompactStagePreview={props?.isCompactStagePreview ?? false}
          capture={(next) => {
            api = next;
          }}
        />
      );
    });
  }

  it("resets minimized state, details, stage viewer, pinned tile, and suppressed tiles on session change", () => {
    render({ isCompactStagePreview: true });

    act(() => {
      api?.setIsMinimized(true);
      api?.setIsDetailsOpen(true);
      api?.setIsStageViewerOpen(true);
      api?.setPinnedStageTileId("tile-1");
      api?.setSuppressedStageTileIds(new Set(["tile-2"]));
    });

    render({
      sessionGroupId: "group-2",
      isCompactStagePreview: true,
    });

    expect(api?.isMinimized).toBe(false);
    expect(api?.isDetailsOpen).toBe(false);
    expect(api?.isStageViewerOpen).toBe(false);
    expect(api?.pinnedStageTileId).toBeNull();
    expect([...((api?.suppressedStageTileIds ?? new Set()) as Set<string>)]).toEqual([]);
  });

  it("opens details automatically when runtime reports an error", () => {
    render();

    expect(api?.isDetailsOpen).toBe(false);

    render({ runtimeError: "group.call.error.startFailed" });

    expect(api?.isDetailsOpen).toBe(true);
  });

  it("prunes suppressed stage tiles when they disappear from the visible tile list", () => {
    render({
      callTiles: [createTile("tile-1"), createTile("tile-2")],
    });

    act(() => {
      api?.handleStopWatchingStageTile("tile-1");
    });

    expect(api?.suppressedStageTileIds.has("tile-1")).toBe(true);

    render({
      callTiles: [createTile("tile-2")],
    });

    expect(api?.suppressedStageTileIds.has("tile-1")).toBe(false);
  });

  it("closes the compact stage viewer when the stage preview stops being compact", () => {
    render({ isCompactStagePreview: true });

    act(() => {
      api?.setIsStageViewerOpen(true);
    });

    expect(api?.isStageViewerOpen).toBe(true);

    render({ isCompactStagePreview: false });

    expect(api?.isStageViewerOpen).toBe(false);
  });
});
