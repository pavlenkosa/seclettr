import { describe, expect, it } from "vitest";
import { resolveInboundOfferPolicy } from "@/calls/direct/model/call-inbound-offer-policy";

describe("resolveInboundOfferPolicy", () => {
  // ── "invalid" — auth present but broken ──────────────────────────��────────

  it("rejects invalid auth in strict mode", () => {
    const result = resolveInboundOfferPolicy("invalid", "strict");
    expect(result.allow).toBe(false);
  });

  it("rejects invalid auth in balanced mode", () => {
    const result = resolveInboundOfferPolicy("invalid", "balanced");
    expect(result.allow).toBe(false);
  });

  it("rejects invalid auth in compatibility mode", () => {
    const result = resolveInboundOfferPolicy("invalid", "compatibility");
    expect(result.allow).toBe(false);
  });

  it("returns the expected i18n key for invalid auth", () => {
    const result = resolveInboundOfferPolicy("invalid", "balanced");
    expect(result.allow).toBe(false);
    if (!result.allow) {
      expect(result.reasonKey).toBe("call.error.unableVerifyCode");
    }
  });

  // ── "unverified" — auth absent / legacy client ────────────────────────────

  it("rejects unverified auth in strict mode", () => {
    const result = resolveInboundOfferPolicy("unverified", "strict");
    expect(result.allow).toBe(false);
  });

  it("allows unverified auth in balanced mode with degraded flag", () => {
    const result = resolveInboundOfferPolicy("unverified", "balanced");
    expect(result.allow).toBe(true);
    if (result.allow) {
      expect(result.degraded).toBe(true);
    }
  });

  it("allows unverified auth in compatibility mode with degraded flag", () => {
    const result = resolveInboundOfferPolicy("unverified", "compatibility");
    expect(result.allow).toBe(true);
    if (result.allow) {
      expect(result.degraded).toBe(true);
    }
  });

  // ── "verified" — signature checks out ─────────────────────────────────────

  it("allows verified auth in strict mode without degraded flag", () => {
    const result = resolveInboundOfferPolicy("verified", "strict");
    expect(result.allow).toBe(true);
    if (result.allow) {
      expect(result.degraded).toBe(false);
    }
  });

  it("allows verified auth in balanced mode without degraded flag", () => {
    const result = resolveInboundOfferPolicy("verified", "balanced");
    expect(result.allow).toBe(true);
    if (result.allow) {
      expect(result.degraded).toBe(false);
    }
  });

  it("allows verified auth in compatibility mode without degraded flag", () => {
    const result = resolveInboundOfferPolicy("verified", "compatibility");
    expect(result.allow).toBe(true);
    if (result.allow) {
      expect(result.degraded).toBe(false);
    }
  });
});
