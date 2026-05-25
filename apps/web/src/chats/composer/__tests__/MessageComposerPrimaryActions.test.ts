import { describe, expect, it } from "vitest";
import { resolvePrimaryComposerAction } from "../MessageComposerPrimaryActions";

describe("resolvePrimaryComposerAction", () => {
  it("uses send mode when text exists", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "hello",
      isFocused: false,
      preferredRecordMode: "voice",
    })).toEqual({ kind: "send" });
  });

  it("uses send mode while textarea is focused even without text", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "",
      isFocused: true,
      preferredRecordMode: "video",
    })).toEqual({ kind: "send" });
  });

  it("uses preferred record mode when composer is idle (direct chat)", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "",
      isFocused: false,
      preferredRecordMode: "video",
    })).toEqual({ kind: "record", mode: "video" });
  });

  it("uses preferred record mode when composer is idle (group)", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "",
      isFocused: false,
      preferredRecordMode: "voice",
    })).toEqual({ kind: "record", mode: "voice" });
  });
});
