// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatusBadge } from "../StatusBadge";
import styles from "../StatusBadge.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("StatusBadge", () => {
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
    if (!node) throw new Error("StatusBadge did not render a <span>");
    return node;
  }

  it("renders children with the neutral tone and sm size by default", () => {
    act(() => {
      root.render(<StatusBadge>Online</StatusBadge>);
    });
    const node = getRoot();
    expect(node.textContent).toContain("Online");
    expect(node.className).toContain(styles.neutral);
    expect(node.className).toContain(styles.sm);
  });

  it("applies each semantic tone", () => {
    for (const tone of ["accent", "success", "warning", "danger"] as const) {
      act(() => {
        root.render(<StatusBadge tone={tone}>State</StatusBadge>);
      });
      expect(getRoot().className).toContain(styles[tone]);
    }
  });

  it("applies the md and lg size recipes", () => {
    act(() => {
      root.render(<StatusBadge size="md">M</StatusBadge>);
    });
    expect(getRoot().className).toContain(styles.md);
    act(() => {
      root.render(<StatusBadge size="lg">L</StatusBadge>);
    });
    expect(getRoot().className).toContain(styles.lg);
  });

  it("renders a decorative icon slot, or a dot when no icon is given", () => {
    act(() => {
      root.render(<StatusBadge icon={<svg data-testid="icon" />}>Iconed</StatusBadge>);
    });
    const iconWrap = container.querySelector("[data-testid='icon']")?.parentElement;
    expect(iconWrap?.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      root.render(<StatusBadge dot>Dotted</StatusBadge>);
    });
    const dot = container.querySelector(`.${cssClass(styles.dot)}`);
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });

  it("maps a numeric iconSize to the --status-badge-icon-size custom property", () => {
    act(() => {
      root.render(
        <StatusBadge icon={<svg />} iconSize={18}>
          Sized
        </StatusBadge>
      );
    });
    expect(getRoot().style.getPropertyValue("--status-badge-icon-size")).toBe("18px");
  });
});
