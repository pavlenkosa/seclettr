// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FieldSection } from "../FieldSection";
import styles from "../FieldSection.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("FieldSection", () => {
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

  it("renders the label and the wrapped control children", () => {
    act(() => {
      root.render(
        <FieldSection label="Display name">
          <input data-testid="control" />
        </FieldSection>
      );
    });
    expect(container.textContent).toContain("Display name");
    expect(container.querySelector("[data-testid='control']")).not.toBeNull();
  });

  it("renders the label as a non-associating <p> caption", () => {
    act(() => {
      root.render(
        <FieldSection label="Caption">
          <input />
        </FieldSection>
      );
    });
    const label = container.querySelector(`.${cssClass(styles.label)}`);
    expect(label?.tagName).toBe("P");
  });

  it("renders primary and secondary descriptions when provided", () => {
    act(() => {
      root.render(
        <FieldSection label="Field" description="Primary help" secondaryDescription="Extra help">
          <input />
        </FieldSection>
      );
    });
    expect(container.textContent).toContain("Primary help");
    expect(container.textContent).toContain("Extra help");
  });

  it("omits the description block entirely when no copy is provided", () => {
    act(() => {
      root.render(
        <FieldSection label="Field">
          <input />
        </FieldSection>
      );
    });
    expect(container.querySelector(`.${cssClass(styles.description)}`)).toBeNull();
  });

  it("merges custom class names on root and label", () => {
    act(() => {
      root.render(
        <FieldSection label="Field" className="root-extra" labelClassName="label-extra">
          <input />
        </FieldSection>
      );
    });
    expect(container.firstElementChild?.className).toContain("root-extra");
    expect(container.querySelector(`.${cssClass(styles.label)}`)?.className).toContain("label-extra");
  });
});
