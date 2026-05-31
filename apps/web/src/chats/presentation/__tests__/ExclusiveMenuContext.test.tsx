// @vitest-environment jsdom

import React, { useEffect, useId, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExclusiveMenuProvider, useExclusiveMenu } from "../exclusive-menu-context";

// Minimal test harness: renders N named menu items inside a shared provider.
// Each item exposes buttons to open/close and an indicator for its open state.

function TestMenu({ id, label }: { id: string; label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { notifyOpen, subscribe } = useExclusiveMenu(id);

  useEffect(() => subscribe(() => setIsOpen(false)), [subscribe]);

  const handleOpen = () => {
    notifyOpen();
    setIsOpen(true);
  };

  return (
    <div data-testid={`menu-${label}`}>
      <button data-testid={`open-${label}`} onClick={handleOpen}>Open {label}</button>
      <button data-testid={`close-${label}`} onClick={() => setIsOpen(false)}>Close {label}</button>
      {isOpen && <div data-testid={`open-indicator-${label}`}>open</div>}
    </div>
  );
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ExclusiveMenuProvider>{children}</ExclusiveMenuProvider>;
}

describe("ExclusiveMenuProvider + useExclusiveMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("opening one menu closes the other", () => {
    act(() => {
      root.render(
        <TestWrapper>
          <TestMenu id="id-a" label="A" />
          <TestMenu id="id-b" label="B" />
        </TestWrapper>
      );
    });

    // Open A
    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-A"]')?.click(); });
    expect(container.querySelector('[data-testid="open-indicator-A"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="open-indicator-B"]')).toBeNull();

    // Open B — A should close
    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-B"]')?.click(); });
    expect(container.querySelector('[data-testid="open-indicator-A"]')).toBeNull();
    expect(container.querySelector('[data-testid="open-indicator-B"]')).not.toBeNull();
  });

  it("opening A then A again keeps A open (same id — no self-close)", () => {
    act(() => {
      root.render(
        <TestWrapper>
          <TestMenu id="id-a" label="A" />
          <TestMenu id="id-b" label="B" />
        </TestWrapper>
      );
    });

    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-A"]')?.click(); });
    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-A"]')?.click(); });

    expect(container.querySelector('[data-testid="open-indicator-A"]')).not.toBeNull();
  });

  it("three menus — opening third closes first two", () => {
    act(() => {
      root.render(
        <TestWrapper>
          <TestMenu id="id-a" label="A" />
          <TestMenu id="id-b" label="B" />
          <TestMenu id="id-c" label="C" />
        </TestWrapper>
      );
    });

    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-A"]')?.click(); });
    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-B"]')?.click(); });
    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-C"]')?.click(); });

    expect(container.querySelector('[data-testid="open-indicator-A"]')).toBeNull();
    expect(container.querySelector('[data-testid="open-indicator-B"]')).toBeNull();
    expect(container.querySelector('[data-testid="open-indicator-C"]')).not.toBeNull();
  });

  it("menus in separate providers do not cross-close", () => {
    act(() => {
      root.render(
        <>
          <ExclusiveMenuProvider>
            <TestMenu id="id-a" label="A" />
          </ExclusiveMenuProvider>
          <ExclusiveMenuProvider>
            <TestMenu id="id-b" label="B" />
          </ExclusiveMenuProvider>
        </>
      );
    });

    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-A"]')?.click(); });
    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="open-B"]')?.click(); });

    // Both open — separate providers, no cross-closing
    expect(container.querySelector('[data-testid="open-indicator-A"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="open-indicator-B"]')).not.toBeNull();
  });

  it("no-op graceful degradation without provider", () => {
    function StandaloneMenu() {
      const [isOpen, setIsOpen] = useState(false);
      const { notifyOpen, subscribe } = useExclusiveMenu("standalone");

      useEffect(() => subscribe(() => setIsOpen(false)), [subscribe]);

      return (
        <button onClick={() => { notifyOpen(); setIsOpen(true); }}>
          {isOpen ? "open" : "closed"}
        </button>
      );
    }

    act(() => { root.render(<StandaloneMenu />); });

    const btn = container.querySelector("button")!;
    act(() => { btn.click(); });

    // Should not throw and should open normally
    expect(btn.textContent).toBe("open");
  });
});
