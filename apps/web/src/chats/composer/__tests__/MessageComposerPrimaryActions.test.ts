import { describe, expect, it } from "vitest";
import { resolvePrimaryComposerAction } from "../MessageComposerPrimaryActions";

describe("resolvePrimaryComposerAction", () => {
  it("uses send mode when text exists", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "hello",
      isFocused: false,
      isGroupComposer: false,
      preferredRecordMode: "voice",
    })).toEqual({ kind: "send" });
  });

  it("uses send mode while textarea is focused even without text", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "",
      isFocused: true,
      isGroupComposer: false,
      preferredRecordMode: "video",
    })).toEqual({ kind: "send" });
  });

  it("uses send mode for group composer", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "",
      isFocused: false,
      isGroupComposer: true,
      preferredRecordMode: "voice",
    })).toEqual({ kind: "send" });
  });

  it("uses preferred record mode when direct composer is idle", () => {
    expect(resolvePrimaryComposerAction({
      trimmedText: "",
      isFocused: false,
      isGroupComposer: false,
      preferredRecordMode: "video",
    })).toEqual({ kind: "record", mode: "video" });
  });
});
