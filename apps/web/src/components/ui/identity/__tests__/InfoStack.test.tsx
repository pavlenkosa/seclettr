// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InfoStack } from "../InfoStack";
import styles from "../InfoStack.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("InfoStack", () => {
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

  it("renders the title with the start alignment by default", () => {
    act(() => {
      root.render(<InfoStack title="Display name" />);
    });
    expect(container.textContent).toContain("Display name");
    expect(container.firstElementChild?.className).toContain(styles.start);
  });

  it("renders an optional eyebrow above the title", () => {
    act(() => {
      root.render(<InfoStack eyebrow="Account" title="Display name" />);
    });
    const eyebrow = container.querySelector(`.${cssClass(styles.eyebrow)}`);
    expect(eyebrow?.textContent).toContain("Account");
  });

  it("renders the meta row when meta content is provided", () => {
    act(() => {
      root.render(<InfoStack title="Name" meta="Updated just now" />);
    });
    expect(container.querySelector(`.${cssClass(styles.metaRow)}`)).not.toBeNull();
    expect(container.textContent).toContain("Updated just now");
  });

  it("omits the meta row entirely when neither meta nor metaAccessory is given", () => {
    act(() => {
      root.render(<InfoStack title="Name" />);
    });
    expect(container.querySelector(`.${cssClass(styles.metaRow)}`)).toBeNull();
  });

  it("applies the center alignment recipe", () => {
    act(() => {
      root.render(<InfoStack title="Name" align="center" />);
    });
    expect(container.firstElementChild?.className).toContain(styles.center);
  });
});
