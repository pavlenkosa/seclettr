// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LabelPill } from "../LabelPill";
import styles from "../LabelPill.module.css";

describe("LabelPill", () => {
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
    if (!node) throw new Error("LabelPill did not render a <span>");
    return node;
  }

  it("renders children with the default tone and sm size", () => {
    act(() => {
      root.render(<LabelPill>HD</LabelPill>);
    });
    const node = getRoot();
    expect(node.textContent).toContain("HD");
    expect(node.className).toContain(styles.default);
    expect(node.className).toContain(styles.sm);
  });

  it("applies the overlay tone", () => {
    act(() => {
      root.render(<LabelPill tone="overlay">Live</LabelPill>);
    });
    expect(getRoot().className).toContain(styles.overlay);
  });

  it("applies the xs size recipe", () => {
    act(() => {
      root.render(<LabelPill size="xs">Tag</LabelPill>);
    });
    expect(getRoot().className).toContain(styles.xs);
  });

  it("applies the md size recipe", () => {
    act(() => {
      root.render(<LabelPill size="md">Tag</LabelPill>);
    });
    expect(getRoot().className).toContain(styles.md);
  });

  it("forwards pass-through attributes and merges className", () => {
    act(() => {
      root.render(
        <LabelPill className="pill-extra" title="meta">
          Tag
        </LabelPill>
      );
    });
    const node = getRoot();
    expect(node.className).toContain("pill-extra");
    expect(node.getAttribute("title")).toBe("meta");
  });
});
