import { describe, expect, it } from "vitest";
import { createRequestSequence } from "@/lib/request-sequence";

describe("request-sequence", () => {
  it("marks the latest started request as current", () => {
    const sequence = createRequestSequence();

    const token = sequence.begin();

    expect(sequence.isCurrent(token)).toBe(true);
  });

  it("invalidates older requests when a newer one starts", () => {
    const sequence = createRequestSequence();

    const first = sequence.begin();
    const second = sequence.begin();

    expect(sequence.isCurrent(first)).toBe(false);
    expect(sequence.isCurrent(second)).toBe(true);
  });

  it("invalidates the active request when explicitly reset", () => {
    const sequence = createRequestSequence();

    const active = sequence.begin();
    sequence.invalidate();

    expect(sequence.isCurrent(active)).toBe(false);
  });
});
