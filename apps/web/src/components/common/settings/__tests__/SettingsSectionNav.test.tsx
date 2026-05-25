// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSectionNav, type SettingsSectionEntry } from "../SettingsSectionNav";

const sections: SettingsSectionEntry[] = [
  {
    id: "appearance",
    title: "Appearance",
    description: "Theme and accent",
    summary: "Dark · Rose",
    icon: <span>A</span>,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Push settings",
    summary: "Disabled",
    icon: <span>N</span>,
  },
  {
    id: "security",
    title: "Security",
    description: "Encryption and privacy",
    summary: "Balanced",
    icon: <span>S</span>,
  },
];

describe("SettingsSectionNav", () => {
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

  it("moves selection with arrow and home/end keys", () => {
    const onSelect = vi.fn();

    act(() => {
      root.render(
        <SettingsSectionNav
          sections={sections}
          activeSection="appearance"
          onSelect={onSelect}
          ariaLabel="Settings sections"
          note="Changes apply instantly"
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("nav button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.tabIndex).toBe(0);
    expect(buttons[1]?.tabIndex).toBe(-1);

    act(() => {
      buttons[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      buttons[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      buttons[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });

    expect(onSelect).toHaveBeenNthCalledWith(1, "notifications");
    expect(onSelect).toHaveBeenNthCalledWith(2, "security");
    expect(onSelect).toHaveBeenNthCalledWith(3, "appearance");
  });
});
