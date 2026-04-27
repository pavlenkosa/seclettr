import { describe, expect, it } from "vitest";
import {
  isStaleRenegotiationRevision,
  resolveDirectCallNegotiationRole,
  shouldIgnoreIncomingRenegotiationOffer,
} from "@/calls/direct/model/direct-call-lifecycle";

describe("call perfect negotiation helpers", () => {
  it("resolves polite/impolite role from call direction", () => {
    expect(resolveDirectCallNegotiationRole("inbound")).toBe("polite");
    expect(resolveDirectCallNegotiationRole("outbound")).toBe("impolite");
  });

  it("detects stale renegotiation revisions", () => {
    expect(isStaleRenegotiationRevision(0, 1)).toBe(false);
    expect(isStaleRenegotiationRevision(2, 2)).toBe(true);
    expect(isStaleRenegotiationRevision(3, 1)).toBe(true);
  });

  it("ignores colliding renegotiation offers only for the impolite peer", () => {
    expect(shouldIgnoreIncomingRenegotiationOffer({
      role: "impolite",
      makingOffer: true,
      signalingState: "have-local-offer",
      isSettingRemoteAnswerPending: false,
    })).toBe(true);

    expect(shouldIgnoreIncomingRenegotiationOffer({
      role: "polite",
      makingOffer: true,
      signalingState: "have-local-offer",
      isSettingRemoteAnswerPending: false,
    })).toBe(false);

    expect(shouldIgnoreIncomingRenegotiationOffer({
      role: "impolite",
      makingOffer: false,
      signalingState: "stable",
      isSettingRemoteAnswerPending: false,
    })).toBe(false);
  });
});
