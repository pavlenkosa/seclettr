import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { joinRoomAndStartSfu, type RoomCallSession, type RoomSfuClient } from "./room-call-bootstrap";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import type { RoomParticipantsResponse } from "@seclettr/protocol";

interface Props {
  readonly session: RoomCallSession;
  readonly onLeave: () => void;
}

type Status = "connecting" | "ready" | "error" | "leaving";

export function RoomCallPanel({ session, onLeave }: Props) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState<GroupCallRemoteMedia[]>([]);
  const [participants, setParticipants] = useState<RoomParticipantsResponse["participants"]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const sfuClientRef = useRef<RoomSfuClient | null>(null);
  const abortRef = useRef<AbortController>(new AbortController());
  const localStreamRef = useRef<MediaStream | null>(null);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const handleLeave = useCallback(() => {
    setStatus("leaving");
    abortRef.current.abort();
    sfuClientRef.current?.close();
    sfuClientRef.current = null;
    stopLocalStream();
    onLeave();
  }, [onLeave, stopLocalStream]);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: session.callType === "video",
        });
        localStreamRef.current = stream;
        setLocalStream(stream);

        if (ac.signal.aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const client = await joinRoomAndStartSfu(
          session,
          stream,
          (media) => setRemoteMedia(media),
          () => {
            if (!ac.signal.aborted) {
              setStatus("error");
              setErrorMessage("Connection lost. Please rejoin.");
            }
          },
          ac.signal
        );

        if (ac.signal.aborted) {
          client.close();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        sfuClientRef.current = client;
        setStatus("ready");
      } catch (err) {
        if (ac.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to connect";
        setStatus("error");
        setErrorMessage(message);
        stream?.getTracks().forEach((t) => t.stop());
      }
    };

    void start();

    return () => {
      ac.abort();
      sfuClientRef.current?.close();
      sfuClientRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll participants list every 10 seconds
  useEffect(() => {
    if (status !== "ready") return;
    let active = true;

    const fetchParticipants = async () => {
      try {
        const res = await api.getRoomParticipants(session.callId, session.guestToken ?? undefined);
        if (active) setParticipants(res.participants);
      } catch {
        // Best-effort
      }
    };

    void fetchParticipants();
    const id = setInterval(() => void fetchParticipants(), 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [status, session.callId, session.guestToken]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const enabled = !isAudioMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
    setIsAudioMuted(!enabled);
  }, [isAudioMuted]);

  if (status === "error") {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p style={{ color: "var(--color-danger, red)", marginBottom: 16 }}>
          {errorMessage ?? "Connection error"}
        </p>
        <button type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary, #111)", color: "var(--text-primary, #fff)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle, #333)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>Room call</span>
        <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
          {status === "connecting" ? "Connecting…" : `${participants.length} participant${participants.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {remoteMedia.length === 0 && status === "ready" && (
          <p style={{ opacity: 0.5, textAlign: "center", marginTop: 32 }}>Waiting for others to join…</p>
        )}
        {remoteMedia.map((media) => (
          <div key={media.userId} style={{ marginBottom: 8, padding: 8, borderRadius: 4, background: "var(--bg-secondary, #222)" }}>
            <span>{media.userId}</span>
            {media.audioStream && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio
                autoPlay
                ref={(el) => {
                  if (el && media.audioStream) el.srcObject = media.audioStream;
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: 16, borderTop: "1px solid var(--border-subtle, #333)", display: "flex", gap: 12, justifyContent: "center" }}>
        <button
          type="button"
          onClick={toggleMute}
          style={{ padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", background: isAudioMuted ? "var(--color-warning, #e6a817)" : "var(--bg-secondary, #333)", color: "var(--text-primary, #fff)" }}
        >
          {isAudioMuted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={handleLeave}
          style={{ padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", background: "var(--color-danger, #e53e3e)", color: "#fff" }}
        >
          Leave
        </button>
      </div>
    </div>
  );
}
