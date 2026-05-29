// @vitest-environment jsdom

import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectCallIncomingMinimized } from "@/calls/direct/presentation/components/DirectCallIncomingMinimized";

const noop = () => {};

function makeProps(overrides?: Partial<React.ComponentProps<typeof DirectCallIncomingMinimized>>) {
  return {
    minimizedDockRef: { current: null } as RefObject<HTMLDialogElement>,
    isDraggingMinimizedDock: false,
    incomingDialogAriaLabel: "Incoming call",
    dragAriaLabel: "Drag",
    onStartDrag: noop,
    onMoveDrag: noop,
    onStopDrag: noop,
    incomingMinimizedSummaryRef: { current: null } as RefObject<HTMLButtonElement>,
    incomingMinimizedAcceptButtonRef: { current: null } as RefObject<HTMLButtonElement>,
    incomingCallType: "video" as const,
    incomingPeerInitials: "SP",
    incomingPeerDisplayName: "Seclettr Peer",
    incomingMetaText: "Incoming video call",
    openDetailsAriaLabel: "Open details",
    rejectAriaLabel: "Reject call",
    acceptAriaLabel: "Accept call",
    expandAriaLabel: "Expand",
    onOpenDetails: vi.fn(),
    onReject: vi.fn(),
    onAccept: vi.fn(),
    ...overrides,
  };
}

describe("DirectCallIncomingMinimized", () => {
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

  it("renders the peer display name and meta text", () => {
    act(() => {
      root.render(<DirectCallIncomingMinimized {...makeProps()} />);
    });

    expect(container.textContent).toContain("Seclettr Peer");
    expect(container.textContent).toContain("Incoming video call");
  });

  it("calls onReject when the reject button is clicked", () => {
    const onReject = vi.fn();
    act(() => {
      root.render(<DirectCallIncomingMinimized {...makeProps({ onReject })} />);
    });

    const btn = container.querySelector('button[aria-label="Reject call"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("calls onAccept when the accept button is clicked", () => {
    const onAccept = vi.fn();
    act(() => {
      root.render(<DirectCallIncomingMinimized {...makeProps({ onAccept })} />);
    });

    const btn = container.querySelector('button[aria-label="Accept call"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenDetails when the expand button is clicked", () => {
    const onOpenDetails = vi.fn();
    act(() => {
      root.render(<DirectCallIncomingMinimized {...makeProps({ onOpenDetails })} />);
    });

    const btn = container.querySelector('button[aria-label="Expand"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });
});
