// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl, type SegmentedControlOption } from "../SegmentedControl";
import styles from "../SegmentedControl.module.css";

type Mode = "all" | "unread" | "muted";

const options: SegmentedControlOption<Mode>[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "muted", label: "Muted", disabled: true },
];

describe("SegmentedControl", () => {
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

  function buttons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>("fieldset button"));
  }

  it("renders a labelled fieldset with one button per option", () => {
    act(() => {
      root.render(
        <SegmentedControl value="all" options={options} onChange={vi.fn()} ariaLabel="Filter" />
      );
    });
    expect(container.querySelector("fieldset")?.getAttribute("aria-label")).toBe("Filter");
    expect(buttons()).toHaveLength(3);
  });

  it("marks the selected option with aria-pressed and the active recipe", () => {
    act(() => {
      root.render(
        <SegmentedControl value="unread" options={options} onChange={vi.fn()} ariaLabel="Filter" />
      );
    });
    const [all, unread] = buttons();
    expect(unread?.getAttribute("aria-pressed")).toBe("true");
    expect(unread?.className).toContain(styles.active);
    expect(all?.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onChange with the option value on click", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <SegmentedControl value="all" options={options} onChange={onChange} ariaLabel="Filter" />
      );
    });
    act(() => {
      buttons()[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("unread");
  });

  it("disables options flagged as disabled", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <SegmentedControl value="all" options={options} onChange={onChange} ariaLabel="Filter" />
      );
    });
    const muted = buttons()[2];
    expect(muted?.disabled).toBe(true);
    act(() => {
      muted?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the active recipe when the controlled value changes", () => {
    act(() => {
      root.render(
        <SegmentedControl value="all" options={options} onChange={vi.fn()} ariaLabel="Filter" />
      );
    });
    expect(buttons()[0]?.className).toContain(styles.active);
    act(() => {
      root.render(
        <SegmentedControl value="unread" options={options} onChange={vi.fn()} ariaLabel="Filter" />
      );
    });
    expect(buttons()[1]?.className).toContain(styles.active);
  });
});
