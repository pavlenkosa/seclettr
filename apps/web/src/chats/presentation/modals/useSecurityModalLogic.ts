import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/stores/auth";
import type { PeerIdentityAlert } from "@/stores/messages";
import {
  clearSafetyVerificationRecord,
  computeSafetyCodes,
  getSafetyVerificationRecord,
  getSafetyTrustIntegrityState,
  selectPeerDeviceId,
  setSafetyVerificationRecord,
  toBase64Url,
  type BrowserTrustIntegrityState,
  type SafetyCodes,
} from "@/lib/safety";

interface UseSecurityModalLogicOptions {
  recipientUserId: string;
  peerIdentityKey?: string;
  peerIdentityDeviceId?: string;
  peerIdentityByDevice?: Record<string, string>;
  peerIdentityAlertsByDevice?: Record<string, PeerIdentityAlert>;
  onVerificationChanged?: () => void;
  onAcceptPeerIdentityChange?: (deviceId: string) => void | Promise<void>;
}

export function useSecurityModalLogic({
  recipientUserId,
  peerIdentityKey,
  peerIdentityDeviceId,
  peerIdentityByDevice,
  peerIdentityAlertsByDevice,
  onVerificationChanged,
  onAcceptPeerIdentityChange,
}: UseSecurityModalLogicOptions) {
  const { identityDhKeyPair, myUserId, myDeviceId } = useAuthStore(useShallow((state) => ({
    identityDhKeyPair: state.identityDhKeyPair,
    myUserId: state.userId,
    myDeviceId: state.deviceId,
  })));
  const [codes, setCodes] = useState<SafetyCodes | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [selectedPeerDeviceId, setSelectedPeerDeviceId] = useState<string | null>(null);
  const [trustIntegrityState, setTrustIntegrityState] = useState<BrowserTrustIntegrityState>({
    degradedAt: null,
    issues: [],
  });

  const myKeyB64 = identityDhKeyPair
    ? toBase64Url(identityDhKeyPair.publicKey)
    : null;

  const peerDeviceEntries = useMemo(
    () => Object.entries(peerIdentityByDevice ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    [peerIdentityByDevice]
  );

  useEffect(() => {
    setSelectedPeerDeviceId((prev) => selectPeerDeviceId({
      peerIdentityByDevice,
      preferredDeviceId: peerIdentityDeviceId ?? null,
      previousDeviceId: prev,
    }));
  }, [peerIdentityByDevice, peerIdentityDeviceId]);

  const requiresExplicitPeerDeviceSelection =
    peerDeviceEntries.length > 1 && !selectedPeerDeviceId;

  const effectivePeerDeviceId = selectedPeerDeviceId;
  const effectivePeerIdentityAlert = (
    effectivePeerDeviceId
      ? peerIdentityAlertsByDevice?.[effectivePeerDeviceId] ?? null
      : null
  );
  const deviceSpecificIdentityKey = effectivePeerDeviceId && peerIdentityByDevice?.[effectivePeerDeviceId]
    ? peerIdentityByDevice[effectivePeerDeviceId]
    : peerIdentityKey;
  const resolvedPeerIdentityKey = effectivePeerIdentityAlert
    ? effectivePeerIdentityAlert.currentIdentityKey
    : deviceSpecificIdentityKey;
  const effectivePeerIdentityKey = requiresExplicitPeerDeviceSelection
    ? undefined
    : resolvedPeerIdentityKey;

  useEffect(() => {
    let cancelled = false;

    getSafetyTrustIntegrityState()
      .then((nextState) => {
        if (!cancelled) {
          setTrustIntegrityState(nextState);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrustIntegrityState({ degradedAt: null, issues: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!myKeyB64 || !effectivePeerIdentityKey || !myUserId || !myDeviceId) {
      setCodes(null);
      setVerifiedAt(null);
      return;
    }

    let cancelled = false;

    computeSafetyCodes(myKeyB64, effectivePeerIdentityKey, myUserId, recipientUserId)
      .then(async (nextCodes) => {
        if (cancelled) return;

        setCodes(nextCodes);
        const record = await getSafetyVerificationRecord(
          myUserId,
          myDeviceId,
          recipientUserId,
          effectivePeerDeviceId ?? undefined
        );

        if (cancelled) return;
        if (record?.safetyHash === nextCodes.safetyHash) {
          setVerifiedAt(record.verifiedAt);
        } else {
          setVerifiedAt(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCodes(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    effectivePeerDeviceId,
    effectivePeerIdentityKey,
    myDeviceId,
    myKeyB64,
    myUserId,
    recipientUserId,
  ]);

  const markVerified = async () => {
    if (!codes || !myUserId || !myDeviceId) return;

    const record = await setSafetyVerificationRecord(
      myUserId,
      myDeviceId,
      recipientUserId,
      codes.safetyHash,
      effectivePeerDeviceId ?? undefined
    );
    setVerifiedAt(record?.verifiedAt ?? null);

    if (effectivePeerIdentityAlert && effectivePeerDeviceId) {
      await onAcceptPeerIdentityChange?.(effectivePeerDeviceId);
    }
    onVerificationChanged?.();
  };

  const resetVerification = async () => {
    if (!myUserId || !myDeviceId) return;

    await clearSafetyVerificationRecord(
      myUserId,
      myDeviceId,
      recipientUserId,
      effectivePeerDeviceId ?? undefined
    );
    setVerifiedAt(null);
    onVerificationChanged?.();
  };

  return {
    codes,
    effectivePeerDeviceId,
    effectivePeerIdentityAlert,
    effectivePeerIdentityKey,
    markVerified,
    myDeviceId,
    myKeyB64,
    peerDeviceEntries,
    requiresExplicitPeerDeviceSelection,
    resetVerification,
    selectedPeerDeviceId,
    setSelectedPeerDeviceId,
    trustIntegrityState,
    verifiedAt,
  };
}
