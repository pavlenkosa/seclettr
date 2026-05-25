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

  it("renders the conversation list as a ul", () => {
    render();
    const list = container.querySelector('ul[data-testid="chat-thread-list"]');
    expect(list).not.toBeNull();
    expect(list?.getAttribute("role")).toBeNull();
  });

  it("renders each conversation item as a li > button", () => {
    render();
    const items = container.querySelectorAll('li > button');
    // Saved Messages entry + alice + bob
    expect(items.length).toBe(3);
  });

  it("sets no aria-current when no conversation is active", () => {
    render(null);
    const buttons = container.querySelectorAll('li > button');
    for (const button of buttons) {
      expect(button.getAttribute("aria-current")).toBeNull();
    }
  });

  it("sets aria-current=true only on the active conversation", () => {
    // List is sorted by lastMessageAt desc — Saved Messages first, then bob (2000), alice (1000)
    render("direct:user-alice");
    const buttons = container.querySelectorAll('li > button');
    expect(buttons.length).toBe(3);
    // saved sorts first, bob sorts second (lastMessageAt 2000), alice sorts third
    const [savedButton, bobButton, aliceButton] = buttons;
    expect(savedButton?.getAttribute("aria-current")).toBeNull();
    expect(bobButton?.getAttribute("aria-current")).toBeNull();
    expect(aliceButton?.getAttribute("aria-current")).toBe("true");
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
    // The list is rendered but contains an empty-state li
    expect(container.querySelector('ul[data-testid="chat-thread-list"]')).not.toBeNull();
    expect(container.querySelector('li.empty, li[class*="empty"]')).not.toBeNull();
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
