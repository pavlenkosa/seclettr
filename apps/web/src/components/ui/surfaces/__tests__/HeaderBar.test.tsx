// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeaderBar } from "../HeaderBar";
import styles from "../HeaderBar.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("HeaderBar", () => {
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

  function slots(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(`.${cssClass(styles.slot)}`));
  }

  it("always renders the three header slots", () => {
    act(() => {
      root.render(<HeaderBar />);
    });
    expect(slots()).toHaveLength(3);
  });

  it("places leading, center and trailing content in their slots", () => {
    act(() => {
      root.render(
        <HeaderBar
          leading={<span data-testid="lead">L</span>}
          center={<span data-testid="mid">C</span>}
          trailing={<span data-testid="trail">T</span>}
        />
      );
    });
    const leadSlot = container.querySelector("[data-testid='lead']")?.parentElement;
    const midSlot = container.querySelector("[data-testid='mid']")?.parentElement;
    const trailSlot = container.querySelector("[data-testid='trail']")?.parentElement;
    expect(leadSlot?.className).toContain(styles.leading);
    expect(midSlot?.className).toContain(styles.center);
    expect(trailSlot?.className).toContain(styles.trailing);
  });

  it("keeps DOM slot order leading-center-trailing regardless of prop order", () => {
    act(() => {
      root.render(
        <HeaderBar
          trailing={<span data-testid="trail">T</span>}
          center={<span data-testid="mid">C</span>}
          leading={<span data-testid="lead">L</span>}
        />
      );
    });
    const order = slots().map((slot) => slot.textContent);
    expect(order).toEqual(["L", "C", "T"]);
  });

  it("applies the stack-center-on-narrow recipe when enabled", () => {
    act(() => {
      root.render(<HeaderBar stackCenterOnNarrow />);
    });
    expect(container.firstElementChild?.className).toContain(styles.stackCenterOnNarrow);
  });

  it("renders a custom semantic element via the as prop", () => {
    act(() => {
      root.render(<HeaderBar as="header" />);
    });
    expect(container.firstElementChild?.tagName).toBe("HEADER");
  });
});
