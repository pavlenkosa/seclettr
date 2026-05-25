// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CallIdentityBlock } from "../CallIdentityBlock";
import styles from "../CallIdentityBlock.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("CallIdentityBlock", () => {
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

  it("renders the title through the nested info stack", () => {
    act(() => {
      root.render(<CallIdentityBlock title="Jane Doe" />);
    });
    expect(container.textContent).toContain("Jane Doe");
  });

  it("renders the leading identity marker when provided", () => {
    act(() => {
      root.render(
        <CallIdentityBlock leading={<span data-testid="mark">JD</span>} title="Jane Doe" />
      );
    });
    const leading = container.querySelector("[data-testid='mark']")?.parentElement;
    expect(leading?.className).toContain(cssClass(styles.leading));
  });

  it("omits the leading wrapper when no leading content is given", () => {
    act(() => {
      root.render(<CallIdentityBlock title="Jane Doe" />);
    });
    expect(container.querySelector(`.${cssClass(styles.leading)}`)).toBeNull();
  });

  it("applies the inline layout by default and the stacked layout on request", () => {
    act(() => {
      root.render(<CallIdentityBlock title="Jane" />);
    });
    expect(container.firstElementChild?.className).toContain(styles.inline);
    act(() => {
      root.render(<CallIdentityBlock title="Jane" layout="stacked" />);
    });
    expect(container.firstElementChild?.className).toContain(styles.stacked);
  });

  it("forwards eyebrow and meta content into the identity stack", () => {
    act(() => {
      root.render(<CallIdentityBlock title="Jane" eyebrow="Incoming call" meta="Audio only" />);
    });
    expect(container.textContent).toContain("Incoming call");
    expect(container.textContent).toContain("Audio only");
  });
});
