// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import type { Message } from "@/stores/messages";
import { MessageList } from "../MessageList";
import styles from "../MessageList.module.css";

function renderMessageList(messages: Message[]) {
  return (
    <I18nProvider>
      <MessageList messages={messages} />
    </I18nProvider>
  );
}

function createGroupedMediaMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `media-${index + 1}`,
    senderId: "peer",
    senderDeviceId: "device-1",
    content: "[attachment]",
    type: "attachment" as const,
    attachment: {
      attachmentId: `att-${index + 1}`,
      key: "key",
      digest: "digest",
      mimeType: "image/jpeg",
      size: 64_000,
      fileName: `photo-${index + 1}.jpg`,
      mediaGroupId: "group-1",
    },
    timestamp: Date.UTC(2026, 2, 10, 13, 58) + index * 500,
    status: "sent" as const,
    isOwn: false,
  }));
}

describe("MessageList media layout", () => {
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  it("renders voice note meta inside the voice layout without the generic bubble meta", () => {
    const message: Message = {
      id: "voice-1",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "[voice note]",
      type: "attachment",
      attachment: {
        attachmentId: "att-1",
        key: "key",
        digest: "digest",
        mimeType: "audio/ogg",
        size: 49_300,
        kind: "voice_note",
        durationMs: 3_000,
      },
      timestamp: Date.UTC(2026, 2, 10, 13, 58),
      status: "read",
      isOwn: true,
    };

    act(() => {
      root.render(renderMessageList([message]));
    });

    const bubble = container.querySelector(`.${styles.voiceBubble}`);
    expect(bubble).not.toBeNull();
    expect(bubble?.querySelector(`.${styles.meta}`)).toBeNull();
    expect(bubble?.querySelector(`.${styles.voiceFooter}`)).not.toBeNull();
  });

  it("keeps the generic bubble meta for plain text messages", () => {
    const message: Message = {
      id: "text-1",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "hello",
      type: "text",
      timestamp: Date.UTC(2026, 2, 10, 13, 58),
      status: "sent",
      isOwn: false,
    };

    act(() => {
      root.render(renderMessageList([message]));
    });

    const bubble = container.querySelector(`.${styles.bubble}`);
    expect(bubble).not.toBeNull();
    expect(bubble?.querySelector(`.${styles.meta}`)).not.toBeNull();
  });

  it("uses the dedicated five-item album layout before collapsing larger groups", () => {
    act(() => {
      root.render(renderMessageList(createGroupedMediaMessages(5)));
    });

    const mediaGroup = container.querySelector(`.${styles.mediaGroup}`);
    expect(mediaGroup?.getAttribute("data-layout")).toBe("quint");
    expect(mediaGroup?.querySelectorAll(`.${styles.mediaGroupCell}`)).toHaveLength(5);
  });

  it("highlights grouped albums when the requested message id belongs to a non-primary tile", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <MessageList
            messages={createGroupedMediaMessages(3)}
            highlightMessageId="media-3"
          />
        </I18nProvider>
      );
    });

    const highlightedBubble = container.querySelector(`.${styles.bubbleHighlighted}`);
    expect(highlightedBubble).not.toBeNull();
    expect(container.querySelector(`[data-mid="media-3"]`)).not.toBeNull();
    expect(container.querySelector('[data-rowid="row:media-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="message-row:row:media-1"]')).not.toBeNull();
  });

  it("keeps reply-to jumps wired in the non-virtualized timeline path", async () => {
    const onScrollToMessage = vi.fn();
    const messages: Message[] = [
      {
        id: "m1",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "original",
        type: "text",
        timestamp: 1,
        status: "sent",
        isOwn: false,
      },
      {
        id: "m2",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "reply",
        type: "text",
        replyTo: {
          id: "m1",
          content: "original",
          senderName: "Peer",
        },
        timestamp: 2,
        status: "sent",
        isOwn: false,
      },
    ];

    act(() => {
      root.render(
        <I18nProvider>
          <MessageList
            messages={messages}
            onScrollToMessage={onScrollToMessage}
          />
        </I18nProvider>
      );
    });

    await act(async () => {
      container.querySelector<HTMLElement>(`.${styles.quotedBubbleClickable}`)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(onScrollToMessage).toHaveBeenCalledWith("m1");
  });
});
