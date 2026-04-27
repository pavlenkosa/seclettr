import type { GroupCallMediaEncryptionMode as ProtocolGroupCallMediaEncryptionMode } from "@seclettr/protocol";
import { supportsEncodedFrameTransforms } from "@/calls/shared/crypto/frame-crypto-capabilities";
import type { CallSecurityMode } from "@/ui-settings";

export type GroupCallRuntimeMediaEncryptionMode = ProtocolGroupCallMediaEncryptionMode;

export interface LocalGroupCallMediaEncryptionDecision {
  requestedMode: GroupCallRuntimeMediaEncryptionMode;
  advertisedMode: GroupCallRuntimeMediaEncryptionMode;
  frameEncryptionSupported: boolean;
  strictUnsupported: boolean;
}

const MODE_PRIORITY: Record<GroupCallRuntimeMediaEncryptionMode, number> = {
  off: 0,
  "best-effort": 1,
  required: 2,
};

const REQUESTED_MODE_BY_SECURITY_MODE: Record<CallSecurityMode, GroupCallRuntimeMediaEncryptionMode> = {
  compatibility: "off",
  balanced: "best-effort",
  strict: "required",
};

function isGroupCallRuntimeMediaEncryptionMode(
  value: string
): value is GroupCallRuntimeMediaEncryptionMode {
  return value === "off" || value === "best-effort" || value === "required";
}

export const supportsInsertableStreams = supportsEncodedFrameTransforms;

export function resolveLocalGroupCallMediaEncryptionDecision(
  callSecurityMode: CallSecurityMode
): LocalGroupCallMediaEncryptionDecision {
  const requestedMode = REQUESTED_MODE_BY_SECURITY_MODE[callSecurityMode];
  const frameEncryptionSupported = supportsInsertableStreams();
  const strictRequested = requestedMode === "required";

  // Group-call frame E2EE is not production-stable yet. Keep balanced mode on
  // transport encryption and reserve frame-level encryption for explicit strict mode.
  return {
    requestedMode,
    advertisedMode: strictRequested && frameEncryptionSupported ? "required" : "off",
    frameEncryptionSupported,
    strictUnsupported: strictRequested && !frameEncryptionSupported,
  };
}

export function normalizeGroupCallRuntimeMediaEncryptionMode(
  value: string | null | undefined
): GroupCallRuntimeMediaEncryptionMode | null {
  if (!value) return null;
  return isGroupCallRuntimeMediaEncryptionMode(value) ? value : null;
}

export function resolveMostCompatibleGroupMediaEncryptionMode(
  localPreferredMode: GroupCallRuntimeMediaEncryptionMode,
  remoteModes: readonly (GroupCallRuntimeMediaEncryptionMode | null | undefined)[]
): GroupCallRuntimeMediaEncryptionMode {
  let effectiveMode = localPreferredMode;
  for (const remoteMode of remoteModes) {
    if (!remoteMode) continue;
    if (MODE_PRIORITY[remoteMode] < MODE_PRIORITY[effectiveMode]) {
      effectiveMode = remoteMode;
    }
  }
  return effectiveMode;
}

export function resolveEffectiveGroupMediaEncryptionMode(
  localMode: GroupCallRuntimeMediaEncryptionMode,
  remoteModes: readonly (GroupCallRuntimeMediaEncryptionMode | null | undefined)[],
  options?: {
    treatUnknownRemoteAsOff?: boolean;
  }
): GroupCallRuntimeMediaEncryptionMode {
  const shouldTreatUnknownRemoteAsOff =
    options?.treatUnknownRemoteAsOff &&
    remoteModes.some((remoteMode) => !remoteMode);
  if (shouldTreatUnknownRemoteAsOff) {
    return resolveMostCompatibleGroupMediaEncryptionMode(localMode, ["off"]);
  }

  return resolveMostCompatibleGroupMediaEncryptionMode(localMode, remoteModes);
}

export function isGroupMediaModeDowngraded(
  localPreferredMode: GroupCallRuntimeMediaEncryptionMode,
  effectiveMode: GroupCallRuntimeMediaEncryptionMode
): boolean {
  return MODE_PRIORITY[effectiveMode] < MODE_PRIORITY[localPreferredMode];
}

export function shouldArmLocalGroupCallFrameEncryption(options: {
  requestedMode: GroupCallRuntimeMediaEncryptionMode;
  effectiveFrameEncryptionEnabled: boolean;
  expectedRemoteDeviceCount: number;
  acknowledgedExpectedRemoteDeviceCount: number;
}): boolean {
  if (!options.effectiveFrameEncryptionEnabled) {
    return false;
  }

  if (options.requestedMode === "required") {
    return true;
  }

  if (options.expectedRemoteDeviceCount === 0) {
    return false;
  }

  return options.acknowledgedExpectedRemoteDeviceCount >= options.expectedRemoteDeviceCount;
}
