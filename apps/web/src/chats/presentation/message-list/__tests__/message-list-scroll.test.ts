import { describe, expect, it } from "vitest";
import { getMessageListAutoScrollBehavior } from "../message-list-scroll";

describe("getMessageListAutoScrollBehavior", () => {
  it("uses auto scroll for the first rendered batch", () => {
    expect(
      getMessageListAutoScrollBehavior({
        previousMessageCount: 0,
        nextMessageCount: 8,
        distanceFromBottomPx: 320,
      })
    ).toBe("auto");
  });

  it("uses smooth scroll when the user stays near the bottom", () => {
    expect(
      getMessageListAutoScrollBehavior({
        previousMessageCount: 8,
        nextMessageCount: 9,
        distanceFromBottomPx: 42,
      })
    ).toBe("smooth");
  });

  it("falls back to auto scroll when reduced motion is preferred", () => {
    expect(
      getMessageListAutoScrollBehavior({
        previousMessageCount: 8,
        nextMessageCount: 9,
        distanceFromBottomPx: 42,
        prefersReducedMotion: true,
      })
    ).toBe("auto");
  });

  it("forces a scroll for locally-sent messages even while reading older history", () => {
    expect(
      getMessageListAutoScrollBehavior({
        previousMessageCount: 8,
        nextMessageCount: 9,
        distanceFromBottomPx: 220,
        forceScroll: true,
      })
    ).toBe("smooth");
  });

  it("does not auto-scroll when the user is reading older messages", () => {
    expect(
      getMessageListAutoScrollBehavior({
        previousMessageCount: 8,
        nextMessageCount: 9,
        distanceFromBottomPx: 220,
      })
    ).toBeNull();
  });
});
