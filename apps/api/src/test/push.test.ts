import { describe, expect, it } from "vitest";
import {
  buildCallInvitePushPayload,
  buildDirectMessagePushPayload,
  buildGroupMessagePushPayload,
} from "../services/push-payloads.js";

describe("push payload preferences", () => {
  it("suppresses direct-message push when direct-message notifications are disabled", () => {
    const payload = buildDirectMessagePushPayload({
      senderUserId: "sender-1",
      senderUsername: "alice",
      hasAttachment: false,
      preferences: {
        directMessagesEnabled: false,
        groupMessagesEnabled: true,
        callInvitesEnabled: true,
        showSender: true,
      },
    });

    expect(payload).toBeNull();
  });

  it("redacts sender identity when sender visibility is disabled", () => {
    const payload = buildDirectMessagePushPayload({
      senderUserId: "sender-1",
      senderUsername: "alice",
      hasAttachment: false,
      preferences: {
        directMessagesEnabled: true,
        groupMessagesEnabled: true,
        callInvitesEnabled: true,
        showSender: false,
      },
    });

    expect(payload).toMatchObject({
      title: "Seclettr",
      body: "New encrypted message",
      data: {
        fromUserId: "sender-1",
        fromUsername: "",
        messageKind: "text",
        url: "/?chat=sender-1",
      },
    });
  });

  it("keeps sender identity for direct-message push when allowed", () => {
    const payload = buildDirectMessagePushPayload({
      senderUserId: "sender-1",
      senderUsername: "alice",
      hasAttachment: true,
      preferences: {
        directMessagesEnabled: true,
        groupMessagesEnabled: true,
        callInvitesEnabled: true,
        showSender: true,
      },
    });

    expect(payload).toMatchObject({
      title: "@alice",
      body: "@alice sent an encrypted attachment",
      tag: "msg:sender-1",
      data: {
        fromUserId: "sender-1",
        fromUsername: "alice",
        messageKind: "attachment",
        url: "/?chat=sender-1",
      },
    });
  });

  it("suppresses group-message push when group notifications are disabled", () => {
    const payload = buildGroupMessagePushPayload({
      senderUserId: "sender-1",
      senderUsername: "alice",
      groupId: "group-1",
      groupName: "Design team",
      preferences: {
        directMessagesEnabled: true,
        groupMessagesEnabled: false,
        callInvitesEnabled: true,
        showSender: true,
      },
    });

    expect(payload).toBeNull();
  });

  it("builds group-message push with sender privacy applied", () => {
    const payload = buildGroupMessagePushPayload({
      senderUserId: "sender-1",
      senderUsername: "alice",
      groupId: "group-1",
      groupName: "Design team",
      preferences: {
        directMessagesEnabled: true,
        groupMessagesEnabled: true,
        callInvitesEnabled: true,
        showSender: false,
      },
    });

    expect(payload).toMatchObject({
      title: "Design team",
      body: "New encrypted group message",
      tag: "group:group-1",
      data: {
        groupId: "group-1",
        groupName: "Design team",
        fromUserId: "sender-1",
        fromUsername: "",
        url: "/?group=group-1",
      },
    });
  });

  it("suppresses call-invite push when call notifications are disabled", () => {
    const payload = buildCallInvitePushPayload({
      callerUserId: "caller-1",
      callerUsername: "alice",
      callId: "call-1",
      callType: "audio",
      preferences: {
        directMessagesEnabled: true,
        groupMessagesEnabled: true,
        callInvitesEnabled: false,
        showSender: true,
      },
    });

    expect(payload).toBeNull();
  });

  it("builds call-invite push with sender privacy applied", () => {
    const payload = buildCallInvitePushPayload({
      callerUserId: "caller-1",
      callerUsername: "alice",
      callId: "call-1",
      callType: "video",
      preferences: {
        directMessagesEnabled: true,
        groupMessagesEnabled: true,
        callInvitesEnabled: true,
        showSender: false,
      },
    });

    expect(payload).toMatchObject({
      title: "Incoming call",
      body: "Open Seclettr to answer the encrypted call",
      tag: "call:call-1",
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "answer", title: "Answer" },
        { action: "decline", title: "Decline" },
      ],
      data: {
        callId: "call-1",
        callType: "video",
        fromUserId: "caller-1",
        fromUsername: "",
        url: "/?chat=caller-1",
      },
    });
  });
});
