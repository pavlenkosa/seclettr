// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "../IconButton";
import styles from "../IconButton.module.css";

describe("IconButton", () => {
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

  function getButton(): HTMLButtonElement {
    const button = container.querySelector("button");
    if (!button) throw new Error("IconButton did not render a <button>");
    return button;
  }

  it("renders a non-submitting button by default", () => {
    act(() => {
      root.render(<IconButton aria-label="Close" />);
    });
    const button = getButton();
    expect(button.type).toBe("button");
    expect(button.className).toContain(styles.button);
  });

  it("applies variant, tone and active recipes through class names", () => {
    act(() => {
      root.render(<IconButton aria-label="Delete" variant="ghost" tone="danger" active />);
    });
    const button = getButton();
    expect(button.className).toContain(styles.ghost);
    expect(button.className).toContain(styles.danger);
    expect(button.className).toContain(styles.active);
  });

  it("exposes the accessible label for icon-only usage", () => {
    act(() => {
      root.render(<IconButton aria-label="Open settings" />);
    });
    expect(getButton().getAttribute("aria-label")).toBe("Open settings");
  });

  it("maps a numeric size to the --icon-button-size custom property", () => {
    act(() => {
      root.render(<IconButton aria-label="Sized" size={32} />);
    });
    expect(getButton().style.getPropertyValue("--icon-button-size")).toBe("32px");
  });

  it("calls onClick when enabled and stays silent when disabled", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(<IconButton aria-label="Act" onClick={onClick} />);
    });
    act(() => {
      getButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(<IconButton aria-label="Act" onClick={onClick} disabled />);
    });
    const disabledButton = getButton();
    expect(disabledButton.disabled).toBe(true);
    act(() => {
      disabledButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
