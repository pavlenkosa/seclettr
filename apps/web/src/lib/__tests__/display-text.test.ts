import { describe, expect, it } from "vitest";
import { sanitizeDisplayText, sanitizeDisplayTextOrFallback } from "@/lib/display-text";

describe("sanitizeDisplayText", () => {
  it("removes control and bidi override characters", () => {
    expect(sanitizeDisplayText("al\u202Eice\u0007")).toBe("alice");
  });

  it("normalizes compatibility glyphs and collapses whitespace", () => {
    expect(sanitizeDisplayText("  Ａｌｉｃｅ   Bob  ")).toBe("Alice Bob");
  });

  it("returns null for empty or unsafe-only labels", () => {
    expect(sanitizeDisplayText("\u202E \u2066")).toBeNull();
  });
});

describe("sanitizeDisplayTextOrFallback", () => {
  it("uses the fallback when sanitization removes the whole value", () => {
    expect(sanitizeDisplayTextOrFallback("\u202E", "fallback")).toBe("fallback");
  });
});
