// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SurfacePanel } from "../SurfacePanel";
import styles from "../SurfacePanel.module.css";

describe("SurfacePanel", () => {
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
    if (!node) throw new Error("SurfacePanel rendered nothing");
    return node;
  }

  it("renders a div with default tone, padding and radius recipes", () => {
    act(() => {
      root.render(<SurfacePanel>Panel</SurfacePanel>);
    });
    const node = getRoot();
    expect(node.tagName).toBe("DIV");
    expect(node.className).toContain(styles.default);
    expect(node.className).toContain(styles.paddingMd);
    expect(node.className).toContain(styles.radiusLg);
    expect(node.textContent).toContain("Panel");
  });

  it("applies the strong and accent tones", () => {
    act(() => {
      root.render(<SurfacePanel tone="strong">S</SurfacePanel>);
    });
    expect(getRoot().className).toContain(styles.strong);
    act(() => {
      root.render(<SurfacePanel tone="accent">A</SurfacePanel>);
    });
    expect(getRoot().className).toContain(styles.accent);
  });

  it("applies padding presets including none", () => {
    act(() => {
      root.render(<SurfacePanel padding="none">N</SurfacePanel>);
    });
    expect(getRoot().className).toContain(styles.paddingNone);
    act(() => {
      root.render(<SurfacePanel padding="lg">L</SurfacePanel>);
    });
    expect(getRoot().className).toContain(styles.paddingLg);
  });

  it("applies radius presets including pill", () => {
    act(() => {
      root.render(<SurfacePanel radius="pill">P</SurfacePanel>);
    });
    expect(getRoot().className).toContain(styles.radiusPill);
  });

  it("renders a custom semantic element via the as prop", () => {
    act(() => {
      root.render(<SurfacePanel as="section">Sect</SurfacePanel>);
    });
    expect(getRoot().tagName).toBe("SECTION");
  });
});
