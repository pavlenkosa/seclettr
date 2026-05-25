// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IconPill } from "../IconPill";
import styles from "../IconPill.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("IconPill", () => {
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
    if (!node) throw new Error("IconPill did not render a <span>");
    return node;
  }

  it("renders the icon and the label children", () => {
    act(() => {
      root.render(<IconPill icon={<svg data-testid="glyph" />}>Encrypted</IconPill>);
    });
    expect(container.querySelector("[data-testid='glyph']")).not.toBeNull();
    expect(container.textContent).toContain("Encrypted");
  });

  it("marks the icon wrapper as decorative for assistive tech", () => {
    act(() => {
      root.render(<IconPill icon={<svg />}>Voice</IconPill>);
    });
    const iconWrapper = container.querySelector(`.${cssClass(styles.icon)}`);
    expect(iconWrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies the md size recipe by default", () => {
    act(() => {
      root.render(<IconPill icon={<svg />}>Default</IconPill>);
    });
    expect(getRoot().className).toContain(styles.md);
  });

  it("applies the sm size recipe when requested", () => {
    act(() => {
      root.render(<IconPill icon={<svg />} size="sm">Compact</IconPill>);
    });
    expect(getRoot().className).toContain(styles.sm);
  });

  it("forwards pass-through attributes and merges className", () => {
    act(() => {
      root.render(
        <IconPill icon={<svg />} className="custom-pill" title="mode">
          Tag
        </IconPill>
      );
    });
    const node = getRoot();
    expect(node.className).toContain("custom-pill");
    expect(node.getAttribute("title")).toBe("mode");
  });
});
