// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputField } from "../InputField";
import styles from "../InputField.module.css";

describe("InputField", () => {
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

  function getInput(): HTMLInputElement {
    const input = container.querySelector("input");
    if (!input) throw new Error("InputField did not render an <input>");
    return input;
  }

  it("renders a text input wrapped in a label shell by default", () => {
    act(() => {
      root.render(<InputField aria-label="Name" />);
    });
    expect(container.querySelector("label")).not.toBeNull();
    expect(getInput().type).toBe("text");
  });

  it("supports a controlled value with an onChange handler", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<InputField aria-label="Name" value="hello" onChange={onChange} />);
    });
    expect(getInput().value).toBe("hello");
  });

  it("renders a decorative leading slot", () => {
    act(() => {
      root.render(<InputField aria-label="Search" leading={<svg data-testid="icon" />} />);
    });
    const wrapper = container.querySelector("[data-testid='icon']")?.parentElement;
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies the pill size recipe and supports the search type", () => {
    act(() => {
      root.render(<InputField aria-label="Search" size="pill" type="search" />);
    });
    expect(container.querySelector("label")?.className).toContain(styles.pill);
    expect(getInput().type).toBe("search");
  });

  it("merges wrapperClassName on the shell and className on the input", () => {
    act(() => {
      root.render(<InputField aria-label="Name" wrapperClassName="shell-extra" className="input-extra" />);
    });
    expect(container.querySelector("label")?.className).toContain("shell-extra");
    expect(getInput().className).toContain("input-extra");
  });
});
