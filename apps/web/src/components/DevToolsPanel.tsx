/**
 * Dev-only floating panel for clearing browser state and viewing debug info.
 * Renders only when import.meta.env.DEV is true.
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import { CALL_MEDIA_DEBUG_ENABLED_KEY } from "@/calls/shared/media/call-media-debug";

type CallDebugWindow = Window & {
  __scGetCallDebugSnapshot?: () => Promise<Record<string, unknown> | null>;
  __scDumpCallDebug?: () => Promise<void>;
  __scSetCallDebugEnabled?: (enabled: boolean) => void;
  __scIsCallDebugEnabled?: () => boolean;
  __scInjectMockParticipants?: (count: number) => void;
  __scClearMockParticipants?: () => void;
  __scCreateRoom?: () => void;
};

async function deleteAllDatabases(): Promise<void> {
  const names = ["seclettr-keystore"];
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("Failed to delete database"));
      req.onblocked = () => resolve();
    });
  }
}

export function DevToolsPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [mockCount, setMockCount] = useState(5);
  const [callDebugEnabled, setCallDebugEnabled] = useState(() => (
    localStorage.getItem(CALL_MEDIA_DEBUG_ENABLED_KEY) === "1"
  ));
  const userId = useAuthStore(s => s.userId);
  const deviceId = useAuthStore(s => s.deviceId);
  const storageKey = useAuthStore(s => s.storageKey);

  const storageKeyPresent = Boolean(storageKey);
  const wsConnected = wsClient.connected;
  const callDebugWindow = globalThis as unknown as CallDebugWindow;

  useEffect(() => {
    const fromCallBanner = callDebugWindow.__scIsCallDebugEnabled?.();
    if (typeof fromCallBanner === "boolean") {
      setCallDebugEnabled(fromCallBanner);
    }
  }, [callDebugWindow]);

  async function clearAllData() {
    if (!globalThis.confirm(t("dev.confirmClearAll"))) {
      return;
    }

    setClearing(true);
    try {
      wsClient.disconnect();
      localStorage.clear();
      sessionStorage.clear();
      await deleteAllDatabases();
    } finally {
      globalThis.location.reload();
    }
  }

  function copyDebugInfo() {
    const info = {
      userId,
      deviceId,
      storageKeyPresent,
      wsConnected,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    void navigator.clipboard.writeText(JSON.stringify(info, null, 2)).then(() => {
      alert(t("dev.debugCopied"));
    });
  }

  async function copyCallSnapshot() {
    const snapshot = await callDebugWindow.__scGetCallDebugSnapshot?.();
    if (!snapshot) {
      alert(t("dev.callSnapshotUnavailable"));
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    alert(t("dev.callSnapshotCopied"));
  }

  async function dumpCallSnapshot() {
    if (!callDebugWindow.__scDumpCallDebug) {
      alert(t("dev.callSnapshotUnavailable"));
      return;
    }
    await callDebugWindow.__scDumpCallDebug();
  }

  function toggleCallDebug() {
    const nextValue = !callDebugEnabled;
    callDebugWindow.__scSetCallDebugEnabled?.(nextValue);
    localStorage.setItem(CALL_MEDIA_DEBUG_ENABLED_KEY, nextValue ? "1" : "0");
    setCallDebugEnabled(nextValue);
  }

  return (
    <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999, fontFamily: "monospace", fontSize: 12 }}>
      {open && (
        <div style={{
          background: "#1e293b",
          color: "#e2e8f0",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: 16,
          marginBottom: 8,
          minWidth: 280,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontWeight: "bold", marginBottom: 12, color: "#94a3b8", letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>
            {t("dev.title")}
          </div>

          <div style={{ marginBottom: 12, lineHeight: 1.8 }}>
            <div><span style={{ color: "#64748b" }}>{t("dev.userId")}</span> {userId ?? "—"}</div>
            <div style={{ wordBreak: "break-all" }}>
              <span style={{ color: "#64748b" }}>{t("dev.deviceId")}</span> {deviceId ? deviceId.slice(0, 8) + "…" : "—"}
            </div>
            <div>
              <span style={{ color: "#64748b" }}>{t("dev.storageKey")}</span>{" "}
              <span style={{ color: storageKeyPresent ? "#4ade80" : "#f87171" }}>
                {storageKeyPresent ? t("dev.present") : t("dev.missing")}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b" }}>{t("dev.ws")}</span>{" "}
              <span style={{ color: wsConnected ? "#4ade80" : "#f87171" }}>
                {wsConnected ? t("dev.connected") : t("dev.disconnected")}
              </span>
            </div>
          </div>

          {/* ── Group call mock participants ─────────────────── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Group Call Mock
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input
                type="number"
                min={1}
                max={50}
                value={mockCount}
                onChange={(e) => setMockCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                style={{
                  width: 52,
                  background: "#0f172a",
                  color: "#e2e8f0",
                  border: "1px solid #334155",
                  borderRadius: 4,
                  padding: "4px 6px",
                  fontFamily: "monospace",
                  fontSize: 12,
                  textAlign: "center",
                }}
              />
              <span style={{ color: "#94a3b8", fontSize: 11 }}>participants</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => callDebugWindow.__scInjectMockParticipants?.(mockCount)}
                style={{
                  flex: 1,
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 8px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              >
                Spawn
              </button>
              <button
                onClick={() => callDebugWindow.__scClearMockParticipants?.()}
                style={{
                  flex: 1,
                  background: "#374151",
                  color: "#e2e8f0",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 8px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* ── Room call (dev only) ─────────────────────── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Room Call
            </div>
            <button
              onClick={() => callDebugWindow.__scCreateRoom?.()}
              style={{
                width: "100%",
                background: "#0369a1",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 8px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 11,
              }}
            >
              Create room…
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => clearAllData()}
              disabled={clearing}
              style={{
                background: clearing ? "#374151" : "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                cursor: clearing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {clearing ? t("dev.clearing") : t("dev.clearAllData")}
            </button>

            <button
              onClick={copyDebugInfo}
              style={{
                background: "#1d4ed8",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {t("dev.copyDebugInfo")}
            </button>

            <button
              onClick={() => copyCallSnapshot()}
              style={{
                background: "#0f766e",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {t("dev.copyCallSnapshot")}
            </button>

            <button
              onClick={() => dumpCallSnapshot()}
              style={{
                background: "#334155",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {t("dev.dumpCallSnapshot")}
            </button>

            <button
              onClick={toggleCallDebug}
              style={{
                background: callDebugEnabled ? "#15803d" : "#475569",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {callDebugEnabled ? t("dev.callDebugDisable") : t("dev.callDebugEnable")}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        title={t("dev.title")}
        style={{
          width: 36,
          height: 36,
          borderRadius: "10px",
          background: open ? "#1d4ed8" : "#1e293b",
          color: "#e2e8f0",
          border: "1px solid #334155",
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          marginLeft: "auto",
        }}
      >
        ⚙
      </button>
    </div>
  );
}
