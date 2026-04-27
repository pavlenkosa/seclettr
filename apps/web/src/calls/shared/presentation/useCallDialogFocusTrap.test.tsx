// @vitest-environment jsdom

import { useRef, useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCallDialogFocusTrap } from "@/calls/shared/presentation/useCallDialogFocusTrap";

interface HarnessProps {
  readonly isOpen: boolean;
  readonly onClose?: () => void;
  readonly trapTab?: boolean;
  readonly closeOnEscape?: boolean;
}

function TrapHarness({
  isOpen,
  onClose,
  trapTab = true,
  closeOnEscape = true,
}: HarnessProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);

  useCallDialogFocusTrap({
    isOpen,
    containerRef,
    initialFocusRef,
    onClose,
    closeOnEscape,
    trapTab,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div ref={containerRef}>
      <button ref={initialFocusRef} type="button">Primary</button>
      <button type="button">Secondary</button>
    </div>
  );
}

function StatefulTrapHarness({ onClose }: { onClose: () => void }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <TrapHarness
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setIsOpen(false);
      }}
    />
  );
}

describe("useCallDialogFocusTrap", () => {
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

  it("focuses the initial element when the dialog opens", () => {
    act(() => {
      root.render(<TrapHarness isOpen />);
    });

    expect(document.activeElement?.textContent).toBe("Primary");
  });

  it("cycles focus at the dialog boundaries", () => {
    act(() => {
      root.render(<TrapHarness isOpen />);
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const [firstButton, lastButton] = buttons;

    expect(firstButton).toBeDefined();
    expect(lastButton).toBeDefined();

    act(() => {
      lastButton?.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    expect(document.activeElement).toBe(firstButton);

    act(() => {
      firstButton?.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    });

    expect(document.activeElement).toBe(lastButton);
  });

  it("closes on Escape and restores the previous focus target", () => {
    const onClose = vi.fn();
    const previousFocus = document.createElement("button");
    previousFocus.type = "button";
    previousFocus.textContent = "Outside";
    document.body.appendChild(previousFocus);
    previousFocus.focus();

    act(() => {
      root.render(<StatefulTrapHarness onClose={onClose} />);
    });

    expect(document.activeElement?.textContent).toBe("Primary");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(previousFocus);
  });
});
