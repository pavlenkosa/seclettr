import { api } from "@/lib/api";
import type { GroupSfuClient, GroupSfuClientOptions } from "@/calls/group/runtime/sfu";
import { startGroupSfuClient } from "@/calls/group/runtime/sfu";

export interface RoomCallSession {
  callId: string;
  callType: "audio" | "video";
  /** Participant ID: guestSessionId for guests, userId for authenticated host. */
  participantId: string;
  /** Device ID: same as participantId for guests, actual deviceId for host. */
  deviceId: string;
  displayName: string;
  isGuest: boolean;
  /** Guest JWT or null for authenticated host (uses auth store token). */
  guestToken: string | null;
  sfuBaseUrl: string | null;
}

export interface RoomSfuClient {
  sfuClient: GroupSfuClient;
  close: () => void;
}

export async function joinRoomAndStartSfu(
  session: RoomCallSession,
  localStream: MediaStream,
  onRemoteMediaUpdate: GroupSfuClientOptions["onRemoteMediaUpdate"],
  onTransportFailed: () => void,
  signal: AbortSignal
): Promise<RoomSfuClient> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  await api.joinRoomPresence(session.callId, session.guestToken ?? undefined);

  if (signal.aborted) {
    api.leaveRoomPresence(session.callId, session.guestToken ?? undefined);
    throw new DOMException("Aborted", "AbortError");
  }

  const sfuClient = await startGroupSfuClient({
    roomId: session.callId,
    userId: session.participantId,
    deviceId: session.deviceId,
    callType: session.callType,
    localStream,
    mediaEncryptionMode: "off",
    onRemoteMediaUpdate,
    onTransportFailed,
    sfuBaseUrl: session.sfuBaseUrl ?? undefined,
    staticToken: session.guestToken ?? undefined,
  });

  if (signal.aborted) {
    sfuClient.close();
    api.leaveRoomPresence(session.callId, session.guestToken ?? undefined);
    throw new DOMException("Aborted", "AbortError");
  }

  return {
    sfuClient,
    close: () => {
      sfuClient.close();
      api.leaveRoomPresence(session.callId, session.guestToken ?? undefined);
    },
  };
}
