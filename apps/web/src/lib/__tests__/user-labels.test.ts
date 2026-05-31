import { beforeEach, describe, expect, it } from "vitest";
import {
  shouldHydrateUserLabel,
  primeUserLabelCache,
  getCachedUserLabel,
  __userLabelTestUtils,
} from "@/lib/user-labels";

describe("shouldHydrateUserLabel", () => {
  it("requires hydration when the stored label matches the raw user id", () => {
    const userId = "b30a6312-640f-4faf-bca3-dcf6c69555ce";
    expect(shouldHydrateUserLabel(userId, userId)).toBe(true);
  });

  it("requires hydration when the stored label is another uuid-like value", () => {
    expect(
      shouldHydrateUserLabel(
        "0f0f0f0f-640f-4faf-bca3-dcf6c69555ce",
        "b30a6312-640f-4faf-bca3-dcf6c69555ce"
      )
    ).toBe(true);
  });

  it("keeps a real username without forcing a refresh", () => {
    expect(
      shouldHydrateUserLabel(
        "stepan3",
        "b30a6312-640f-4faf-bca3-dcf6c69555ce"
      )
    ).toBe(false);
  });
});

describe("user label cache", () => {
  beforeEach(() => {
    __userLabelTestUtils.reset();
  });

  it("getCachedUserLabel returns null for an unknown userId", () => {
    expect(getCachedUserLabel("unknown-user")).toBeNull();
  });

  it("primeUserLabelCache stores a valid display name", () => {
    primeUserLabelCache("user-1", "alice");
    expect(getCachedUserLabel("user-1")).toBe("alice");
  });

  it("primeUserLabelCache ignores UUID-like labels that require hydration", () => {
    primeUserLabelCache("user-1", "b30a6312-640f-4faf-bca3-dcf6c69555ce");
    expect(getCachedUserLabel("user-1")).toBeNull();
  });

  it("primeUserLabelCache ignores null/empty labels", () => {
    primeUserLabelCache("user-1", null);
    primeUserLabelCache("user-2", "");
    expect(getCachedUserLabel("user-1")).toBeNull();
    expect(getCachedUserLabel("user-2")).toBeNull();
  });

  it("reset clears all cached labels", () => {
    primeUserLabelCache("user-1", "alice");
    primeUserLabelCache("user-2", "bob");
    __userLabelTestUtils.reset();
    expect(getCachedUserLabel("user-1")).toBeNull();
    expect(getCachedUserLabel("user-2")).toBeNull();
  });
});
