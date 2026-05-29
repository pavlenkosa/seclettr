// @vitest-environment jsdom

import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectCallIncomingOverlay } from "@/calls/direct/presentation/components/DirectCallIncomingOverlay";

function makeProps(overrides?: Partial<React.ComponentProps<typeof DirectCallIncomingOverlay>>) {
  return {
    incomingOverlayRef: { current: null } as RefObject<HTMLDivElement>,
    incomingCallType: "video" as const,
    incomingPeerInitials: "SP",
    incomingPeerDisplayName: "Seclettr Peer",
    ringingLabel: "Ringing…",
    incomingDialogAriaLabel: "Incoming call",
    minimizeAriaLabel: "Minimize",
    videoCallLabel: "Video call",
    voiceCallLabel: "Voice call",
    rejectAriaLabel: "Reject",
    acceptAriaLabel: "Accept",
    onMinimize: vi.fn(),
    onReject: vi.fn(),
    onAccept: vi.fn(),
    incomingAcceptButtonRef: { current: null } as RefObject<HTMLButtonElement>,
    ...overrides,
  };
}

describe("DirectCallIncomingOverlay", () => {
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

  it("renders the peer display name and ringing label", () => {
    act(() => {
      root.render(<DirectCallIncomingOverlay {...makeProps()} />);
    });

    expect(container.textContent).toContain("Seclettr Peer");
    expect(container.textContent).toContain("Ringing…");
  });

  it("shows video call label for video calls", () => {
    act(() => {
      root.render(<DirectCallIncomingOverlay {...makeProps({ incomingCallType: "video" })} />);
    });

    expect(container.textContent).toContain("Video call");
  });

  it("shows voice call label for audio calls", () => {
    act(() => {
      root.render(<DirectCallIncomingOverlay {...makeProps({ incomingCallType: "audio" })} />);
    });

    expect(container.textContent).toContain("Voice call");
  });

  it("calls onReject when the reject button is clicked", () => {
    const onReject = vi.fn();
    act(() => {
      root.render(<DirectCallIncomingOverlay {...makeProps({ onReject })} />);
    });

    const btn = container.querySelector('button[aria-label="Reject"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("calls onAccept when the accept button is clicked", () => {
    const onAccept = vi.fn();
    act(() => {
      root.render(<DirectCallIncomingOverlay {...makeProps({ onAccept })} />);
    });

    const btn = container.querySelector('button[aria-label="Accept"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onMinimize when the minimize button is clicked", () => {
    const onMinimize = vi.fn();
    act(() => {
      root.render(<DirectCallIncomingOverlay {...makeProps({ onMinimize })} />);
    });

    const btn = container.querySelector('button[aria-label="Minimize"]');
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onMinimize).toHaveBeenCalledTimes(1);
  });
});
