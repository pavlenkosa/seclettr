// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
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

  function getRoot(): HTMLSpanElement {
    const node = container.querySelector("span");
    if (!node) throw new Error("Avatar did not render a <span>");
    return node;
  }

  it("derives two-letter initials from a multi-word label", () => {
    act(() => {
      root.render(<Avatar label="John Doe" />);
    });
    expect(getRoot().textContent).toBe("JD");
  });

  it("prefers explicit initials over the derived label", () => {
    act(() => {
      root.render(<Avatar label="John Doe" initials="ZZ" />);
    });
    expect(getRoot().textContent).toBe("ZZ");
  });

  it("resolves a stable palette CSS variable reference for the same label", () => {
    act(() => {
      root.render(<Avatar label="Alice" />);
    });
    const first = getRoot().style.getPropertyValue("--avatar-bg");
    act(() => {
      root.render(<Avatar label="Alice" />);
    });
    expect(getRoot().style.getPropertyValue("--avatar-bg")).toBe(first);
    expect(first).toMatch(/^var\(--avatar-palette-\d+-bg\)$/);
  });

  it("maps a numeric size to the --avatar-size custom property", () => {
    act(() => {
      root.render(<Avatar label="Bob" size={40} />);
    });
    expect(getRoot().style.getPropertyValue("--avatar-size")).toBe("40px");
  });

  it("hides the decorative avatar from the accessibility tree when asked", () => {
    act(() => {
      root.render(<Avatar label="Bob" ariaHidden />);
    });
    expect(getRoot().getAttribute("aria-hidden")).toBe("true");
  });
});
