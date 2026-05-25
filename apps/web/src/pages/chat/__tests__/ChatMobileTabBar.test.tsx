// @vitest-environment jsdom

import { act, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import { MOTION_DURATION_MS } from "@/lib/motion";
import { ChatMobileTabBar } from "../ChatMobileTabBar";

function ChatMobileTabBarHarness({
  onOpenNewChat,
  onOpenNewGroup = vi.fn(),
}: Readonly<{
  onOpenNewChat: () => void;
  onOpenNewGroup?: () => void;
}>) {
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <I18nProvider>
      <ChatMobileTabBar
        isCreateMenuOpen={isCreateMenuOpen}
        isChatsActive
        isSettingsOpen={false}
        createMenuId="test-create-menu"
        createMenuRef={menuRef}
        onCreateMenuKeyDown={(_: ReactKeyboardEvent<HTMLDivElement>) => {}}
        onOpenChats={() => {}}
        onToggleCreateMenu={() => setIsCreateMenuOpen((isOpen) => !isOpen)}
        onCloseCreateMenu={() => setIsCreateMenuOpen(false)}
        onOpenNewChat={onOpenNewChat}
        onOpenNewGroup={onOpenNewGroup}
        onOpenSettings={() => {}}
      />
    </I18nProvider>
  );
}

describe("ChatMobileTabBar create menu", () => {
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

  it("opens the new chat modal only after the create popover exit finishes", () => {
    const onOpenNewChat = vi.fn();

    act(() => {
      root.render(<ChatMobileTabBarHarness onOpenNewChat={onOpenNewChat} />);
    });

    const newChatItem = container.querySelector<HTMLButtonElement>("[data-mobile-create-item='true']");
    expect(newChatItem).not.toBeNull();

    act(() => {
      newChatItem?.click();
    });

    expect(onOpenNewChat).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(MOTION_DURATION_MS.base);
    });

    expect(onOpenNewChat).toHaveBeenCalledTimes(1);
  });
});
