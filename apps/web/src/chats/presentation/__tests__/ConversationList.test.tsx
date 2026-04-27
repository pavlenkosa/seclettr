// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import type { Conversation } from "@/stores/messages";
import { ConversationList } from "../ConversationList";

const alice: Conversation = {
  userId: "user-alice",
  username: "Alice",
  messages: [],
  lastMessageAt: 1000,
  unreadCount: 0,
};

const bob: Conversation = {
  userId: "user-bob",
  username: "Bob",
  messages: [],
  lastMessageAt: 2000,
  unreadCount: 2,
};

function createConversation(index: number): Conversation {
  return {
    userId: `user-${index}`,
    username: `User ${index}`,
    messages: [],
    lastMessageAt: 3000 + index,
    unreadCount: 0,
  };
}

describe("ConversationList ARIA semantics", () => {
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  function render(activeId: string | null = null) {
    act(() => {
      root.render(
        <I18nProvider>
          <ConversationList
            conversations={[alice, bob]}
            activeId={activeId}
            onSelect={vi.fn()}
          />
        </I18nProvider>
      );
    });
  }

  it("renders the conversation list with role=listbox", () => {
    render();
    const list = container.querySelector('[role="listbox"]');
    expect(list).not.toBeNull();
    expect(list?.tagName.toLowerCase()).toBe("div");
  });

  it("renders each conversation item as role=option", () => {
    render();
    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
  });

  it("sets aria-selected=false on all items when none is active", () => {
    render(null);
    const options = container.querySelectorAll('[role="option"]');
    for (const option of options) {
      expect(option.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("sets aria-selected=true only on the active conversation", () => {
    // List is sorted by lastMessageAt desc — bob (2000) sorts first, alice (1000) second
    render("direct:user-alice");
    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
    // bob sorts first (lastMessageAt 2000), alice sorts second
    const [firstOption, secondOption] = options;
    expect(firstOption?.getAttribute("aria-selected")).toBe("false");
    expect(secondOption?.getAttribute("aria-selected")).toBe("true");
  });

  it("wraps each option in a presentation li to neutralize list-item role", () => {
    render();
    const presentationItems = container.querySelectorAll('li[role="none"]');
    expect(presentationItems.length).toBe(2);
  });

  it("shows empty state when no conversations", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <ConversationList
            conversations={[]}
            activeId={null}
            onSelect={vi.fn()}
          />
        </I18nProvider>
      );
    });
    // Empty state does not use a listbox
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("renders the provided loading placeholder count instead of a hardcoded three rows", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <ConversationList
            conversations={[]}
            activeId={null}
            loading
            loadingPlaceholderCount={6}
            onSelect={vi.fn()}
          />
        </I18nProvider>
      );
    });

    expect(container.querySelectorAll("li[aria-hidden='true']").length).toBe(6);
  });

  it("remembers the previous list size for a later loading transition", () => {
    const conversations = Array.from({ length: 5 }, (_, index) => createConversation(index));

    act(() => {
      root.render(
        <I18nProvider>
          <ConversationList
            conversations={conversations}
            activeId={null}
            onSelect={vi.fn()}
          />
        </I18nProvider>
      );
    });

    act(() => {
      root.render(
        <I18nProvider>
          <ConversationList
            conversations={[]}
            activeId={null}
            loading
            onSelect={vi.fn()}
          />
        </I18nProvider>
      );
    });

    expect(container.querySelectorAll("li[aria-hidden='true']").length).toBe(5);
  });
});
