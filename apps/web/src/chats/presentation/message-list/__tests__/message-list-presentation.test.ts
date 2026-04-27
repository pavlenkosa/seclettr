import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/stores/messages";
import {
  buildMessageRowPresentations,
  buildMessageRowPresentationState,
  describeCallEvent,
  resolveMessageTextPreview,
} from "../message-list-presentation";

const translate = vi.fn((key: string) => key);

describe("message-list-presentation", () => {
  it("builds date separators and timestamp grouping", () => {
    const now = Date.UTC(2026, 2, 30, 10, 0);
    vi.setSystemTime(now);

    const messages: Message[] = [
      {
        id: "m1",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "first",
        type: "text",
        timestamp: now,
        status: "sent",
        isOwn: false,
      },
      {
        id: "m2",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "second",
        type: "text",
        timestamp: now + 60_000,
        status: "sent",
        isOwn: false,
      },
      {
        id: "m3",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "third",
        type: "text",
        timestamp: now + 500_000,
        status: "sent",
        isOwn: false,
      },
    ];

    const rows = buildMessageRowPresentations({
      messages,
      senderLabels: { m1: "Peer", m2: "Peer", m3: "Peer" },
      locale: "en-US",
      t: translate,
    });

    expect(rows[0]?.showDateSeparator).toBe(true);
    expect(rows[0]?.showTimestamp).toBe(true);
    expect(rows[1]?.showTimestamp).toBe(false);
    expect(rows[2]?.showTimestamp).toBe(true);
    expect(rows[0]?.rowId).toBe("row:m1");
    expect(rows[1]?.messageIds).toEqual(["m2"]);
  });

  it("stores every grouped-media message id on the rendered album row", () => {
    const messages: Message[] = [
      {
        id: "media-1",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "[attachment]",
        type: "attachment",
        attachment: {
          attachmentId: "att-1",
          key: "key",
          digest: "digest",
          mimeType: "image/jpeg",
          size: 42,
          mediaGroupId: "album-1",
        },
        timestamp: 1,
        status: "sent",
        isOwn: false,
      },
      {
        id: "media-2",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "[attachment]",
        type: "attachment",
        attachment: {
          attachmentId: "att-2",
          key: "key",
          digest: "digest",
          mimeType: "image/jpeg",
          size: 42,
          mediaGroupId: "album-1",
        },
        timestamp: 2,
        status: "sent",
        isOwn: false,
      },
      {
        id: "media-3",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "[attachment]",
        type: "attachment",
        attachment: {
          attachmentId: "att-3",
          key: "key",
          digest: "digest",
          mimeType: "image/jpeg",
          size: 42,
          mediaGroupId: "album-1",
        },
        timestamp: 3,
        status: "sent",
        isOwn: false,
      },
    ];

    const rows = buildMessageRowPresentations({
      messages,
      senderLabels: {},
      locale: "en-US",
      t: translate,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowId).toBe("row:media-1");
    expect(rows[0]?.messageIds).toEqual(["media-1", "media-2", "media-3"]);
  });

  it("reuses unchanged prefix rows when appending a new message", () => {
    const baseMessages: Message[] = [
      {
        id: "m1",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "first",
        type: "text",
        timestamp: 1,
        status: "sent",
        isOwn: false,
      },
      {
        id: "m2",
        senderId: "peer",
        senderDeviceId: "device-1",
        content: "second",
        type: "text",
        timestamp: 2,
        status: "sent",
        isOwn: false,
      },
    ];
    const baseState = buildMessageRowPresentationState({
      messages: baseMessages,
      senderLabels: { m1: "Peer", m2: "Peer" },
      locale: "en-US",
      t: translate,
    });

    const appendedMessage: Message = {
      id: "m3",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "third",
      type: "text",
      timestamp: 600_000,
      status: "sent",
      isOwn: false,
    };
    const nextState = buildMessageRowPresentationState({
      messages: [...baseMessages, appendedMessage],
      senderLabels: { m1: "Peer", m2: "Peer", m3: "Peer" },
      locale: "en-US",
      t: translate,
      previousState: baseState,
    });

    expect(nextState.rows).toHaveLength(3);
    expect(nextState.rows[0]).toBe(baseState.rows[0]);
    expect(nextState.rows[1]).not.toBeUndefined();
    expect(nextState.rowIndexByMessageId.get("m3")).toBe(2);
    expect(nextState.rowIdByMessageId.get("m3")).toBe("row:m3");
  });

  it("rebuilds the trailing row when an appended message extends the last media group", () => {
    const mediaOne: Message = {
      id: "media-1",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "[attachment]",
      type: "attachment",
      attachment: {
        attachmentId: "att-1",
        key: "key",
        digest: "digest",
        mimeType: "image/jpeg",
        size: 42,
        mediaGroupId: "album-1",
      },
      timestamp: 1,
      status: "sent",
      isOwn: false,
    };
    const mediaTwo: Message = {
      ...mediaOne,
      id: "media-2",
      attachment: {
        ...mediaOne.attachment!,
        attachmentId: "att-2",
      },
      timestamp: 2,
    };
    const baseState = buildMessageRowPresentationState({
      messages: [mediaOne, mediaTwo],
      senderLabels: {},
      locale: "en-US",
      t: translate,
    });
    const mediaThree: Message = {
      ...mediaOne,
      id: "media-3",
      attachment: {
        ...mediaOne.attachment!,
        attachmentId: "att-3",
      },
      timestamp: 3,
    };

    const nextState = buildMessageRowPresentationState({
      messages: [mediaOne, mediaTwo, mediaThree],
      senderLabels: {},
      locale: "en-US",
      t: translate,
      previousState: baseState,
    });

    expect(nextState.rows).toHaveLength(1);
    expect(nextState.rows[0]).not.toBe(baseState.rows[0]);
    expect(nextState.rows[0]?.messageIds).toEqual(["media-1", "media-2", "media-3"]);
    expect(nextState.rowIndexByMessageId.get("media-3")).toBe(0);
    expect(nextState.rowIdByMessageId.get("media-3")).toBe("row:media-1");
  });

  it("formats call event title and meta", () => {
    const result = describeCallEvent({
      direction: "outbound",
      mode: "video",
      outcome: "ended",
      durationSec: 125,
    }, translate);

    expect(result.title).toBe("call.log.outbound call.videoCall");
    expect(result.meta).toBe("call.log.ended • 02:05");
  });

  it("maps attachment and encrypted placeholders to previews", () => {
    const attachmentMessage: Message = {
      id: "attachment",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "[attachment]",
      type: "attachment",
      attachment: {
        attachmentId: "att-1",
        key: "key",
        digest: "digest",
        mimeType: "application/pdf",
        size: 42,
      },
      timestamp: 1,
      status: "sent",
      isOwn: false,
    };
    const encryptedMessage: Message = {
      id: "encrypted",
      senderId: "peer",
      senderDeviceId: "device-1",
      content: "[encrypted message]",
      type: "text",
      timestamp: 2,
      status: "sent",
      isOwn: false,
    };

    expect(resolveMessageTextPreview(attachmentMessage, translate)).toBe("conversation.attachmentPreview");
    expect(resolveMessageTextPreview(encryptedMessage, translate)).toBe("conversation.encryptedMessagePreview");
  });
});
