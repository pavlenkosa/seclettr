// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCallAudioActivity } from "@/calls/shared/media/useCallAudioActivity";
import { useGroupCallAudioActivity } from "@/calls/group/runtime/useGroupCallAudioActivity";
import { audioActivityRegistry } from "@/calls/shared/media/audio-activity-registry";

interface HookSnapshot {
  direct: boolean;
  group: boolean;
}

function HookHarness(props: {
  stream: MediaStream | null;
  enabled: boolean;
  capture: (snapshot: HookSnapshot) => void;
}) {
  props.capture({
    direct: useCallAudioActivity(props.stream, props.enabled),
    group: useGroupCallAudioActivity(props.stream, props.enabled),
  });

  return null;
}

describe("call audio activity adapters", () => {
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
    vi.restoreAllMocks();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("updates direct and group adapters from the shared registry", () => {
    const listeners: Array<(isActive: boolean) => void> = [];
    const subscribeSpy = vi.spyOn(audioActivityRegistry, "subscribe").mockImplementation((_stream, listener) => {
      listeners.push(listener);
      listener(false);
      return () => undefined;
    });
    const snapshot = { current: { direct: false, group: false } };
    const stream = {} as MediaStream;

    act(() => {
      root.render(
        <HookHarness
          stream={stream}
          enabled
          capture={(next) => {
            snapshot.current = next;
          }}
        />
      );
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(snapshot.current).toEqual({ direct: false, group: false });

    act(() => {
      for (const listener of listeners) {
        listener(true);
      }
    });

    expect(snapshot.current).toEqual({ direct: true, group: true });
  });

  it("resets both adapters when detection is disabled", () => {
    const listeners: Array<(isActive: boolean) => void> = [];
    vi.spyOn(audioActivityRegistry, "subscribe").mockImplementation((_stream, listener) => {
      listeners.push(listener);
      return () => undefined;
    });
    const snapshot = { current: { direct: false, group: false } };
    const stream = {} as MediaStream;

    act(() => {
      root.render(
        <HookHarness
          stream={stream}
          enabled
          capture={(next) => {
            snapshot.current = next;
          }}
        />
      );
    });

    act(() => {
      for (const listener of listeners) {
        listener(true);
      }
    });

    expect(snapshot.current).toEqual({ direct: true, group: true });

    act(() => {
      root.render(
        <HookHarness
          stream={stream}
          enabled={false}
          capture={(next) => {
            snapshot.current = next;
          }}
        />
      );
    });

    expect(snapshot.current).toEqual({ direct: false, group: false });
  });
});
