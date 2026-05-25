// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PillButton } from "../PillButton";
import styles from "../PillButton.module.css";

describe("PillButton", () => {
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
    if (!button) throw new Error("PillButton did not render a <button>");
    return button;
  }

  it("renders a non-submitting button with its label by default", () => {
    act(() => {
      root.render(<PillButton>Save</PillButton>);
    });
    const button = getButton();
    expect(button.type).toBe("button");
    expect(button.textContent).toContain("Save");
    expect(button.className).toContain(styles.neutral);
    expect(button.className).toContain(styles.soft);
    expect(button.className).toContain(styles.sm);
  });

  it("applies tone, appearance, size and fullWidth recipes", () => {
    act(() => {
      root.render(
        <PillButton tone="accent" appearance="strong" size="md" fullWidth>
          Confirm
        </PillButton>
      );
    });
    const button = getButton();
    expect(button.className).toContain(styles.accent);
    expect(button.className).toContain(styles.strong);
    expect(button.className).toContain(styles.md);
    expect(button.className).toContain(styles.fullWidth);
  });

  it("renders decorative leading and trailing slots", () => {
    act(() => {
      root.render(
        <PillButton leading={<svg data-testid="lead" />} trailing={<svg data-testid="trail" />}>
          Action
        </PillButton>
      );
    });
    const lead = container.querySelector("[data-testid='lead']")?.parentElement;
    const trail = container.querySelector("[data-testid='trail']")?.parentElement;
    expect(lead?.getAttribute("aria-hidden")).toBe("true");
    expect(trail?.getAttribute("aria-hidden")).toBe("true");
  });

  it("honours an explicit submit type", () => {
    act(() => {
      root.render(<PillButton type="submit">Send</PillButton>);
    });
    expect(getButton().type).toBe("submit");
  });

  it("calls onClick when enabled and stays silent when disabled", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(<PillButton onClick={onClick}>Tap</PillButton>);
    });
    act(() => {
      getButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(<PillButton onClick={onClick} disabled>Tap</PillButton>);
    });
    const disabled = getButton();
    expect(disabled.disabled).toBe(true);
    act(() => {
      disabled.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
