// @vitest-environment jsdom

import React, { createRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessageComposerEmojiPicker,
  type MessageComposerEmojiPickerProps,
} from "../MessageComposerEmojiPicker";
import type { ComposerEmojiGroup } from "../composer-emojis";

vi.mock("@/lib/hooks", () => ({
  useModalSurfaceA11y: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en" }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const GROUP_A: ComposerEmojiGroup = {
  id: "smileys-and-emotion",
  labelKey: "g.smileys",
  fallbackLabel: "Smileys",
  subgroups: [],
};

const GROUP_B: ComposerEmojiGroup = {
  id: "people-and-body",
  labelKey: "g.people",
  fallbackLabel: "People",
  subgroups: [],
};

const GROUP_C: ComposerEmojiGroup = {
  id: "animals-and-nature",
  labelKey: "g.animals",
  fallbackLabel: "Animals",
  subgroups: [],
};

function makeProps(overrides: Partial<MessageComposerEmojiPickerProps> = {}): MessageComposerEmojiPickerProps {
  return {
    isOpen: true,
    disabled: false,
    pickerId: "test-picker",
    searchQuery: "",
    isSearchActive: false,
    emojiGroups: [GROUP_A, GROUP_B, GROUP_C],
    activeEmojiGroupId: GROUP_A.id,
    activeEmojiGroup: GROUP_A,
    hasRecentEmojis: false,
    recentEmojiItems: [],
    visibleEmojiItems: [],
    toggleButtonRef: createRef<HTMLButtonElement>(),
    pickerRef: createRef<HTMLElement>(),
    viewportRef: createRef<HTMLDivElement>(),
    onToggleMouseDown: vi.fn(),
    onToggleOpen: vi.fn(),
    onSearchQueryChange: vi.fn(),
    onSelectEmojiGroup: vi.fn(),
    onInsertEmoji: vi.fn(),
    isGifMode: false,
    isGifTabAvailable: false,
    gifQuery: "",
    gifResults: [],
    isGifLoading: false,
    isSendingGif: false,
    onSetGifMode: vi.fn(),
    onSetGifQuery: vi.fn(),
    onSendGif: vi.fn(),
    ...overrides,
  };
}

function dispatchKey(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("EmojiTabBar keyboard navigation", () => {
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

  function render(overrides: Partial<MessageComposerEmojiPickerProps> = {}) {
    const props = makeProps(overrides);
    act(() => {
      root.render(<MessageComposerEmojiPicker {...props} />);
    });
    return props;
  }

  it("ArrowRight activates the next group", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_A.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "ArrowRight"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_B.id);
  });

  it("ArrowLeft activates the previous group", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_B.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "ArrowLeft"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_A.id);
  });

  it("ArrowRight wraps from last to first", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_C.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "ArrowRight"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_A.id);
  });

  it("ArrowLeft wraps from first to last", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_A.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "ArrowLeft"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_C.id);
  });

  it("Home activates the first group", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_C.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "Home"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_A.id);
  });

  it("End activates the last group", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_A.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "End"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_C.id);
  });

  it("ArrowDown activates the next group (vertical alias)", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_A.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "ArrowDown"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_B.id);
  });

  it("ArrowUp activates the previous group (vertical alias)", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup, activeEmojiGroupId: GROUP_B.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "ArrowUp"); });

    expect(onSelectEmojiGroup).toHaveBeenCalledWith(GROUP_A.id);
  });

  it("ArrowRight activates GIF tab when isGifTabAvailable", () => {
    const onSetGifMode = vi.fn();
    render({ onSetGifMode, isGifTabAvailable: true, activeEmojiGroupId: GROUP_C.id });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "ArrowRight"); });

    expect(onSetGifMode).toHaveBeenCalledWith(true);
  });

  it("non-arrow keys do not trigger tab navigation", () => {
    const onSelectEmojiGroup = vi.fn();
    render({ onSelectEmojiGroup });

    const tablist = container.querySelector('[role="tablist"]')!;
    act(() => { dispatchKey(tablist, "Enter"); });
    act(() => { dispatchKey(tablist, "Tab"); });
    act(() => { dispatchKey(tablist, " "); });

    expect(onSelectEmojiGroup).not.toHaveBeenCalled();
  });
});
