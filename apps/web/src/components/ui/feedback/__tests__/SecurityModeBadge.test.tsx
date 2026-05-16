// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecurityModeBadge } from "../SecurityModeBadge";
import styles from "../SecurityModeBadge.module.css";

describe("SecurityModeBadge", () => {
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
    if (!node) throw new Error("SecurityModeBadge did not render a <span>");
    return node;
  }

  it("renders children with the badge recipe", () => {
    act(() => {
      root.render(<SecurityModeBadge tone="frame">Frame</SecurityModeBadge>);
    });
    const node = getRoot();
    expect(node.textContent).toContain("Frame");
    expect(node.className).toContain(styles.badge);
  });

  it("applies the frame tone", () => {
    act(() => {
      root.render(<SecurityModeBadge tone="frame">E2EE</SecurityModeBadge>);
    });
    expect(getRoot().className).toContain(styles.frame);
  });

  it("applies the transport tone", () => {
    act(() => {
      root.render(<SecurityModeBadge tone="transport">Transport</SecurityModeBadge>);
    });
    expect(getRoot().className).toContain(styles.transport);
  });

  it("forwards an accessible label through pass-through props", () => {
    act(() => {
      root.render(
        <SecurityModeBadge tone="frame" aria-label="Frame-level media protection">
          E2EE
        </SecurityModeBadge>
      );
    });
    expect(getRoot().getAttribute("aria-label")).toBe("Frame-level media protection");
  });

  it("merges a custom className", () => {
    act(() => {
      root.render(
        <SecurityModeBadge tone="transport" className="badge-extra">
          Transport
        </SecurityModeBadge>
      );
    });
    expect(getRoot().className).toContain("badge-extra");
  });
});
