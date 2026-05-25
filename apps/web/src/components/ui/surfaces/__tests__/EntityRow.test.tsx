// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntityRow } from "../EntityRow";
import styles from "../EntityRow.module.css";

describe("EntityRow", () => {
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

  it("renders an interactive button row by default", () => {
    act(() => {
      root.render(<EntityRow title="Jane Doe" />);
    });
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.type).toBe("button");
    expect(button?.className).toContain(styles.interactive);
    expect(button?.textContent).toContain("Jane Doe");
  });

  it("renders a non-interactive div row when as='div'", () => {
    act(() => {
      root.render(<EntityRow as="div" title="Jane Doe" />);
    });
    expect(container.querySelector("button")).toBeNull();
    const div = container.firstElementChild as HTMLElement;
    expect(div.tagName).toBe("DIV");
    expect(div.className).not.toContain(styles.interactive);
  });

  it("renders leading, subtitle, meta and trailing slots", () => {
    act(() => {
      root.render(
        <EntityRow
          as="div"
          title="Jane"
          leading={<span data-testid="lead">A</span>}
          subtitle="online"
          meta={<span data-testid="meta">badge</span>}
          trailing={<span data-testid="trail">x</span>}
        />
      );
    });
    expect(container.querySelector("[data-testid='lead']")).not.toBeNull();
    expect(container.textContent).toContain("online");
    expect(container.querySelector("[data-testid='meta']")).not.toBeNull();
    expect(container.querySelector("[data-testid='trail']")).not.toBeNull();
  });

  it("invokes onClick for the interactive button variant", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(<EntityRow title="Jane" onClick={onClick} />);
    });
    act(() => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies size and align recipes", () => {
    act(() => {
      root.render(<EntityRow as="div" title="Jane" size="lg" align="start" />);
    });
    const node = container.firstElementChild as HTMLElement;
    expect(node.className).toContain(styles.lg);
    expect(node.className).toContain(styles.alignStart);
  });
});
