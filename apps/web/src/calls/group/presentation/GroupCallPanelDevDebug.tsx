import { lazy, Suspense } from "react";
import type { GroupCallPanelSession } from "@/calls/group/model/entry";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime";
import type { UseGroupCallPanelRuntimeResult } from "@/calls/group/runtime/useGroupCallPanelRuntime";
import type { UseGroupCallDevDebugOptions } from "@/calls/group/runtime/useGroupCallDevDebug";

const GroupCallDevDebugBridge = import.meta.env.DEV
  ? lazy(() =>
      import("@/calls/group/runtime/GroupCallDevDebugBridge").then(
        ({ GroupCallDevDebugBridge: Component }) => ({
          default: Component,
        }),
      ),
    )
  : null;

interface GroupCallPanelDevDebugProps {
  readonly session: GroupCallPanelSession | null;
  readonly runtime: UseGroupCallPanelRuntimeResult;
  readonly remoteMedia: GroupCallRemoteMedia[];
}

export function GroupCallPanelDevDebug({
  session,
  runtime,
  remoteMedia,
}: GroupCallPanelDevDebugProps) {
  if (!GroupCallDevDebugBridge) return null;

  const options: UseGroupCallDevDebugOptions = {
    session,
    status: runtime.status,
    callId: runtime.callId,
    accessGranted: runtime.accessGranted,
    isVideoSwitching: runtime.isVideoSwitching,
    isScreenSwitching: runtime.isScreenSwitching,
    callHostUserId: runtime.callHostUserId,
    userId: runtime.userId,
    deviceId: runtime.deviceId,
    localStreamRef: runtime.localStreamRef,
    localScreenStreamRef: runtime.localScreenStreamRef,
    remoteMedia,
    activeParticipantUserIds: runtime.activeParticipantUserIds,
    activeParticipantDeviceIdsByUserId: runtime.activeParticipantDeviceIdsByUserId,
    remoteParticipantMediaModes: runtime.remoteParticipantMediaModes,
    localRequestedMediaEncryptionMode: runtime.localRequestedMediaEncryptionMode,
    localAdvertisedMediaEncryptionMode: runtime.localAdvertisedMediaEncryptionMode,
    effectiveMediaEncryptionMode: runtime.effectiveMediaEncryptionMode,
    localMediaKey: runtime.localMediaKey,
    sharedMediaKeyDeviceCount: runtime.sharedMediaKeyDeviceCount,
    receivedMediaKeyCount: runtime.receivedMediaKeyCount,
    expectedRemoteDeviceIds: runtime.expectedRemoteDeviceIds,
    sfuClientRef: runtime.sfuClientRef,
  };

  return (
    <Suspense fallback={null}>
      <GroupCallDevDebugBridge {...options} />
    </Suspense>
  );
}
