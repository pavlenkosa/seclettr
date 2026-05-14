import type { PeerIdentityAlert } from "@/stores/messages";
import type { useSecurityModalLogic } from "./useSecurityModalLogic";

export type SecurityTranslate = (
  key: string,
  params?: Record<string, string | number>
) => string;

export type SecurityModalLogicState = ReturnType<typeof useSecurityModalLogic>;
export type StatusBadgeTone = "success" | "warning" | "danger";

export function formatDeviceLabel(deviceId: string): string {
  if (deviceId.length <= 14) return deviceId;
  return `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}`;
}

export function getStatusBadgeTone(
  effectivePeerIdentityAlert: PeerIdentityAlert | null | undefined,
  verifiedAt: string | null
): StatusBadgeTone {
  if (effectivePeerIdentityAlert) return "danger";
  return verifiedAt ? "success" : "warning";
}

export function getVerificationStatus(params: {
  readonly effectivePeerIdentityAlert?: PeerIdentityAlert | null;
  readonly effectivePeerIdentityKey?: string;
  readonly locale: string;
  readonly requiresExplicitPeerDeviceSelection: boolean;
  readonly t: SecurityTranslate;
  readonly trustIntegrityState: SecurityModalLogicState["trustIntegrityState"];
  readonly verifiedAt: string | null;
}) {
  const {
    effectivePeerIdentityAlert,
    effectivePeerIdentityKey,
    locale,
    requiresExplicitPeerDeviceSelection,
    t,
    trustIntegrityState,
    verifiedAt,
  } = params;
  const verifiedLabel = verifiedAt
    ? t("security.verification.verifiedOn", {
        date: new Date(verifiedAt).toLocaleString(locale),
      })
    : t("security.verification.unverified");
  const localTrustLabel =
    trustIntegrityState.degradedAt && !verifiedAt
      ? t("security.verification.localTrustDegraded")
      : verifiedLabel;
  const identityKeyStatus = effectivePeerIdentityAlert
    ? t("security.verification.reverifyRequired")
    : localTrustLabel;

  if (requiresExplicitPeerDeviceSelection) {
    return t("security.verification.selectPeerDevice");
  }
  if (!effectivePeerIdentityKey) {
    return t("security.verification.keyExchangePending");
  }
  return identityKeyStatus;
}
