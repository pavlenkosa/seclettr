// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  wsSend,
  directHangupCallKeepalive,
} = vi.hoisted(() => ({
  wsSend: vi.fn(),
  directHangupCallKeepalive: vi.fn(),
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    send: wsSend,
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    directHangupCallKeepalive,
  },
}));

import { useDirectCallPageLifecycle } from "@/calls/direct/runtime/useDirectCallPageLifecycle";

function HookHarness(props: {
  activeRef: MutableRefObject<{ callId: string } | null>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
}) {
  useDirectCallPageLifecycle(props);
  return null;
}

describe("useDirectCallPageLifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  const debugCallMedia = vi.fn();

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    wsSend.mockClear();
    directHangupCallKeepalive.mockClear();
    debugCallMedia.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("sends websocket and HTTP direct-hangup once on page exit", async () => {
    const activeRef = {
      current: { callId: "call-1" },
    } as MutableRefObject<{ callId: string } | null>;

    act(() => {
      root.render(<HookHarness activeRef={activeRef} debugCallMedia={debugCallMedia} />);
    });

    await act(async () => {
      globalThis.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(wsSend).toHaveBeenCalledTimes(1);
    expect(wsSend).toHaveBeenCalledWith({ type: "call.hangup", callId: "call-1" });
    expect(directHangupCallKeepalive).toHaveBeenCalledTimes(1);
    expect(directHangupCallKeepalive).toHaveBeenCalledWith("call-1");
    expect(debugCallMedia).toHaveBeenCalledWith("page-lifecycle-hangup", {
      callId: "call-1",
      trigger: "pagehide",
    });
  });

  it("deduplicates beforeunload after pagehide for the same call id", async () => {
    const activeRef = {
      current: { callId: "call-1" },
    } as MutableRefObject<{ callId: string } | null>;

    act(() => {
      root.render(<HookHarness activeRef={activeRef} debugCallMedia={debugCallMedia} />);
    });

    await act(async () => {
      globalThis.dispatchEvent(new Event("pagehide"));
      globalThis.dispatchEvent(new Event("beforeunload"));
      await Promise.resolve();
    });

    expect(wsSend).toHaveBeenCalledTimes(1);
    expect(directHangupCallKeepalive).toHaveBeenCalledTimes(1);
  });

  it("sends again when a new call id becomes active", async () => {
    const activeRef = {
      current: { callId: "call-1" },
    } as MutableRefObject<{ callId: string } | null>;

    act(() => {
      root.render(<HookHarness activeRef={activeRef} debugCallMedia={debugCallMedia} />);
    });

    await act(async () => {
      globalThis.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    activeRef.current = { callId: "call-2" };

    await act(async () => {
      globalThis.dispatchEvent(new Event("beforeunload"));
      await Promise.resolve();
    });

    expect(wsSend).toHaveBeenCalledTimes(2);
    expect(wsSend).toHaveBeenNthCalledWith(2, { type: "call.hangup", callId: "call-2" });
    expect(directHangupCallKeepalive).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there is no active call", async () => {
    const activeRef = {
      current: null,
    } as MutableRefObject<{ callId: string } | null>;

    act(() => {
      root.render(<HookHarness activeRef={activeRef} debugCallMedia={debugCallMedia} />);
    });

    await act(async () => {
      globalThis.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(wsSend).not.toHaveBeenCalled();
    expect(directHangupCallKeepalive).not.toHaveBeenCalled();
    expect(debugCallMedia).not.toHaveBeenCalled();
  });
});
