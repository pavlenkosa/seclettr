import { beforeEach, describe, expect, it } from "vitest";
import { __errorReporterTestUtils } from "@/lib/error-reporter";

const { redactText, sanitizePathname, reset } = __errorReporterTestUtils;

describe("error-reporter redactText", () => {
  it("redacts Bearer tokens", () => {
    const result = redactText("request failed with Bearer abc123XYZ.def456UVW");
    expect(result).toContain("Bearer [REDACTED]");
    expect(result).not.toContain("abc123XYZ");
  });

  it("redacts JWT-shaped strings (three base64url segments)", () => {
    const jwt = "a".repeat(21) + "." + "b".repeat(21) + "." + "c".repeat(21);
    expect(redactText(jwt)).toContain("[REDACTED_JWT]");
  });

  it("redacts token query parameters", () => {
    const result = redactText("?access_token=supersecret&refresh_token=abc");
    expect(result).toContain("access_token=[REDACTED]");
    expect(result).toContain("refresh_token=[REDACTED]");
  });

  it("normalises runs of whitespace to a single space", () => {
    expect(redactText("hello   world\t\tnow")).toBe("hello world now");
  });

  it("truncates output to the given maxLength", () => {
    const long = "x".repeat(300);
    const result = redactText(long, 50);
    expect(result).toHaveLength(50);
  });

  it("preserves safe plain text unchanged", () => {
    expect(redactText("TypeError: cannot read property foo of null")).toBe(
      "TypeError: cannot read property foo of null"
    );
  });
});

describe("error-reporter sanitizePathname", () => {
  it("replaces UUID path segments with :id", () => {
    const result = sanitizePathname(
      "/api/users/b30a6312-640f-4faf-bca3-dcf6c69555ce/profile"
    );
    expect(result).toBe("/api/users/:id/profile");
  });

  it("replaces long opaque path segments with :id", () => {
    const result = sanitizePathname("/files/" + "a".repeat(25) + "/download");
    expect(result).toBe("/files/:id/download");
  });

  it("preserves short non-id path segments", () => {
    expect(sanitizePathname("/api/users/me")).toBe("/api/users/me");
  });

  it("preserves the root path", () => {
    expect(sanitizePathname("/")).toBe("/");
  });

  it("handles multiple id segments in one path", () => {
    const uuid1 = "aaaaaaaa-bbbb-4bbb-8bbb-cccccccccccc";
    const uuid2 = "dddddddd-eeee-4eee-8eee-ffffffffffff";
    expect(sanitizePathname(`/rooms/${uuid1}/members/${uuid2}`)).toBe(
      "/rooms/:id/members/:id"
    );
  });
});

describe("error-reporter reset", () => {
  beforeEach(() => {
    reset();
  });

  it("reset is safe to call on empty state", () => {
    expect(() => reset()).not.toThrow();
  });

  it("reset is idempotent across multiple calls", () => {
    expect(() => {
      reset();
      reset();
      reset();
    }).not.toThrow();
  });
});
