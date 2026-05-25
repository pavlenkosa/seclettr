// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectCallFloatingPreview } from "@/calls/direct/presentation/components/DirectCallFloatingPreview";

function dispatchPointerEvent(target: HTMLElement, type: string) {
  const PointerEventConstructor = globalThis.PointerEvent ?? globalThis.MouseEvent;
  target.dispatchEvent(new PointerEventConstructor(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
  }));
}

describe("DirectCallFloatingPreview", () => {
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

  it("renders the preview label and proxies drag handlers", () => {
    const onStartDrag = vi.fn();
    const onMoveDrag = vi.fn();
    const onStopDrag = vi.fn();
    const onStartResize = vi.fn();
    const onMoveResize = vi.fn();
    const onStopResize = vi.fn();

    act(() => {
      root.render(
        <DirectCallFloatingPreview
          shellRef={{ current: null }}
          videoRef={{ current: null }}
          label="You"
          className="preview-shell"
          isDragging={false}
          style={{ left: "12px", top: "24px" }}
          onStartDrag={onStartDrag}
          onMoveDrag={onMoveDrag}
          onStopDrag={onStopDrag}
          onStartResize={onStartResize}
          onMoveResize={onMoveResize}
          onStopResize={onStopResize}
          resizeHandleLabel="Resize self preview"
        />
      );
    });

    const preview = container.firstElementChild as HTMLDivElement | null;
    expect(preview?.style.left).toBe("12px");
    expect(preview?.style.top).toBe("24px");
    expect(container.textContent).toContain("You");
    expect(container.querySelector("video")).not.toBeNull();
    const resizeHandle = container.querySelector('[aria-label="Resize self preview"]');
    expect(resizeHandle).not.toBeNull();

    act(() => {
      if (!preview) return;
      dispatchPointerEvent(preview, "pointerdown");
      dispatchPointerEvent(preview, "pointermove");
      dispatchPointerEvent(preview, "pointerup");
      if (!resizeHandle) return;
      dispatchPointerEvent(resizeHandle, "pointerdown");
      dispatchPointerEvent(resizeHandle, "pointermove");
      dispatchPointerEvent(resizeHandle, "pointerup");
    });

    expect(onStartDrag).toHaveBeenCalledTimes(1);
    expect(onMoveDrag).toHaveBeenCalledTimes(1);
    expect(onStopDrag).toHaveBeenCalledTimes(1);
    expect(onStartResize).toHaveBeenCalledTimes(1);
    expect(onMoveResize).toHaveBeenCalledTimes(1);
    expect(onStopResize).toHaveBeenCalledTimes(1);
  });
});
