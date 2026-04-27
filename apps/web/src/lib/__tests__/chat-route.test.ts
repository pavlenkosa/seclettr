import { describe, expect, it } from "vitest";
import {
  buildSearchWithConversation,
  buildSearchWithGroup,
  getConversationIdFromSearch,
  getGroupIdFromSearch,
} from "@/lib/chat-route";

describe("chat-route helpers", () => {
  it("extracts conversation id from search", () => {
    expect(getConversationIdFromSearch("?chat=alice")).toBe("alice");
    expect(getConversationIdFromSearch("chat=bob")).toBe("bob");
  });

  it("returns null when chat query param is missing or blank", () => {
    expect(getConversationIdFromSearch("")).toBeNull();
    expect(getConversationIdFromSearch("?foo=bar")).toBeNull();
    expect(getConversationIdFromSearch("?chat=%20%20")).toBeNull();
  });

  it("extracts group id from search", () => {
    expect(getGroupIdFromSearch("?group=room-1")).toBe("room-1");
    expect(getGroupIdFromSearch("group=room-2")).toBe("room-2");
  });

  it("returns null when group query param is missing or blank", () => {
    expect(getGroupIdFromSearch("")).toBeNull();
    expect(getGroupIdFromSearch("?foo=bar")).toBeNull();
    expect(getGroupIdFromSearch("?group=%20%20")).toBeNull();
  });

  it("adds or replaces chat query param", () => {
    expect(buildSearchWithConversation("", "alice")).toBe("?chat=alice");
    expect(buildSearchWithConversation("?foo=1", "alice")).toBe("?foo=1&chat=alice");
    expect(buildSearchWithConversation("?chat=bob&foo=1", "alice")).toBe("?chat=alice&foo=1");
    expect(buildSearchWithConversation("?group=room-1&foo=1", "alice")).toBe("?foo=1&chat=alice");
  });

  it("removes chat query param while preserving others", () => {
    expect(buildSearchWithConversation("?chat=alice", null)).toBe("");
    expect(buildSearchWithConversation("?foo=1&chat=alice&bar=2", null)).toBe("?foo=1&bar=2");
  });

  it("adds or replaces group query param", () => {
    expect(buildSearchWithGroup("", "room-1")).toBe("?group=room-1");
    expect(buildSearchWithGroup("?foo=1", "room-1")).toBe("?foo=1&group=room-1");
    expect(buildSearchWithGroup("?group=room-old&foo=1", "room-1")).toBe("?group=room-1&foo=1");
    expect(buildSearchWithGroup("?chat=alice&foo=1", "room-1")).toBe("?foo=1&group=room-1");
  });

  it("removes group query param while preserving others", () => {
    expect(buildSearchWithGroup("?group=room-1", null)).toBe("");
    expect(buildSearchWithGroup("?foo=1&group=room-1&bar=2", null)).toBe("?foo=1&bar=2");
  });
});
