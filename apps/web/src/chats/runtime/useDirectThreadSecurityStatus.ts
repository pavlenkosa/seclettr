import { useEffect, useState } from "react";
import {
  computeSafetyCodes,
  getSafetyVerificationRecord,
  getSafetyTrustIntegrityState,
  selectPeerDeviceId,
  toBase64Url,
} from "@/lib/safety";

export async function resolveDirectThreadSecurityStatus(params: {
  activeConversationUserId: string | null;
  activePeerIdentityKey?: string;
  activePeerIdentityDeviceId?: string | null;
  activePeerIdentityByDevice?: Record<string, string>;
  activePeerIdentityAlertCount: number;
  identityDhKeyPair?: { publicKey: Uint8Array } | null;
  userId?: string | null;
  deviceId?: string | null;
}): Promise<"verified" | "unverified" | "reverify_required"> {
  if (
    !params.activeConversationUserId ||
    !params.identityDhKeyPair ||
    !params.userId ||
    !params.deviceId
  ) {
    return "unverified";
  }

  if (params.activePeerIdentityAlertCount > 0) {
    return "reverify_required";
  }

  const peerDeviceEntries = Object.entries(params.activePeerIdentityByDevice ?? {});
  const selectedPeerDeviceId = selectPeerDeviceId({
    peerIdentityByDevice: params.activePeerIdentityByDevice,
    preferredDeviceId: params.activePeerIdentityDeviceId ?? null,
  });
  const requiresExplicitPeerDeviceSelection =
    peerDeviceEntries.length > 1 && !selectedPeerDeviceId;

  const deviceIdentityKey = selectedPeerDeviceId && params.activePeerIdentityByDevice?.[selectedPeerDeviceId]
    ? params.activePeerIdentityByDevice[selectedPeerDeviceId]
    : params.activePeerIdentityKey;
  const effectivePeerIdentityKey = requiresExplicitPeerDeviceSelection
    ? undefined
    : deviceIdentityKey;

  if (!effectivePeerIdentityKey) {
    return "unverified";
  }

  const codes = await computeSafetyCodes(
    toBase64Url(params.identityDhKeyPair.publicKey),
    effectivePeerIdentityKey,
    params.userId,
    params.activeConversationUserId
  );
  const record = await getSafetyVerificationRecord(
    params.userId,
    params.deviceId,
    params.activeConversationUserId,
    selectedPeerDeviceId ?? undefined
  );

  if (record?.safetyHash === codes.safetyHash) {
    return "verified";
  }

  const integrityState = await getSafetyTrustIntegrityState();
  return integrityState.degradedAt ? "reverify_required" : "unverified";
}

export function useDirectThreadSecurityStatus(params: {
  activeConversationUserId: string | null;
  activePeerIdentityKey?: string;
  activePeerIdentityDeviceId?: string | null;
  activePeerIdentityByDevice?: Record<string, string>;
  activePeerIdentityAlertCount: number;
  identityDhKeyPair?: { publicKey: Uint8Array } | null;
  userId?: string | null;
  deviceId?: string | null;
  refreshTick: number;
}) {
  const {
    activeConversationUserId,
    activePeerIdentityKey,
    activePeerIdentityDeviceId,
    activePeerIdentityByDevice,
    activePeerIdentityAlertCount,
    identityDhKeyPair,
    userId,
    deviceId,
    refreshTick,
  } = params;
  const [securityStatus, setSecurityStatus] = useState<
    "verified" | "unverified" | "reverify_required"
  >("unverified");

  useEffect(() => {
    let cancelled = false;

    resolveDirectThreadSecurityStatus({
      activeConversationUserId,
      activePeerIdentityKey,
      activePeerIdentityDeviceId,
      activePeerIdentityByDevice,
      activePeerIdentityAlertCount,
      identityDhKeyPair,
      userId,
      deviceId,
    })
      .then((nextStatus) => {
        if (!cancelled) {
          setSecurityStatus(nextStatus);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSecurityStatus("unverified");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeConversationUserId,
    activePeerIdentityKey,
    activePeerIdentityDeviceId,
    activePeerIdentityByDevice,
    activePeerIdentityAlertCount,
    identityDhKeyPair,
    userId,
    deviceId,
    refreshTick,
  ]);

  return securityStatus;
}
