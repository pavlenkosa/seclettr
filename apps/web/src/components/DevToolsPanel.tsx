/**
 * Dev-only floating panel for clearing browser state and viewing debug info.
 * Renders only when import.meta.env.DEV is true.
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import { useMessagesStore } from "@/stores/messages";
import { useGroupsStore } from "@/stores/groups";
import { CALL_MEDIA_DEBUG_ENABLED_KEY } from "@/calls/shared/media/call-media-debug";
import { StorageInspector } from "./StorageInspector";
import styles from "./DevToolsPanel.module.css";

type CallDebugWindow = Window & {
  __scGetCallDebugSnapshot?: () => Promise<Record<string, unknown> | null>;
  __scDumpCallDebug?: () => Promise<void>;
  __scSetCallDebugEnabled?: (enabled: boolean) => void;
  __scIsCallDebugEnabled?: () => boolean;
  __scInjectMockParticipants?: (count: number) => void;
  __scClearMockParticipants?: () => void;
  __scCreateRoom?: () => void;
};

const MOCK_USERNAMES = [
  "alice", "bob", "carol", "dave", "eve", "frank", "grace", "heidi",
  "ivan", "judy", "mallory", "niaj", "olivia", "peggy", "rupert",
  "sybil", "trent", "victor", "wendy", "xander", "yasmin", "zelda",
];

const MOCK_LAST_MESSAGES = [
  "Hey, are you there?",
  "Did you see the news?",
  "Let's meet tomorrow at 10",
  "Sounds good to me 👍",
  "I'll send you the file later",
  "Can you call me back?",
  "lol no way 😂",
  "Check this out",
  "On my way!",
  "Sorry, was in a meeting",
  "What time works for you?",
  "Thanks for yesterday!",
  "Have you tried restarting it?",
  "👋",
  "See you soon",
];

const MOCK_GROUP_NAMES = [
  "Project Alpha", "Weekend Plans", "Family", "Study Group", "Dev Team",
  "Book Club", "Gym Buddies", "Trip 2025", "Tech News", "Random",
  "Design Reviews", "Backend Chat", "Ops & Infra", "Marketing",
  "Product Sync", "Open Source", "Lunch Crew", "Night Owls",
];

function pickRandom<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length] as T;
}

function injectMockConversations(count: number): void {
  const store = useMessagesStore.getState();
  const existing = Object.keys(store.conversations);
  const mockIds = existing.filter((id) => id.startsWith("mock-dm-"));
  const nextIndex = mockIds.length;

  const next: typeof store.conversations = { ...store.conversations };
  for (let i = 0; i < count; i++) {
    const idx = nextIndex + i;
    const userId = `mock-dm-${idx}`;
    const username = `${pickRandom(MOCK_USERNAMES, idx)}_${idx}`;
    const lastContent = pickRandom(MOCK_LAST_MESSAGES, idx * 7 + 3);
    const unread = idx % 4 === 0 ? Math.floor(Math.random() * 9) + 1 : 0;
    next[userId] = {
      userId,
      username,
      messages: [
        {
          id: `mock-msg-${idx}`,
          senderId: userId,
          senderDeviceId: `mock-device-${idx}`,
          content: lastContent,
          type: "text",
          timestamp: Date.now() - (count - i) * 60_000 * (1 + (idx % 5)),
          status: "delivered",
          isOwn: idx % 3 === 0,
        },
      ],
      lastMessageAt: Date.now() - (count - i) * 60_000 * (1 + (idx % 5)),
      unreadCount: unread,
    };
  }

  useMessagesStore.setState({ conversations: next });
}

function clearMockConversations(): void {
  const store = useMessagesStore.getState();
  const next = Object.fromEntries(
    Object.entries(store.conversations).filter(([id]) => !id.startsWith("mock-dm-"))
  );
  useMessagesStore.setState({ conversations: next });
}

function injectMockGroups(count: number): void {
  const store = useGroupsStore.getState();
  const existing = Object.keys(store.groups);
  const mockIds = existing.filter((id) => id.startsWith("mock-group-"));
  const nextIndex = mockIds.length;

  const next: typeof store.groups = { ...store.groups };
  for (let i = 0; i < count; i++) {
    const idx = nextIndex + i;
    const groupId = `mock-group-${idx}`;
    const name = `${pickRandom(MOCK_GROUP_NAMES, idx)} ${idx > MOCK_GROUP_NAMES.length ? idx : ""}`.trim();
    const lastContent = pickRandom(MOCK_LAST_MESSAGES, idx * 11 + 5);
    const unread = idx % 3 === 0 ? Math.floor(Math.random() * 12) + 1 : 0;
    next[groupId] = {
      groupId,
      name,
      createdAt: new Date(Date.now() - idx * 86_400_000).toISOString(),
      cryptoEpoch: 0,
      members: [],
      memberDeviceLabels: {},
      messages: [
        {
          id: `mock-gmsg-${idx}`,
          senderDeviceId: `mock-device-${idx}`,
          senderLabel: pickRandom(MOCK_USERNAMES, idx * 3),
          content: lastContent,
          timestamp: Date.now() - (count - i) * 60_000 * (1 + (idx % 7)),
          status: "delivered",
          isOwn: false,
          rawType: "group.message",
        },
      ],
      lastMessageAt: Date.now() - (count - i) * 60_000 * (1 + (idx % 7)),
      unreadCount: unread,
      historyLoaded: false,
    };
  }

  useGroupsStore.setState({ groups: next });
}

function clearMockGroups(): void {
  const store = useGroupsStore.getState();
  const next = Object.fromEntries(
    Object.entries(store.groups).filter(([id]) => !id.startsWith("mock-group-"))
  );
  useGroupsStore.setState({ groups: next });
}

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
  const [chatMockCount, setChatMockCount] = useState(20);
  const [showStorage, setShowStorage] = useState(false);
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
    if (!globalThis.confirm(t("dev.confirmClearAll"))) return;
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
    <div className={styles.root}>
      {open && (
        <div className={`${styles.panel} ${showStorage ? styles.panelWide : ""}`}>
          <div className={styles.panelTitle}>{t("dev.title")}</div>

          {/* ── Info ─────────────────────────────────────── */}
          <div className={styles.infoBlock}>
            <div><span className={styles.infoLabel}>{t("dev.userId")}</span> {userId ?? "—"}</div>
            <div style={{ wordBreak: "break-all" }}>
              <span className={styles.infoLabel}>{t("dev.deviceId")}</span>{" "}
              {deviceId ? deviceId.slice(0, 8) + "…" : "—"}
            </div>
            <div>
              <span className={styles.infoLabel}>{t("dev.storageKey")}</span>{" "}
              <span className={storageKeyPresent ? styles.statusOk : styles.statusErr}>
                {storageKeyPresent ? t("dev.present") : t("dev.missing")}
              </span>
            </div>
            <div>
              <span className={styles.infoLabel}>{t("dev.ws")}</span>{" "}
              <span className={wsConnected ? styles.statusOk : styles.statusErr}>
                {wsConnected ? t("dev.connected") : t("dev.disconnected")}
              </span>
            </div>
          </div>

          {/* ── Chat list mock ───────────────────────── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Chat List Mock</div>
            <div className={styles.row}>
              <input
                type="number"
                min={1}
                max={500}
                value={chatMockCount}
                onChange={(e) => setChatMockCount(Math.max(1, Math.min(500, Number(e.target.value))))}
                className={styles.numberInput}
              />
              <span className={styles.numberInputLabel}>each</span>
            </div>
            <div className={styles.btnRow}>
              <button
                onClick={() => injectMockConversations(chatMockCount)}
                className={`${styles.btn} ${styles.btnFlex} ${styles.btnViolet}`}
              >
                + DMs
              </button>
              <button
                onClick={() => injectMockGroups(chatMockCount)}
                className={`${styles.btn} ${styles.btnFlex} ${styles.btnViolet}`}
              >
                + Groups
              </button>
            </div>
            <div className={styles.btnRow}>
              <button
                onClick={clearMockConversations}
                className={`${styles.btn} ${styles.btnFlex} ${styles.btnMuted}`}
              >
                Clear DMs
              </button>
              <button
                onClick={clearMockGroups}
                className={`${styles.btn} ${styles.btnFlex} ${styles.btnMuted}`}
              >
                Clear Groups
              </button>
            </div>
          </div>

          {/* ── Group call mock participants ──────────── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Group Call Mock</div>
            <div className={styles.row}>
              <input
                type="number"
                min={1}
                max={50}
                value={mockCount}
                onChange={(e) => setMockCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                className={styles.numberInput}
              />
              <span className={styles.numberInputLabel}>participants</span>
            </div>
            <div className={styles.btnRow}>
              <button
                onClick={() => callDebugWindow.__scInjectMockParticipants?.(mockCount)}
                className={`${styles.btn} ${styles.btnFlex} ${styles.btnViolet}`}
              >
                Spawn
              </button>
              <button
                onClick={() => callDebugWindow.__scClearMockParticipants?.()}
                className={`${styles.btn} ${styles.btnFlex} ${styles.btnMuted}`}
              >
                Clear
              </button>
            </div>
          </div>

          {/* ── Room call ─────────────────────────────── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Room Call</div>
            <button
              onClick={() => callDebugWindow.__scCreateRoom?.()}
              className={`${styles.btn} ${styles.btnFull} ${styles.btnPrimary}`}
            >
              Create room…
            </button>
          </div>

          {/* ── Storage inspector ─────────────────────── */}
          <div className={styles.section}>
            <button
              onClick={() => setShowStorage((v) => !v)}
              className={`${styles.btnToggle} ${showStorage ? styles.btnToggleActive : ""}`}
            >
              {showStorage ? "▲ Hide storage" : "▼ Inspect stored data"}
            </button>
            {showStorage && (
              <div className={styles.storageWrap}>
                <StorageInspector />
              </div>
            )}
          </div>

          {/* ── Actions ───────────────────────────────── */}
          <div className={styles.btnGroup}>
            <button
              onClick={() => void clearAllData()}
              disabled={clearing}
              className={`${styles.btn} ${styles.btnDanger}`}
            >
              {clearing ? t("dev.clearing") : t("dev.clearAllData")}
            </button>
            <button
              onClick={copyDebugInfo}
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              {t("dev.copyDebugInfo")}
            </button>
            <button
              onClick={() => void copyCallSnapshot()}
              className={`${styles.btn} ${styles.btnTeal}`}
            >
              {t("dev.copyCallSnapshot")}
            </button>
            <button
              onClick={() => void dumpCallSnapshot()}
              className={`${styles.btn} ${styles.btnSlate}`}
            >
              {t("dev.dumpCallSnapshot")}
            </button>
            <button
              onClick={toggleCallDebug}
              className={`${styles.btn} ${callDebugEnabled ? styles.btnSuccess : styles.btnMuted}`}
            >
              {callDebugEnabled ? t("dev.callDebugDisable") : t("dev.callDebugEnable")}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title={t("dev.title")}
        className={`${styles.fab} ${open ? styles.fabActive : ""}`}
      >
        ⚙
      </button>
    </div>
  );
}
