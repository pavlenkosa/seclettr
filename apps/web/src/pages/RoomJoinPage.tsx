import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { RoomCallPanel } from "@/calls/room/RoomCallPanel";
import type { RoomJoinPreviewResponse, RoomJoinResponse } from "@seclettr/protocol";
import type { RoomCallSession } from "@/calls/room/room-call-bootstrap";

type PageState =
  | { phase: "loading" }
  | { phase: "preview"; preview: RoomJoinPreviewResponse }
  | { phase: "joining" }
  | { phase: "in-call"; session: RoomCallSession }
  | { phase: "error"; message: string }
  | { phase: "left" };

const GUEST_NAME_MAX = 64;

export function RoomJoinPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [guestName, setGuestName] = useState("");
  const hasLoadedPreview = useRef(false);

  useEffect(() => {
    if (hasLoadedPreview.current || !token) return;
    hasLoadedPreview.current = true;

    api.getRoomPreview(token).then(
      (preview) => setState({ phase: "preview", preview }),
      (err) => {
        const message = err instanceof Error ? err.message : "Room not found or link has expired.";
        setState({ phase: "error", message });
      }
    );
  }, [token]);

  const handleJoin = async () => {
    if (!token || state.phase !== "preview") return;
    const name = guestName.trim();
    if (!name) return;

    setState({ phase: "joining" });

    try {
      const joinRes: RoomJoinResponse = await api.redeemRoomInvite(token, { guestName: name });

      const session: RoomCallSession = {
        callId: joinRes.callId,
        callType: joinRes.callType,
        participantId: joinRes.guestToken,
        deviceId: joinRes.guestToken,
        displayName: name,
        isGuest: true,
        guestToken: joinRes.guestToken,
        sfuBaseUrl: joinRes.sfuUrl,
      };

      // Decode guestSessionId from JWT payload (sub claim) — needed as participantId.
      try {
        const payloadBase64 = joinRes.guestToken.split(".")[1] ?? "";
        const payload = JSON.parse(atob(payloadBase64)) as { sub?: string; deviceId?: string };
        session.participantId = payload.sub ?? joinRes.guestToken;
        session.deviceId = payload.deviceId ?? joinRes.guestToken;
      } catch {
        // Keep guestToken as fallback participantId — the SFU will accept it.
      }

      setState({ phase: "in-call", session });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to join room.";
      setState({ phase: "error", message });
    }
  };

  if (state.phase === "loading") {
    return (
      <div style={pageWrap}>
        <p style={{ opacity: 0.6 }}>Loading room info…</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={pageWrap}>
        <h2 style={{ marginBottom: 12 }}>Room unavailable</h2>
        <p style={{ opacity: 0.7 }}>{state.message}</p>
      </div>
    );
  }

  if (state.phase === "left") {
    return (
      <div style={pageWrap}>
        <h2>You have left the room.</h2>
      </div>
    );
  }

  if (state.phase === "in-call") {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <RoomCallPanel
          session={state.session}
          onLeave={() => setState({ phase: "left" })}
        />
      </div>
    );
  }

  const preview = state.phase === "preview" ? state.preview : null;
  const isJoining = state.phase === "joining";

  return (
    <div style={pageWrap}>
      <h2 style={{ marginBottom: 4, fontSize: "1.25rem" }}>
        {preview?.hostUsername ? `${preview.hostUsername}'s room` : "Room call"}
      </h2>
      <p style={{ opacity: 0.6, marginBottom: 24, fontSize: "0.875rem" }}>
        {preview?.callType === "video" ? "Video call" : "Audio call"}
        {preview?.expiresAt ? ` · expires ${new Date(preview.expiresAt).toLocaleString()}` : ""}
      </p>

      <label style={{ display: "block", marginBottom: 8, fontSize: "0.875rem", opacity: 0.8 }}>
        Your display name
      </label>
      <input
        type="text"
        value={guestName}
        onChange={(e) => setGuestName(e.target.value.slice(0, GUEST_NAME_MAX))}
        placeholder="Enter your name"
        maxLength={GUEST_NAME_MAX}
        disabled={isJoining}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleJoin();
        }}
        style={inputStyle}
        autoFocus
      />

      <button
        type="button"
        onClick={() => void handleJoin()}
        disabled={isJoining || guestName.trim().length === 0}
        style={joinBtnStyle}
      >
        {isJoining ? "Joining…" : "Join room"}
      </button>
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "var(--bg-primary, #111)",
  color: "var(--text-primary, #fff)",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: 360,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border-subtle, #444)",
  background: "var(--bg-secondary, #222)",
  color: "var(--text-primary, #fff)",
  fontSize: "1rem",
  marginBottom: 16,
  outline: "none",
};

const joinBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: 360,
  padding: "12px 0",
  borderRadius: 8,
  border: "none",
  background: "var(--color-accent, #3b82f6)",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};
