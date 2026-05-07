import { useCallback, useState } from "react";
import { api } from "@/lib/api";

interface Props {
  readonly onClose: () => void;
  readonly onRoomCreated: (callId: string, inviteUrl: string, guestToken: null) => void;
}

type CallType = "audio" | "video";

const TTL_OPTIONS: { label: string; minutes: number }[] = [
  { label: "15 minutes", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "24 hours", minutes: 1440 },
  { label: "7 days", minutes: 10080 },
];

export function CreateRoomDialog({ onClose, onRoomCreated }: Props) {
  const [callType, setCallType] = useState<CallType>("audio");
  const [expiresInMinutes, setExpiresInMinutes] = useState(60);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await api.createRoom({ callType, expiresInMinutes });
      setCreatedInviteUrl(res.inviteUrl);
      onRoomCreated(res.callId, res.inviteUrl, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setIsCreating(false);
    }
  }, [callType, expiresInMinutes, onRoomCreated]);

  const handleCopy = useCallback(async () => {
    if (!createdInviteUrl) return;
    try {
      await navigator.clipboard.writeText(createdInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  }, [createdInviteUrl]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16, fontSize: "1rem", fontWeight: 600 }}>
          Create room call
        </h3>

        {!createdInviteUrl ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Call type</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["audio", "video"] as CallType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCallType(type)}
                    style={{
                      ...segmentBtn,
                      background: callType === type ? "var(--color-accent, #3b82f6)" : "var(--bg-secondary, #333)",
                    }}
                  >
                    {type === "audio" ? "Audio" : "Video"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Link expires after</label>
              <select
                value={expiresInMinutes}
                onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
                style={selectStyle}
              >
                {TTL_OPTIONS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p style={{ color: "var(--color-danger, red)", marginBottom: 12, fontSize: "0.875rem" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={cancelBtnStyle} disabled={isCreating}>
                Cancel
              </button>
              <button type="button" onClick={() => void handleCreate()} style={createBtnStyle} disabled={isCreating}>
                {isCreating ? "Creating…" : "Create room"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginBottom: 12, fontSize: "0.875rem", opacity: 0.8 }}>
              Room created! Share this link with participants:
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <input
                readOnly
                value={createdInviteUrl}
                style={{ ...selectStyle, flex: 1, fontSize: "0.8rem" }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button type="button" onClick={() => void handleCopy()} style={createBtnStyle}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={cancelBtnStyle}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--bg-primary, #1a1a1a)",
  border: "1px solid var(--border-subtle, #333)",
  borderRadius: 12,
  padding: 24,
  width: "min(90vw, 400px)",
  color: "var(--text-primary, #fff)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: "0.8rem",
  opacity: 0.7,
};

const segmentBtn: React.CSSProperties = {
  flex: 1,
  padding: "8px 0",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  color: "var(--text-primary, #fff)",
  fontSize: "0.875rem",
};

const selectStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--border-subtle, #444)",
  background: "var(--bg-secondary, #222)",
  color: "var(--text-primary, #fff)",
  fontSize: "0.875rem",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid var(--border-subtle, #444)",
  background: "transparent",
  color: "var(--text-primary, #fff)",
  cursor: "pointer",
  fontSize: "0.875rem",
};

const createBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "none",
  background: "var(--color-accent, #3b82f6)",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.875rem",
  fontWeight: 600,
};
