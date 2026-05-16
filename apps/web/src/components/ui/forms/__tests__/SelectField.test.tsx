// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectField } from "../SelectField";
import styles from "../SelectField.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("SelectField", () => {
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

  function getSelect(): HTMLSelectElement {
    const select = container.querySelector("select");
    if (!select) throw new Error("SelectField did not render a <select>");
    return select;
  }

  it("renders a native select wrapped in a label shell with its options", () => {
    act(() => {
      root.render(
        <SelectField aria-label="Theme" defaultValue="dark">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </SelectField>
      );
    });
    expect(container.querySelector("label")).not.toBeNull();
    expect(getSelect().querySelectorAll("option")).toHaveLength(2);
  });

  it("reflects a controlled value", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <SelectField aria-label="Theme" value="light" onChange={onChange}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </SelectField>
      );
    });
    expect(getSelect().value).toBe("light");
  });

  it("fires onChange when the selection changes", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <SelectField aria-label="Theme" defaultValue="dark" onChange={onChange}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </SelectField>
      );
    });
    const select = getSelect();
    select.value = "light";
    act(() => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("applies the pill size recipe", () => {
    act(() => {
      root.render(
        <SelectField aria-label="Theme" size="pill">
          <option value="dark">Dark</option>
        </SelectField>
      );
    });
    expect(container.querySelector("label")?.className).toContain(styles.pill);
  });

  it("renders decorative leading slot and chevron", () => {
    act(() => {
      root.render(
        <SelectField aria-label="Theme" leading={<svg data-testid="lead" />}>
          <option value="dark">Dark</option>
        </SelectField>
      );
    });
    const lead = container.querySelector("[data-testid='lead']")?.parentElement;
    expect(lead?.getAttribute("aria-hidden")).toBe("true");
    const chevron = container.querySelector(`.${cssClass(styles.chevron)}`);
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
  });
});
