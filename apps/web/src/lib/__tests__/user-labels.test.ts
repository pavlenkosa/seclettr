import { describe, expect, it } from "vitest";
import { shouldHydrateUserLabel } from "@/lib/user-labels";

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
