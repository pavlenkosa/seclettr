// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Listbox, type ListboxOption } from "../Listbox";

const options: ListboxOption[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

describe("Listbox", () => {
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

  function getTrigger(): HTMLButtonElement {
    const trigger = container.querySelector<HTMLButtonElement>("button[role='combobox']");
    if (!trigger) throw new Error("Listbox did not render a combobox trigger");
    return trigger;
  }

  function getListbox(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>("[role='listbox']");
  }

  it("renders a closed combobox trigger showing the selected label", () => {
    act(() => {
      root.render(<Listbox value="light" options={options} onChange={vi.fn()} aria-label="Theme" />);
    });
    const trigger = getTrigger();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.textContent).toContain("Light");
    expect(getListbox()).toBeNull();
  });

  it("opens a portalled listbox with one option per entry on click", () => {
    act(() => {
      root.render(<Listbox value="dark" options={options} onChange={vi.fn()} aria-label="Theme" />);
    });
    act(() => {
      getTrigger().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const listbox = getListbox();
    expect(listbox).not.toBeNull();
    expect(getTrigger().getAttribute("aria-expanded")).toBe("true");
    expect(listbox?.querySelectorAll("[role='option']")).toHaveLength(3);
    const selected = listbox?.querySelector("[role='option'][aria-selected='true']");
    expect(selected?.textContent).toContain("Dark");
  });

  it("opens from the keyboard via ArrowDown on the trigger", () => {
    act(() => {
      root.render(<Listbox value="dark" options={options} onChange={vi.fn()} aria-label="Theme" />);
    });
    act(() => {
      getTrigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(getListbox()).not.toBeNull();
  });

  it("selects an option and reports the value through onChange", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<Listbox value="dark" options={options} onChange={onChange} aria-label="Theme" />);
    });
    act(() => {
      getTrigger().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const lightOption = Array.from(getListbox()?.querySelectorAll("[role='option']") ?? []).find(
      (node) => node.textContent?.includes("Light"),
    );
    act(() => {
      lightOption?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("light");
  });

  it("does not open when disabled", () => {
    act(() => {
      root.render(<Listbox value="dark" options={options} onChange={vi.fn()} aria-label="Theme" disabled />);
    });
    const trigger = getTrigger();
    expect(trigger.disabled).toBe(true);
    act(() => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(getListbox()).toBeNull();
  });
});
