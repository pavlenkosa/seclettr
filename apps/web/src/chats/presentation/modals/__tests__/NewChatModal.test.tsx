// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";

const { mockSearchUsers } = vi.hoisted(() => ({
  mockSearchUsers: vi.fn<[string], Promise<Array<{ userId: string; username: string }>>>(),
}));

vi.mock("@/lib/user-search", () => ({
  searchUsers: mockSearchUsers,
  USER_SEARCH_MIN_QUERY_LENGTH: 3,
}));

vi.mock("@/lib/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/hooks")>();
  return {
    ...original,
    useAnimatedClose: (onClose: () => void) => ({
      isClosing: false,
      requestClose: onClose,
    }),
    useModalSurfaceA11y: () => {},
  };
});

import { NewChatModal } from "../NewChatModal";

describe("NewChatModal search flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "en"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    vi.useFakeTimers();
    mockSearchUsers.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  function renderModal(onClose = vi.fn(), onSelect = vi.fn()) {
    act(() => {
      root.render(
        <I18nProvider>
          <NewChatModal onClose={onClose} onSelect={onSelect} />
        </I18nProvider>
      );
    });
  }

  function getSearchInput(): HTMLInputElement | null {
    return container.querySelector('input[type="search"]');
  }

  function typeIntoSearch(value: string) {
    const input = getSearchInput();
    if (!input) throw new Error("Search input not found");
    act(() => {
      Object.defineProperty(input, "value", { writable: true, value });
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // Simulate React onChange
      input.value = value;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeInputValueSetter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const changeEvent = new Event("change", { bubbles: true });
      input.dispatchEvent(changeEvent);
    });
  }

  it("renders the search input", () => {
    renderModal();
    expect(getSearchInput()).not.toBeNull();
  });

  it("does not call searchUsers immediately on input (debounced)", async () => {
    mockSearchUsers.mockResolvedValue([]);
    renderModal();

    typeIntoSearch("ali");
    // Before debounce fires, no search should happen
    expect(mockSearchUsers).not.toHaveBeenCalled();
  });

  it("calls searchUsers after the debounce delay", async () => {
    mockSearchUsers.mockResolvedValue([]);
    renderModal();

    typeIntoSearch("ali");
    expect(mockSearchUsers).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(mockSearchUsers).toHaveBeenCalledWith("ali");
  });

  it("does not call searchUsers if query is shorter than minimum", async () => {
    mockSearchUsers.mockResolvedValue([]);
    renderModal();

    typeIntoSearch("al"); // 2 chars, below minimum of 3
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearchUsers).not.toHaveBeenCalled();
  });

  it("cancels the debounce timer when input changes rapidly", async () => {
    mockSearchUsers.mockResolvedValue([]);
    renderModal();

    typeIntoSearch("ali");
    await act(async () => { vi.advanceTimersByTime(100); });

    typeIntoSearch("alic");
    await act(async () => { vi.advanceTimersByTime(100); });

    typeIntoSearch("alice");
    await act(async () => { vi.advanceTimersByTime(250); });

    // Only one call with the final value
    expect(mockSearchUsers).toHaveBeenCalledTimes(1);
    expect(mockSearchUsers).toHaveBeenCalledWith("alice");
  });

  it("displays search results after a successful search", async () => {
    mockSearchUsers.mockResolvedValue([
      { userId: "u1", username: "Alice" },
      { userId: "u2", username: "Bob" },
    ]);
    renderModal();

    typeIntoSearch("ali");
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    const buttons = container.querySelectorAll('[role="option"]');
    expect(buttons.length).toBe(2);
  });

  it("calls onSelect with userId and username when a result is clicked", async () => {
    const onSelect = vi.fn();
    mockSearchUsers.mockResolvedValue([
      { userId: "u1", username: "Alice" },
    ]);
    renderModal(vi.fn(), onSelect);

    typeIntoSearch("ali");
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    const option = container.querySelector('[role="option"]');
    act(() => { (option as HTMLElement)?.click(); });

    expect(onSelect).toHaveBeenCalledWith("u1", "Alice");
  });
});
