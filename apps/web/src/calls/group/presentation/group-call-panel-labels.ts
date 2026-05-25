/**
 * group-call-panel-labels — localised label resolver functions for the group call panel.
 *
 * Owns:
 *   - resolveStatusLabel — maps lifecycle state + call status + error to a status bar label
 *   - resolveHeroStatusLabel — selects the hero banner label based on access and lifecycle state
 *   - resolveHeroStatusTone — maps lifecycle state to a StatusBadgeTone for the hero badge
 *   - resolveLocalVideoStatusLabel — label describing local video / screen-share state transitions
 *   - resolveMediaKeyModeLabel — label for the current media encryption mode
 *   - resolveMediaKeyStatusLabel — detailed label describing E2EE key exchange progress
 *
 * Does not own tile construction, layout logic, or any state. All functions are pure
 * label resolvers that accept runtime state and return translated strings.
 */
import type { LocalGroupCallMediaKey } from "@/calls/group/runtime/media-key/media-key";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import { type StatusBadgeTone } from "@/components/ui";
import {
  isGroupCallConnectedLifecycleState,
  type GroupCallLifecycleState,
} from "@/calls/group/model/group-call-lifecycle";
import type { GroupCallStatus } from "@/calls/group/model/group-call-types";
import type { useI18n } from "@/i18n";

type Translate = ReturnType<typeof useI18n>["t"];

export function resolveStatusLabel(
  lifecycleState: GroupCallLifecycleState,
  status: GroupCallStatus,
  error: string | null,
  t: Translate
): string {
  if (lifecycleState === "leaving") {
    return status === "ending" ? t("group.call.ending") : t("group.call.leaving");
  }
  if (lifecycleState === "failed") return error ?? t("group.call.error.startFailed");
  if (lifecycleState === "reconnecting") return t("group.call.reconnecting");
  if (lifecycleState === "room_idle" || lifecycleState === "joining") return t("group.call.starting");
  return t("group.call.ready");
}

export function resolveHeroStatusLabel(
  accessGranted: boolean,
  lifecycleState: GroupCallLifecycleState,
  status: GroupCallStatus,
  statusLabel: string,
  t: Translate
): string {
  if (lifecycleState === "failed" || status === "ending") {
    return statusLabel;
  }

  if (lifecycleState === "reconnecting") {
    return t("group.call.reconnecting");
  }

  return accessGranted
    ? t("group.call.accessReady")
    : t("group.call.accessPending");
}

export function resolveHeroStatusTone(lifecycleState: GroupCallLifecycleState): StatusBadgeTone {
  if (lifecycleState === "failed") {
    return "danger";
  }

  return isGroupCallConnectedLifecycleState(lifecycleState)
    ? "success"
    : "warning";
}

export function resolveLocalVideoStatusLabel(
  isVideoSwitching: boolean,
  isScreenSwitching: boolean,
  isLocalScreenSharing: boolean,
  isLocalVideoEnabled: boolean,
  t: Translate
): string {
  if (isVideoSwitching) return t("group.call.videoStarting");
  if (isScreenSwitching) return t("group.call.screenStarting");
  if (isLocalScreenSharing) return t("group.call.screenSharing");
  return isLocalVideoEnabled
    ? t("group.call.videoOn")
    : t("group.call.audioOnly");
}

export function resolveMediaKeyModeLabel(
  effectiveMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode,
  t: Translate
): string {
  if (effectiveMediaEncryptionMode === "required") return t("settings.callSecurity.strict");
  if (effectiveMediaEncryptionMode === "best-effort") return t("settings.callSecurity.balanced");
  return t("settings.callSecurity.compatibility");
}

export function resolveMediaKeyStatusLabel(
  effectiveFrameEncryptionEnabled: boolean,
  localMediaKey: LocalGroupCallMediaKey | null,
  receivedMediaKeyCount: number,
  sharedMediaKeyDeviceCount: number,
  t: Translate
): string {
  if (!effectiveFrameEncryptionEnabled) return t("group.call.mediaKeyDisabled");
  if (!localMediaKey) return t("group.call.mediaKeyPending");
  return receivedMediaKeyCount > 0 || sharedMediaKeyDeviceCount > 0
    ? t("group.call.mediaKeyReady")
    : t("group.call.mediaKeyPending");
}
