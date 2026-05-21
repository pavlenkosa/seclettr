/**
 * call-media-encryption-negotiation — media encryption mode negotiation for 1:1 calls.
 *
 * Owns:
 *   - Re-exports of protocol encryption types (DirectCallMediaEncryptionMode, Offer, Answer)
 *   - detectLocalDirectCallMediaEncryptionModes — probes local browser capabilities and
 *     the VITE_ENABLE_DIRECT_CALL_FRAME_E2EE env flag to build the supported-modes list
 *   - resolvePreferredDirectCallMediaEncryptionMode — maps callSecurityMode + local
 *     capabilities to the preferred encryption mode for outgoing offers
 *   - buildDirectCallMediaEncryptionOffer — builds the wire offer payload
 *   - negotiateDirectCallMediaEncryptionMode — selects the best common mode from
 *     remote offer + local capabilities (frame-v1 only when both peers prefer it)
 *   - validateDirectCallMediaEncryptionAnswer — validates the callee's answer against
 *     the original offer and confirms the selected mode is a legal common mode
 *   - resolveLegacyDirectCallMediaEncryptionOffer — synthetic offer for peers that
 *     predate the encryption negotiation protocol
 *
 * Does not own frame-crypto key exchange, SDP handling, or any React hooks.
 */
import type {
  CallMediaEncryptionAnswer as ProtocolDirectCallMediaEncryptionAnswer,
  CallMediaEncryptionMode as ProtocolDirectCallMediaEncryptionMode,
  CallMediaEncryptionOffer as ProtocolDirectCallMediaEncryptionOffer,
} from "@seclettr/protocol";
import { supportsEncodedFrameTransforms } from "@/calls/shared/crypto/frame-crypto-capabilities";
import { resolveDirectCallFrameCompatibilityPolicy } from "@/calls/direct/model/direct-call-media-encryption-compatibility";
import type { CallSecurityMode } from "@/ui-settings";

export type DirectCallMediaEncryptionMode = ProtocolDirectCallMediaEncryptionMode;
export type DirectCallMediaEncryptionOffer = ProtocolDirectCallMediaEncryptionOffer;
type DirectCallMediaEncryptionAnswer = ProtocolDirectCallMediaEncryptionAnswer;

const MODE_PRIORITY: readonly DirectCallMediaEncryptionMode[] = ["frame-v1", "transport"];

function sanitizeModes(
  modes: readonly DirectCallMediaEncryptionMode[]
): DirectCallMediaEncryptionMode[] {
  const unique = [...new Set(modes)];
  return unique.filter((mode) => MODE_PRIORITY.includes(mode));
}

function isDirectCallFrameEncryptionEnabled(): boolean {
  const raw = String(import.meta.env["VITE_ENABLE_DIRECT_CALL_FRAME_E2EE"] ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return true;
}

export function detectLocalDirectCallMediaEncryptionModes(): DirectCallMediaEncryptionMode[] {
  const modes: DirectCallMediaEncryptionMode[] = ["transport"];
  const frameCompatibilityPolicy = resolveDirectCallFrameCompatibilityPolicy();
  if (
    isDirectCallFrameEncryptionEnabled() &&
    frameCompatibilityPolicy.allowFrameMode &&
    supportsEncodedFrameTransforms()
  ) {
    modes.unshift("frame-v1");
  }
  return sanitizeModes(modes);
}

export function resolvePreferredDirectCallMediaEncryptionMode(
  callSecurityMode: CallSecurityMode,
  localSupportedModes: readonly DirectCallMediaEncryptionMode[]
): DirectCallMediaEncryptionMode {
  const normalized = sanitizeModes(localSupportedModes);
  if ((callSecurityMode === "balanced" || callSecurityMode === "strict") && normalized.includes("frame-v1")) {
    return "frame-v1";
  }
  return "transport";
}

export function buildDirectCallMediaEncryptionOffer(
  callSecurityMode: CallSecurityMode,
  localSupportedModes: readonly DirectCallMediaEncryptionMode[]
): DirectCallMediaEncryptionOffer {
  const supportedModes = sanitizeModes(localSupportedModes);
  return {
    preferredMode: resolvePreferredDirectCallMediaEncryptionMode(callSecurityMode, supportedModes),
    supportedModes,
  };
}

export function negotiateDirectCallMediaEncryptionMode(
  offer: DirectCallMediaEncryptionOffer,
  localSupportedModes: readonly DirectCallMediaEncryptionMode[],
  options?: {
    localPreferredMode?: DirectCallMediaEncryptionMode;
  }
): DirectCallMediaEncryptionMode | null {
  const remoteSupported = sanitizeModes(offer.supportedModes);
  const localSupported = sanitizeModes(localSupportedModes);
  const commonModes = MODE_PRIORITY.filter(
    (mode) => remoteSupported.includes(mode) && localSupported.includes(mode)
  );
  if (commonModes.length === 0) return null;

  const localPreferredMode =
    options?.localPreferredMode && localSupported.includes(options.localPreferredMode)
      ? options.localPreferredMode
      : resolvePreferredDirectCallMediaEncryptionMode("compatibility", localSupported);

  // Frame mode is selected only when both peers explicitly prefer it; otherwise
  // we choose transport for maximum interop and deterministic downgrade behavior.
  const preferenceOrder: DirectCallMediaEncryptionMode[] =
    offer.preferredMode === "frame-v1" && localPreferredMode === "frame-v1"
      ? ["frame-v1", "transport"]
      : ["transport", "frame-v1"];

  return preferenceOrder.find((mode) => commonModes.includes(mode)) ?? commonModes[0] ?? null;
}

export function validateDirectCallMediaEncryptionAnswer(
  offer: DirectCallMediaEncryptionOffer,
  answer: DirectCallMediaEncryptionAnswer
): DirectCallMediaEncryptionMode | null {
  const remoteSupported = sanitizeModes(answer.supportedModes);
  if (!remoteSupported.includes(answer.selectedMode)) {
    return null;
  }

  // The callee is authoritative for the initial answer. We validate that its
  // selected mode is a legal common mode instead of re-imposing the caller's
  // original preference, so balanced callers accept compatibility downgrades.
  const acceptedMode = negotiateDirectCallMediaEncryptionMode(
    offer,
    remoteSupported,
    { localPreferredMode: answer.selectedMode }
  );

  return acceptedMode === answer.selectedMode ? acceptedMode : null;
}

export function resolveLegacyDirectCallMediaEncryptionOffer(): DirectCallMediaEncryptionOffer {
  return {
    preferredMode: "transport",
    supportedModes: ["transport"],
  };
}
