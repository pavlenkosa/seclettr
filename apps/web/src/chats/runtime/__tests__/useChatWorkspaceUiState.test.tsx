// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatWorkspaceUiState } from "../useChatWorkspaceUiState";

interface HookValue extends ReturnType<typeof useChatWorkspaceUiState> {}

function HookHarness(props: { hookRef: MutableRefObject<HookValue | null> }) {
  props.hookRef.current = useChatWorkspaceUiState();
  return null;
}

describe("useChatWorkspaceUiState", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };

    act(() => {
      root.render(<HookHarness hookRef={hookRef} />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("auto-clears chat notice by timer", () => {
    act(() => {
      hookRef.current?.showChatNotice("Saved");
    });

    expect(hookRef.current?.chatNotice).toBe("Saved");

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(hookRef.current?.chatNotice).toBeNull();
  });

  it("closes mobile create menu when settings open", () => {
    act(() => {
      hookRef.current?.setMobileCreateMenuOpen(true);
    });

    expect(hookRef.current?.mobileCreateMenuOpen).toBe(true);

    act(() => {
      hookRef.current?.openSettings();
    });

    expect(hookRef.current?.showSettings).toBe(true);
    expect(hookRef.current?.mobileCreateMenuOpen).toBe(false);
  });
});
