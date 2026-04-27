// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarResize } from "../useSidebarResize";

type HookApi = ReturnType<typeof useSidebarResize>;

// Renders a real <div> with the hook's rootRef attached so useEffect sees the element.
function HookHarness(props: { capture: (api: HookApi) => void }) {
  const api = useSidebarResize();
  props.capture(api);
  return React.createElement("div", { ref: api.rootRef, "data-testid": "root" });
}

describe("useSidebarResize", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: HookApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
    localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderHook() {
    act(() => {
      root.render(React.createElement(HookHarness, { capture: (next) => { api = next; } }));
    });
  }

  it("returns rootRef, startResize, and resetWidth", () => {
    renderHook();
    expect(api).toBeTruthy();
    expect(typeof api?.rootRef).toBe("object");
    expect(typeof api?.startResize).toBe("function");
    expect(typeof api?.resetWidth).toBe("function");
  });

  it("applies DEFAULT_WIDTH (340) when localStorage is empty", () => {
    renderHook();
    expect(api!.rootRef.current?.style.getPropertyValue("--sidebar-width")).toBe("340px");
  });

  it("reads valid width from localStorage on mount", () => {
    localStorage.setItem("sidebar-width", "400");
    renderHook();
    expect(api!.rootRef.current?.style.getPropertyValue("--sidebar-width")).toBe("400px");
  });

  it("clamps stored width below MIN_WIDTH to 220", () => {
    localStorage.setItem("sidebar-width", "100");
    renderHook();
    expect(api!.rootRef.current?.style.getPropertyValue("--sidebar-width")).toBe("220px");
  });

  it("clamps stored width above MAX_WIDTH to 540", () => {
    localStorage.setItem("sidebar-width", "700");
    renderHook();
    expect(api!.rootRef.current?.style.getPropertyValue("--sidebar-width")).toBe("540px");
  });

  it("falls back to DEFAULT_WIDTH when localStorage has invalid value", () => {
    localStorage.setItem("sidebar-width", "not-a-number");
    renderHook();
    expect(api!.rootRef.current?.style.getPropertyValue("--sidebar-width")).toBe("340px");
  });

  it("resetWidth removes sidebar-width from localStorage", () => {
    localStorage.setItem("sidebar-width", "400");
    renderHook();
    act(() => {
      api!.resetWidth();
    });
    expect(localStorage.getItem("sidebar-width")).toBeNull();
  });

  it("resetWidth applies DEFAULT_WIDTH (340) to the rootRef element", () => {
    const div = document.createElement("div");
    renderHook();
    api!.rootRef.current = div;
    act(() => {
      api!.resetWidth();
    });
    expect(div.style.getPropertyValue("--sidebar-width")).toBe("340px");
  });

  it("startResize ignores non-primary mouse buttons", () => {
    const div = document.createElement("div");
    renderHook();
    api!.rootRef.current = div;

    const setPointerCaptureSpy = vi.fn();
    div.setPointerCapture = setPointerCaptureSpy;

    act(() => {
      api!.startResize({
        button: 2,
        clientX: 400,
        pointerType: "mouse",
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: div,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    expect(setPointerCaptureSpy).not.toHaveBeenCalled();
  });

  it("startResize captures pointer and updates width on pointermove", () => {
    const div = document.createElement("div");
    renderHook();
    api!.rootRef.current = div;

    div.setPointerCapture = vi.fn();

    act(() => {
      api!.startResize({
        button: 0,
        clientX: 300,
        pointerType: "mouse",
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: div,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    // Default start width is 340; move 50px right → 390
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 350 }));
    });

    expect(div.style.getPropertyValue("--sidebar-width")).toBe("390px");
  });

  it("startResize saves width to localStorage on pointerup", () => {
    const div = document.createElement("div");
    renderHook();
    api!.rootRef.current = div;
    div.setPointerCapture = vi.fn();

    act(() => {
      api!.startResize({
        button: 0,
        clientX: 300,
        pointerType: "mouse",
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: div,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    // Move 60px right → 340 + 60 = 400
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 360 }));
    });

    act(() => {
      document.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(localStorage.getItem("sidebar-width")).toBe("400");
  });

  it("clamps width to MAX_WIDTH (540) during drag", () => {
    const div = document.createElement("div");
    renderHook();
    api!.rootRef.current = div;
    div.setPointerCapture = vi.fn();

    act(() => {
      api!.startResize({
        button: 0,
        clientX: 300,
        pointerType: "mouse",
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: div,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    // Move far right — 340 + 300 = 640, clamped to 540
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 600 }));
    });

    expect(div.style.getPropertyValue("--sidebar-width")).toBe("540px");
  });

  it("clamps width to MIN_WIDTH (220) during drag", () => {
    const div = document.createElement("div");
    renderHook();
    api!.rootRef.current = div;
    div.setPointerCapture = vi.fn();

    act(() => {
      api!.startResize({
        button: 0,
        clientX: 300,
        pointerType: "mouse",
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: div,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    // Move far left — 340 - 300 = 40, clamped to 220
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0 }));
    });

    expect(div.style.getPropertyValue("--sidebar-width")).toBe("220px");
  });

  it("touch pointer (non-mouse) accepts button !== 0", () => {
    const div = document.createElement("div");
    renderHook();
    api!.rootRef.current = div;

    const setPointerCaptureSpy = vi.fn();
    div.setPointerCapture = setPointerCaptureSpy;

    act(() => {
      api!.startResize({
        button: 0,
        clientX: 300,
        pointerType: "touch",
        pointerId: 2,
        preventDefault: vi.fn(),
        currentTarget: div,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    // Touch should NOT be blocked even if button !== 0
    expect(setPointerCaptureSpy).toHaveBeenCalled();
  });
});
