// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingDock } from "../FloatingDock";
import styles from "../FloatingDock.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

const noop = () => {};

describe("FloatingDock", () => {
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
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderDock(overrides: Partial<Parameters<typeof FloatingDock>[0]> = {}) {
    act(() => {
      root.render(
        <FloatingDock
          dialogAriaLabel="Minimized call"
          dragAriaLabel="Drag call dock"
          summary={<span data-testid="summary">Jane</span>}
          actions={<button type="button" data-testid="end">End</button>}
          onDragStart={noop}
          onDragMove={noop}
          onDragEnd={noop}
          {...overrides}
        />
      );
    });
  }

  function getDialog(): HTMLDialogElement {
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("FloatingDock did not render a <dialog>");
    return dialog;
  }

  it("renders an open dialog with its accessible label", () => {
    renderDock();
    const dialog = getDialog();
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Minimized call");
  });

  it("renders a labelled drag handle", () => {
    renderDock();
    const handle = container.querySelector(`.${cssClass(styles.dragHandle)}`);
    expect(handle?.getAttribute("aria-label")).toBe("Drag call dock");
  });

  it("renders summary and action slots", () => {
    renderDock();
    expect(container.querySelector("[data-testid='summary']")).not.toBeNull();
    expect(container.querySelector("[data-testid='end']")).not.toBeNull();
  });

  it("renders optional auxiliary content", () => {
    renderDock({ auxiliary: <span data-testid="aux">aux</span> });
    expect(container.querySelector("[data-testid='aux']")).not.toBeNull();
  });

  it("calls the drag-start handler on pointer down and reflects the dragging recipe", () => {
    const onDragStart = vi.fn();
    renderDock({ onDragStart, isDragging: true });
    expect(getDialog().className).toContain(styles.dragging);
    act(() => {
      container
        .querySelector(`.${cssClass(styles.dragHandle)}`)
        ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });
});
