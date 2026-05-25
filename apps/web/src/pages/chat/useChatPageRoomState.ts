/**
 * useChatPageRoomState — owns room-call dialog/session state for ChatPage.
 *
 * Owns:
 *   - "create room" dialog open/close state
 *   - Active room session lifecycle
 *   - Global dev helper for opening the create-room dialog
 *   - Host session shaping after successful room creation
 *
 * Does not own room-call media runtime or RoomCallPanel UI internals.
 */
import { useCallback, useEffect, useState } from "react";
import type { RoomCallSession } from "@/calls/room/room-call-bootstrap";

interface RoomCreationResult {
  callId: string;
  inviteUrl: string;
}

interface HandleRoomCreatedParams {
  res: RoomCreationResult;
  callType: "audio" | "video";
  userId: string | null;
  deviceId: string | null;
  username: string | null;
}

export function useChatPageRoomState() {
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [activeRoomSession, setActiveRoomSession] = useState<RoomCallSession | null>(null);

  const handleOpenCreateRoom = useCallback(() => setCreateRoomOpen(true), []);
  const handleCloseCreateRoom = useCallback(() => setCreateRoomOpen(false), []);
  const handleLeaveRoom = useCallback(() => setActiveRoomSession(null), []);

  useEffect(() => {
    window.__scCreateRoom = handleOpenCreateRoom;
    return () => {
      delete window.__scCreateRoom;
    };
  }, [handleOpenCreateRoom]);

  const handleRoomCreated = useCallback((params: HandleRoomCreatedParams) => {
    const { res, callType, userId, deviceId, username } = params;
    handleCloseCreateRoom();
    if (!userId || !deviceId || !username) return;

    setActiveRoomSession({
      callId: res.callId,
      callType,
      participantId: userId,
      deviceId,
      displayName: username,
      isGuest: false,
      isHost: true,
      guestToken: null,
      sfuBaseUrl: null,
      inviteUrl: res.inviteUrl,
    });
  }, [handleCloseCreateRoom]);

  return {
    createRoomOpen,
    activeRoomSession,
    handleOpenCreateRoom,
    handleCloseCreateRoom,
    handleLeaveRoom,
    handleRoomCreated,
  };
}
