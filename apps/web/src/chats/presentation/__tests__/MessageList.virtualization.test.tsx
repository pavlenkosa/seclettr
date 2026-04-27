// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import type { Message } from "@/stores/messages";

const useVirtualizerMock = vi.fn();

vi.mock("@tanstack/react-virtual", () => ({
  measureElement: vi.fn(),
  useVirtualizer: (options: {
    count: number;
    getItemKey: (index: number) => string | number;
  }) => useVirtualizerMock(options),
}));

import { MessageList } from "../MessageList";

function createMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index + 1}`,
    senderId: "peer",
    senderDeviceId: "device-1",
    content: `message-${index + 1}`,
    type: "text" as const,
    timestamp: index + 1,
    status: "sent" as const,
    isOwn: false,
  }));
}

describe("MessageList virtualization", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => {
        if (key === "seclettr.locale.v1") return "en";
        if (key === "seclettr.ui.autoDecryptMedia.v1") return "off";
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    useVirtualizerMock.mockImplementation((options: {
      count: number;
      getItemKey: (index: number) => string | number;
    }) => ({
      measureElement: vi.fn(),
      getTotalSize: () => options.count * 110,
      getVirtualItems: () => options.count > 0
        ? [{
            index: 0,
            key: options.getItemKey(0),
            start: 0,
            end: 110,
            size: 110,
            lane: 0,
          }]
        : [],
      scrollToIndex: vi.fn(),
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    useVirtualizerMock.mockReset();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  it("configures measured virtualization with stable row identity", () => {
    const messages = createMessages(81);

    act(() => {
      root.render(
        <I18nProvider>
          <MessageList messages={messages} />
        </I18nProvider>
      );
    });

    const options = useVirtualizerMock.mock.calls[0]?.[0] as {
      count: number;
      estimateSize: (index: number) => number;
      getItemKey: (index: number) => string | number;
      measureElement: unknown;
    };

    expect(options.count).toBe(81);
    expect(options.estimateSize(0)).toBe(110);
    expect(options.getItemKey(0)).toBe("row:m1");
    expect(options.getItemKey(80)).toBe("row:m81");
    expect(options.measureElement).toBeTypeOf("function");
    expect(container.querySelector('[data-rowid="row:m1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="message-row:row:m1"]')).not.toBeNull();
    expect(container.querySelector('[data-index="0"]')).not.toBeNull();
  });
});
