// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InlineNotice } from "../InlineNotice";
import styles from "../InlineNotice.module.css";

describe("InlineNotice", () => {
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

  function getRoot(): HTMLDivElement {
    const node = container.querySelector("div");
    if (!node) throw new Error("InlineNotice did not render a <div>");
    return node;
  }

  it("renders children with the info tone by default", () => {
    act(() => {
      root.render(<InlineNotice>All good</InlineNotice>);
    });
    const node = getRoot();
    expect(node.textContent).toContain("All good");
    expect(node.className).toContain(styles.info);
    expect(node.className).toContain(styles.sm);
  });

  it("applies the warning and error tones", () => {
    act(() => {
      root.render(<InlineNotice tone="warning">Careful</InlineNotice>);
    });
    expect(getRoot().className).toContain(styles.warning);

    act(() => {
      root.render(<InlineNotice tone="error">Failed</InlineNotice>);
    });
    expect(getRoot().className).toContain(styles.error);
  });

  it("applies the md size recipe", () => {
    act(() => {
      root.render(<InlineNotice size="md">Spacious</InlineNotice>);
    });
    expect(getRoot().className).toContain(styles.md);
  });

  it("forwards the alert role for assistive announcement", () => {
    act(() => {
      root.render(
        <InlineNotice tone="error" role="alert">
          Something broke
        </InlineNotice>
      );
    });
    expect(getRoot().getAttribute("role")).toBe("alert");
  });

  it("merges a custom className", () => {
    act(() => {
      root.render(<InlineNotice className="notice-extra">Note</InlineNotice>);
    });
    expect(getRoot().className).toContain("notice-extra");
  });
});
