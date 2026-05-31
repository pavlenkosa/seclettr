import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  searchUsers,
  getUserContactGrantHeaders,
  __userSearchTestUtils,
} from "@/lib/user-search";

const { apiGetMock } = vi.hoisted(() => ({ apiGetMock: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
  },
}));

describe("user-search contact grant cache", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    __userSearchTestUtils.reset();
    vi.useRealTimers();
  });

  it("stores short-lived contact grants from exact-match search results", async () => {
    apiGetMock.mockResolvedValue({
      users: [
        {
          userId: "11111111-1111-4111-8111-111111111111",
          username: "alice_test",
          contactGrant: "g".repeat(64),
          contactGrantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });

    const results = await searchUsers("alice_test");

    expect(results).toHaveLength(1);
    expect(getUserContactGrantHeaders(results[0]!.userId)).toEqual({
      "X-Seclettr-Contact-Grant": "g".repeat(64),
    });
  });

  it("does not hit the API for queries shorter than the minimum length", async () => {
    const results = await searchUsers("ab");

    expect(results).toEqual([]);
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("drops expired contact grants from the header cache", async () => {
    vi.useFakeTimers();
    apiGetMock.mockResolvedValue({
      users: [
        {
          userId: "11111111-1111-4111-8111-111111111111",
          username: "alice_test",
          contactGrant: "h".repeat(64),
          contactGrantExpiresAt: new Date(Date.now() + 1_000).toISOString(),
        },
      ],
    });

    await searchUsers("alice_test");
    vi.advanceTimersByTime(1_500);

    expect(
      getUserContactGrantHeaders("11111111-1111-4111-8111-111111111111")
    ).toBeUndefined();
    vi.useRealTimers();
  });
});
