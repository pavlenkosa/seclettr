import { describe, expect, it, vi } from "vitest";
import {
  MAX_MESSAGES_PER_CONVERSATION,
  trimMessagesToCap,
} from "@/stores/messages/conversation-persistence";
import { replaceOrAppendMessage } from "@/stores/messages/messages-inbound-conversation-runtime";
import type { Message } from "@/stores/messages/types";

vi.mock("@/lib/user-labels", () => ({
  getCachedUserLabel: vi.fn(() => null),
  primeUserLabelCache: vi.fn(),
  shouldHydrateUserLabel: vi.fn(() => false),
}));

function buildMessage(id: string): Message {
  return {
    id,
    conversationId: "peer-1",
    senderId: "peer-1",
    body: `body-${id}`,
    timestamp: Number(id),
    isOwn: false,
    status: "delivered",
  } as unknown as Message;
}

describe("per-conversation message cap", () => {
  it("keeps newest messages when array exceeds MAX_MESSAGES_PER_CONVERSATION", () => {
    const overCap = Array.from(
      { length: MAX_MESSAGES_PER_CONVERSATION + 5 },
      (_, i) => buildMessage(String(i))
    );

    const trimmed = trimMessagesToCap(overCap);

    expect(trimmed).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    expect(trimmed[0]!.id).toBe("5"); // oldest 5 dropped (head trim)
    expect(trimmed.at(-1)!.id).toBe(String(MAX_MESSAGES_PER_CONVERSATION + 4)); // newest kept
  });

  it("does not trim arrays at or below the cap", () => {
    const atCap = Array.from(
      { length: MAX_MESSAGES_PER_CONVERSATION },
      (_, i) => buildMessage(String(i))
    );

    const trimmed = trimMessagesToCap(atCap);

    expect(trimmed).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    expect(trimmed[0]!.id).toBe("0");
  });

  it("replaceOrAppendMessage append path trims to cap keeping newest", () => {
    let messages = Array.from(
      { length: MAX_MESSAGES_PER_CONVERSATION },
      (_, i) => buildMessage(String(i))
    );

    const newestId = String(MAX_MESSAGES_PER_CONVERSATION);
    const result = replaceOrAppendMessage(
      messages,
      newestId,
      buildMessage(newestId)
    );

    messages = result.messages;
    expect(messages).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    expect(messages.at(-1)!.id).toBe(newestId); // newest appended message kept
    expect(messages[0]!.id).toBe("1"); // head (id 0) dropped
  });
});
