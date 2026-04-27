// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupCallMediaTile } from "@/calls/group/presentation/components/GroupCallMediaTile";

describe("GroupCallMediaTile", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps stop-watching separate from tile selection", () => {
    const onSelect = vi.fn();
    const onStopWatching = vi.fn();

    act(() => {
      root.render(
        <GroupCallMediaTile
          label="Seclettr Peer"
          stream={null}
          audioStream={null}
          fallbackInitials="SP"
          badge="Screen"
          variant="stage"
          interactiveLabel="Focus remote content"
          onSelect={onSelect}
          onStopWatching={onStopWatching}
          stopWatchingLabel="Stop viewing"
        />
      );
    });

    const tile = container.querySelector('[aria-label="Focus remote content"]') as HTMLElement | null;
    const stopWatchingButton = container.querySelector('[aria-label="Stop viewing"]') as HTMLButtonElement | null;

    expect(tile).not.toBeNull();
    expect(stopWatchingButton).not.toBeNull();

    act(() => {
      stopWatchingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onStopWatching).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      tile?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("maps audio-only fallback semantics to the tile role", () => {
    act(() => {
      root.render(
        <>
          <GroupCallMediaTile
            label="Stage Peer"
            stream={null}
            audioStream={null}
            fallbackInitials="SP"
            variant="stage"
          />
          <GroupCallMediaTile
            label="Strip Peer"
            stream={null}
            audioStream={null}
            fallbackInitials="TP"
            variant="strip"
          />
        </>
      );
    });

    expect(container.querySelector('[data-speaking-variant="primary-stage"]')).not.toBeNull();
    expect(container.querySelector('[data-speaking-variant="strip"]')).not.toBeNull();
  });
});
