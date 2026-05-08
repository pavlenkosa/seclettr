import { useEffect, useState } from "react";
import type { GroupMember } from "@/stores/groups";
import {
  computeSafetyCodes,
  getSafetyVerificationRecord,
  toBase64Url,
} from "@/lib/safety";
import type { UserDeviceIdentityDto } from "./group-security-directory";

export async function resolveGroupThreadSecurityStatus(params: {
  activeGroup: {
    groupId: string;
    members: GroupMember[];
  } | null;
  identityDhKeyPair?: { publicKey: Uint8Array } | null;
  userId?: string | null;
  deviceId?: string | null;
  fetchGroupSecurityDevices: (
    groupId: string
  ) => Promise<Record<string, UserDeviceIdentityDto[]>>;
}): Promise<"verified" | "unverified"> {
  if (!params.activeGroup || !params.identityDhKeyPair || !params.userId || !params.deviceId) {
    return "unverified";
  }

  const peers = params.activeGroup.members.filter((member) => member.userId !== params.userId);
  if (peers.length === 0) {
    return "verified";
  }

  let devicesByUserId: Record<string, UserDeviceIdentityDto[]>;
  try {
    devicesByUserId = await params.fetchGroupSecurityDevices(params.activeGroup.groupId);
  } catch {
    return "unverified";
  }

  const myKeyB64 = toBase64Url(params.identityDhKeyPair.publicKey);
  for (const member of peers) {
    try {
      const devices = devicesByUserId[member.userId] ?? [];
      if (devices.length === 0) {
        return "unverified";
      }
      let hasVerifiedDevice = false;
      for (const peerDevice of devices) {
        const codes = await computeSafetyCodes(
          myKeyB64,
          peerDevice.identityKeyPublic,
          params.userId,
          member.userId
        );
        const record = await getSafetyVerificationRecord(
          params.userId,
          params.deviceId,
          member.userId,
          peerDevice.deviceId
        );
        if (record?.safetyHash === codes.safetyHash) {
          hasVerifiedDevice = true;
          break;
        }
      }
      if (!hasVerifiedDevice) {
        return "unverified";
      }
    } catch {
      return "unverified";
    }
  }

  return "verified";
}

export function useGroupThreadSecurityStatus(params: {
  activeGroup: {
    groupId: string;
    members: GroupMember[];
  } | null;
  identityDhKeyPair?: { publicKey: Uint8Array } | null;
  userId?: string | null;
  deviceId?: string | null;
  fetchGroupSecurityDevices: (
    groupId: string
  ) => Promise<Record<string, UserDeviceIdentityDto[]>>;
  refreshTick: number;
}) {
  const {
    activeGroup,
    identityDhKeyPair,
    userId,
    deviceId,
    fetchGroupSecurityDevices,
    refreshTick,
  } = params;
  const [groupSecurityStatus, setGroupSecurityStatus] = useState<
    "verified" | "unverified"
  >("unverified");

  useEffect(() => {
    let cancelled = false;

    resolveGroupThreadSecurityStatus({
      activeGroup,
      identityDhKeyPair,
      userId,
      deviceId,
      fetchGroupSecurityDevices,
    })
      .then((nextStatus) => {
        if (!cancelled) {
          setGroupSecurityStatus(nextStatus);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroupSecurityStatus("unverified");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeGroup,
    identityDhKeyPair,
    userId,
    deviceId,
    fetchGroupSecurityDevices,
    refreshTick,
  ]);

  return groupSecurityStatus;
}
