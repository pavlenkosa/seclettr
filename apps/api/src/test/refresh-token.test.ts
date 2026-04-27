import { describe, expect, it } from "vitest";
import { buildRefreshToken, parseRefreshToken } from "../utils/refresh-token.js";

describe("refresh token format", () => {
  it("builds and parses v1 refresh token", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const secret = "secret_token_123";

    const token = buildRefreshToken(sessionId, secret);
    const parsed = parseRefreshToken(token);

    expect(parsed).toEqual({ sessionId, secret });
  });

  it("returns null for legacy opaque token", () => {
    expect(parseRefreshToken("legacyOpaqueTokenWithoutSelector")).toBeNull();
  });

  it("returns null for malformed v1 token", () => {
    expect(parseRefreshToken("v1.not-a-uuid.secret")).toBeNull();
    expect(parseRefreshToken("v1.11111111-1111-4111-8111-111111111111")).toBeNull();
  });
});
