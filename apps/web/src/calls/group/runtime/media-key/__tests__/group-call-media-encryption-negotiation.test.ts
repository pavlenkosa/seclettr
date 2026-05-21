import { describe, expect, it } from "vitest";
import {
  isGroupMediaModeDowngraded,
  normalizeGroupCallRuntimeMediaEncryptionMode,
  resolveEffectiveGroupMediaEncryptionMode,
  resolveLocalGroupCallMediaEncryptionDecision,
  resolveMostCompatibleGroupMediaEncryptionMode,
  shouldArmLocalGroupCallFrameEncryption,
  supportsInsertableStreams,
} from "@/calls/group/runtime/media-key/media-encryption-negotiation";

describe("group-call-media-encryption-negotiation", () => {
  it("picks off mode when at least one participant can only do transport", () => {
    const effective = resolveMostCompatibleGroupMediaEncryptionMode("required", [
      "required",
      "best-effort",
      "off",
    ]);
    expect(effective).toBe("off");
  });

  it("keeps required only when every participant is required-capable", () => {
    const effective = resolveMostCompatibleGroupMediaEncryptionMode("required", [
      "required",
      "required",
    ]);
    expect(effective).toBe("required");
  });

  it("downgrades required to best-effort when remote policy is balanced", () => {
    const effective = resolveMostCompatibleGroupMediaEncryptionMode("required", [
      "best-effort",
      "required",
    ]);
    expect(effective).toBe("best-effort");
  });

  it("normalizes runtime mode strings", () => {
    expect(normalizeGroupCallRuntimeMediaEncryptionMode("off")).toBe("off");
    expect(normalizeGroupCallRuntimeMediaEncryptionMode("best-effort")).toBe("best-effort");
    expect(normalizeGroupCallRuntimeMediaEncryptionMode("required")).toBe("required");
    expect(normalizeGroupCallRuntimeMediaEncryptionMode("invalid")).toBeNull();
  });

  it("reports downgrade only when effective mode is lower", () => {
    expect(isGroupMediaModeDowngraded("required", "best-effort")).toBe(true);
    expect(isGroupMediaModeDowngraded("best-effort", "off")).toBe(true);
    expect(isGroupMediaModeDowngraded("best-effort", "best-effort")).toBe(false);
  });

  it("treats unknown remote capabilities as transport in balanced mode when requested", () => {
    const effective = resolveEffectiveGroupMediaEncryptionMode(
      "best-effort",
      ["best-effort", null],
      { treatUnknownRemoteAsOff: true }
    );
    expect(effective).toBe("off");
  });

  it("keeps best-effort when all remote capabilities are known and compatible", () => {
    const effective = resolveEffectiveGroupMediaEncryptionMode(
      "best-effort",
      ["best-effort", "best-effort"],
      { treatUnknownRemoteAsOff: true }
    );
    expect(effective).toBe("best-effort");
  });

  it("advertises transport when balanced mode runs on a browser without frame crypto support", () => {
    const decision = resolveLocalGroupCallMediaEncryptionDecision("balanced");
    expect(decision.requestedMode).toBe("best-effort");
    expect(decision.advertisedMode).toBe("off");
    expect(decision.strictUnsupported).toBe(false);
  });

  it("flags strict mode as unsupported on browsers without frame crypto support", () => {
    const decision = resolveLocalGroupCallMediaEncryptionDecision("strict");
    if (supportsInsertableStreams()) {
      expect(decision.advertisedMode).toBe("required");
      expect(decision.strictUnsupported).toBe(false);
    } else {
      expect(decision.advertisedMode).toBe("off");
      expect(decision.strictUnsupported).toBe(true);
    }
  });

  it("keeps balanced mode on transport until every active remote device acknowledged the media key", () => {
    expect(shouldArmLocalGroupCallFrameEncryption({
      requestedMode: "best-effort",
      effectiveFrameEncryptionEnabled: true,
      expectedRemoteDeviceCount: 1,
      acknowledgedExpectedRemoteDeviceCount: 0,
    })).toBe(false);

    expect(shouldArmLocalGroupCallFrameEncryption({
      requestedMode: "best-effort",
      effectiveFrameEncryptionEnabled: true,
      expectedRemoteDeviceCount: 2,
      acknowledgedExpectedRemoteDeviceCount: 1,
    })).toBe(false);

    expect(shouldArmLocalGroupCallFrameEncryption({
      requestedMode: "best-effort",
      effectiveFrameEncryptionEnabled: true,
      expectedRemoteDeviceCount: 2,
      acknowledgedExpectedRemoteDeviceCount: 2,
    })).toBe(true);
  });

  it("still arms strict mode immediately when frame encryption is required", () => {
    expect(shouldArmLocalGroupCallFrameEncryption({
      requestedMode: "required",
      effectiveFrameEncryptionEnabled: true,
      expectedRemoteDeviceCount: 1,
      acknowledgedExpectedRemoteDeviceCount: 0,
    })).toBe(true);
  });
});
