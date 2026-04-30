// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import type { Message } from "@/stores/messages";
import type { MessageListRowPresentation } from "../message-list-presentation";

vi.mock("../MessageListAttachments", () => ({
  VoiceNoteAttachment: ({ msg }: { msg: Message }) => <div data-testid={`voice:${msg.id}`}>voice</div>,
  VideoNoteAttachment: ({ msg }: { msg: Message }) => <div data-testid={`video:${msg.id}`}>video</div>,
  FileAttachment: ({ msg }: { msg: Message }) => <div data-testid={`file:${msg.id}`}>file</div>,
  MessageStatusIcon: ({ status }: { status: Message["status"] }) => <span data-testid={`status:${status}`}>{status}</span>,
  isVoiceNote: (msg: Message) => msg.attachment?.kind === "voice_note",
  isVideoNote: (msg: Message) => msg.attachment?.kind === "video_note",
  isInlineMedia: (msg: Message) => msg.type === "attachment" && !!msg.attachment &&
    (msg.attachment.mimeType.startsWith("image/") || msg.attachment.mimeType.startsWith("video/")) &&
    msg.attachment.kind !== "voice_note" && msg.attachment.kind !== "video_note",
  isFileAttachment: (msg: Message) => msg.type === "attachment" && !!msg.attachment && msg.attachment.kind === "file",
  InlineMediaAttachment: ({ msg }: { msg: Message }) => <div data-testid={`media:${msg.id}`}>media</div>,
}));

vi.mock("../../MessageContextMenu", () => ({
  MessageContextMenu: ({
    children,
    onAction,
    canReply = true,
  }: {
    children: React.ReactNode;
    onAction: (action: { kind: "reply" | "copy" }) => void;
    canReply?: boolean;
  }) => (
    <div>
      {children}
      {canReply ? (
        <button
          type="button"
          data-testid="reply-action"
          onClick={() => onAction({ kind: "reply" })}
        >
          reply
        </button>
      ) : null}
    </div>
  ),
}));

import { MessageListRow } from "../MessageListRow";

function createMessageRowTestPresentation(message: Message): MessageListRowPresentation {
  return {
    rowId: `row:${message.id}`,
    message,
    messageIds: [message.id],
    senderLabel: message.isOwn ? undefined : "Peer",
    showTimestamp: true,
    showDateSeparator: false,
    dateSeparatorLabel: "",
    timeLabel: "10:00",
    callEvent: null,
    textPreview: message.content,
  };
}

function renderRow(message: Message, props?: Partial<React.ComponentProps<typeof MessageListRow>>) {
  const presentation = createMessageRowTestPresentation(message);

  return (
    <I18nProvider>
      <MessageListRow
        presentation={presentation}
        activeMediaKey={null}
        onActiveMediaChange={() => {}}
        isHighlighted={false}
        enterDelayMs={0}
        t={(key) => key}
        {...props}
      />
    </I18nProvider>
  );
}

describe("MessageListRow", () => {
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
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("fires reply action from the context menu", async () => {
    const onReply = vi.fn();
    const message: Message = {
      id: "text-1",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "hello",
      type: "text",
      timestamp: 1,
      status: "sent",
      isOwn: false,
    };

    act(() => {
      root.render(renderRow(message, { onReply }));
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="reply-action"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(onReply).toHaveBeenCalledWith("text-1");
  });

  it("shows retry button only for own error messages", () => {
    const ownError: Message = {
      id: "own-error",
      senderId: "me",
      senderDeviceId: "device-1",
      content: "failed",
      type: "text",
      timestamp: 1,
      status: "error",
      isOwn: true,
    };

    act(() => {
      root.render(renderRow(ownError, { onRetry: vi.fn() }));
    });

    expect(container.querySelector("[aria-label='conversation.retrySend']")).not.toBeNull();

    const remoteError: Message = {
      ...ownError,
      id: "remote-error",
      isOwn: false,
    };

    act(() => {
      root.render(renderRow(remoteError, { onRetry: vi.fn() }));
    });

    expect(container.querySelector("[aria-label='conversation.retrySend']")).toBeNull();
  });

  it("routes voice, video, and file attachments through the existing attachment components", () => {
    const voice: Message = {
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
        size: 1,
        kind: "voice_note",
      },
      timestamp: 1,
      status: "sent",
      isOwn: false,
    };

    act(() => {
      root.render(renderRow(voice));
    });
    expect(container.querySelector('[data-testid="voice:voice-1"]')).not.toBeNull();

    const video: Message = {
      ...voice,
      id: "video-1",
      content: "[video note]",
      attachment: {
        ...voice.attachment!,
        kind: "video_note",
        mimeType: "video/webm",
      },
    };

    act(() => {
      root.render(renderRow(video));
    });
    expect(container.querySelector('[data-testid="video:video-1"]')).not.toBeNull();

    const file: Message = {
      ...voice,
      id: "file-1",
      content: "[attachment]",
      attachment: {
        ...voice.attachment!,
        kind: "file",
        mimeType: "application/pdf",
      },
    };

    act(() => {
      root.render(renderRow(file));
    });
    expect(container.querySelector('[data-testid="file:file-1"]')).not.toBeNull();
  });

  it("renders attachment captions from encrypted attachment metadata", () => {
    const message: Message = {
      id: "file-caption-1",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "[attachment]",
      type: "attachment",
      attachment: {
        attachmentId: "att-1",
        key: "key",
        digest: "digest",
        mimeType: "application/pdf",
        size: 1,
        kind: "file",
        caption: "signed document",
      },
      timestamp: 1,
      status: "sent",
      isOwn: false,
    };

    act(() => {
      root.render(renderRow(message));
    });

    expect(container.textContent).toContain("signed document");
  });
});
