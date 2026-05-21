/**
 * room-call-bootstrap — SFU join and client creation for guest/host room calls.
 *
 * Owns:
 *   - RoomCallSession — session descriptor for a room call (callId, participantId,
 *     deviceId, displayName, isGuest, isHost, guestToken, sfuBaseUrl, inviteUrl)
 *   - RoomSfuClient — thin wrapper exposing sfuClient + close()
 *   - joinRoomAndStartSfu — async function that calls api.joinRoomCall, starts
 *     the group SFU client (reusing the group call SFU stack), and returns RoomSfuClient
 *
 * Does not own local media acquisition, room-call panel state, or rejoin logic.
 * Guest authentication uses the guestToken injected into the SFU HTTP client
 * as a static token rather than the auth store.
 */
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
  isHost: boolean;
  /** Guest JWT or null for authenticated host (uses auth store token). */
  guestToken: string | null;
  sfuBaseUrl: string | null;
  /** Invite URL shown in the host UI for sharing. */
  inviteUrl: string | null;
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
