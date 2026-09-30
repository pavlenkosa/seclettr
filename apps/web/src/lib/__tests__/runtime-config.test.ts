// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { resolveStunUrls } from "../runtime-config";

describe("runtime-config resolveStunUrls", () => {
  beforeEach(() => {
    window.__SECLETTR_RUNTIME_CONFIG__ = undefined;
  });

  it("accepts stun:, turn: and turns: URLs and drops invalid schemes", () => {
    window.__SECLETTR_RUNTIME_CONFIG__ = {
      stunUrls: [
        "stun:stun.example.com:3478",
        "turn:turn.example.com:3478",
        "turns:turn.example.com:5349",
        "javascript:alert(1)",
        "https://evil.example.com",
      ],
    };

    expect(resolveStunUrls()).toEqual([
      "stun:stun.example.com:3478",
      "turn:turn.example.com:3478",
      "turns:turn.example.com:5349",
    ]);
  });

  it("returns empty array when runtime config has no valid stunUrls", () => {
    window.__SECLETTR_RUNTIME_CONFIG__ = {
      stunUrls: ["http://bad.example.com"],
    };

    expect(resolveStunUrls()).toEqual([]);
  });

  it("returns empty array when runtime config is absent", () => {
    expect(resolveStunUrls()).toEqual([]);
  });
});
