// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BottomDockSurface } from "../BottomDockSurface";
import styles from "../BottomDockSurface.module.css";

describe("BottomDockSurface", () => {
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

  function getRoot(): HTMLElement {
    const node = container.firstElementChild as HTMLElement | null;
    if (!node) throw new Error("BottomDockSurface rendered nothing");
    return node;
  }

  it("renders a div shell with its children by default", () => {
    act(() => {
      root.render(<BottomDockSurface>Dock</BottomDockSurface>);
    });
    const node = getRoot();
    expect(node.tagName).toBe("DIV");
    expect(node.className).toContain(styles.root);
    expect(node.textContent).toContain("Dock");
  });

  it("renders a nav element when as='nav'", () => {
    act(() => {
      root.render(<BottomDockSurface as="nav">Dock</BottomDockSurface>);
    });
    expect(getRoot().tagName).toBe("NAV");
  });

  it("applies the inline placement recipe", () => {
    act(() => {
      root.render(<BottomDockSurface placement="inline">Dock</BottomDockSurface>);
    });
    expect(getRoot().className).toContain(styles.inline);
  });

  it("does not apply the inline recipe for the default overlay placement", () => {
    act(() => {
      root.render(<BottomDockSurface>Dock</BottomDockSurface>);
    });
    expect(getRoot().className).not.toContain(styles.inline);
  });

  it("forwards an accessible label and merges className", () => {
    act(() => {
      root.render(
        <BottomDockSurface as="nav" aria-label="Primary" className="dock-extra">
          Dock
        </BottomDockSurface>
      );
    });
    const node = getRoot();
    expect(node.getAttribute("aria-label")).toBe("Primary");
    expect(node.className).toContain("dock-extra");
  });
});
