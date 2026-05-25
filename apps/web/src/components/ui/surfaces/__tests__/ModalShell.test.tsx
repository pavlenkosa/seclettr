// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModalShell } from "../ModalShell";
import styles from "../ModalShell.module.css";
import { cssClass } from "../../__tests__/primitive-test-utils";

describe("ModalShell", () => {
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

  function renderShell(overrides: Partial<Parameters<typeof ModalShell>[0]> = {}) {
    const onClose = overrides.onClose ?? vi.fn();
    act(() => {
      root.render(
        <ModalShell
          isClosing={false}
          onClose={onClose}
          ariaLabel="Settings dialog"
          closeAriaLabel="Close"
          title="Settings"
          {...overrides}
        >
          <p>Body content</p>
        </ModalShell>
      );
    });
    return onClose;
  }

  function getSurface(): HTMLElement {
    const surface = document.body.querySelector("[role='dialog']");
    if (!surface) throw new Error("ModalShell did not render a dialog surface");
    return surface as HTMLElement;
  }

  it("renders a modal dialog surface with the title as a heading", () => {
    renderShell();
    const surface = getSurface();
    expect(surface.getAttribute("aria-modal")).toBe("true");
    expect(surface.getAttribute("aria-label")).toBe("Settings dialog");
    expect(document.body.querySelector("h2")?.textContent).toContain("Settings");
  });

  it("closes via the labelled close button", () => {
    const onClose = renderShell();
    const closeButton = document.body.querySelector(`.${cssClass(styles.closeButton)}`);
    expect(closeButton?.getAttribute("aria-label")).toBe("Close");
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape from the overlay", () => {
    const onClose = renderShell();
    const overlay = document.body.querySelector(`.${cssClass(styles.overlay)}`) as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the overlay backdrop itself is clicked", () => {
    const onClose = renderShell();
    const overlay = document.body.querySelector(`.${cssClass(styles.overlay)}`) as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Clicking inside the surface must not dismiss the modal.
    act(() => {
      getSurface().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders headerStart, headerExtra and footer slots", () => {
    renderShell({
      headerStart: <span data-testid="hstart">back</span>,
      headerExtra: <span data-testid="hextra">extra</span>,
      footer: <span data-testid="footer">actions</span>,
    });
    expect(document.body.querySelector("[data-testid='hstart']")).not.toBeNull();
    expect(document.body.querySelector("[data-testid='hextra']")).not.toBeNull();
    const footer = document.body.querySelector("[data-testid='footer']")?.parentElement;
    expect(footer?.className).toContain(styles.footer);
  });
});
