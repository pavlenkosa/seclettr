/**
 * Dev-only floating panel for clearing browser state and viewing debug info.
 * Renders only when import.meta.env.DEV is true.
 */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import { useMessagesStore } from "@/stores/messages";
import { useGroupsStore } from "@/stores/groups";
import { CALL_MEDIA_DEBUG_ENABLED_KEY } from "@/calls/shared/media/call-media-debug";
import { GroupCallNotice } from "@/calls/group/presentation/GroupCallNotice";
import { StorageInspector } from "./StorageInspector";
import { StatusBadge } from "./ui/feedback/StatusBadge";
import { LabelPill } from "./ui/feedback/LabelPill";
import { IconPill } from "./ui/actions/IconPill";
import { SecurityModeBadge } from "./ui/feedback/SecurityModeBadge";
import { InlineNotice } from "./ui/feedback/InlineNotice";
import styles from "./DevToolsPanel.module.css";

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

export function DevToolsPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mockCount, setMockCount] = useState(5);
  const [chatMockCount, setChatMockCount] = useState(20);
  const [showStorage, setShowStorage] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [mockCallNotice, setMockCallNotice] = useState<{
    callType: "audio" | "video";
    status: "ringing" | "active";
  } | null>(null);
  const [mockMissedGroupBanner, setMockMissedGroupBanner] = useState(false);
  const [mockOtherGroupBanner, setMockOtherGroupBanner] = useState(false);
  const [mockMissedDirectBanner, setMockMissedDirectBanner] = useState(false);
  const [callDebugEnabled, setCallDebugEnabled] = useState(() => (
    localStorage.getItem(CALL_MEDIA_DEBUG_ENABLED_KEY) === "1"
  ));
  const userId = useAuthStore(s => s.userId);
  const deviceId = useAuthStore(s => s.deviceId);
  const storageKey = useAuthStore(s => s.storageKey);

  const storageKeyPresent = Boolean(storageKey);
  const wsConnected = wsClient.connected;
  useEffect(() => {
    const fromCallBanner = window.__scIsCallDebugEnabled?.();
    if (typeof fromCallBanner === "boolean") {
      setCallDebugEnabled(fromCallBanner);
    }
  }, []);
  const handleDumpCallSnapshot = useCallback(async () => {
    if (!window.__scDumpCallDebug) {
      return;
    }
    await window.__scDumpCallDebug();
  }, []);

  async function clearAllData() {
    if (!window.confirm("Are you sure you want to clear all data?")) return;
    localStorage.clear();
    window.location.reload();
  }

  function copyDebugInfo() {
    const info = {
      userId,
      deviceId,
      storageKeyPresent,
      wsConnected,
      userAgent: navigator.userAgent,
    };
    void navigator.clipboard.writeText(JSON.stringify(info, null, 2));
  }

  async function copyCallSnapshot() {
    const snapshot = await window.__scGetCallDebugSnapshot?.();
    if (!snapshot) return;
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
  }

  function toggleCallDebug() {
    const next = !callDebugEnabled;
    window.__scSetCallDebugEnabled?.(next);
    localStorage.setItem(CALL_MEDIA_DEBUG_ENABLED_KEY, next ? "1" : "0");
    setCallDebugEnabled(next);
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
                onClick={() => window.__scInjectMockParticipants?.(mockCount)}
                className={`${styles.btn} ${styles.btnFlex} ${styles.btnViolet}`}
              >
                Spawn
              </button>
              <button
                onClick={() => window.__scClearMockParticipants?.()}
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
              onClick={() => window.__scCreateRoom?.()}
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

          {/* ── Call UI preview ───────────────────────── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>GroupCallNotice</div>
            <div className={styles.btnRow}>
              {(["audio", "video"] as const).map((ct) =>
                (["ringing", "active"] as const).map((st) => {
                  const active = mockCallNotice?.callType === ct && mockCallNotice?.status === st;
                  return (
                    <button
                      key={`${ct}-${st}`}
                      onClick={() => setMockCallNotice(active ? null : { callType: ct, status: st })}
                      className={`${styles.btn} ${styles.btnFlex} ${active ? styles.btnSuccess : styles.btnMuted}`}
                      style={{ fontSize: 10 }}
                    >
                      {ct === "video" ? "📹" : "📞"} {st}
                    </button>
                  );
                })
              )}
            </div>
            {mockCallNotice && (
              <div className={styles.callNoticePreview}>
                <GroupCallNotice
                  callType={mockCallNotice.callType}
                  status={mockCallNotice.status}
                  callerLabel="alice"
                  participantCount={3}
                  onJoin={() => setMockCallNotice(null)}
                />
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Alert banners (fixed, top-center)</div>
            <div className={styles.btnRow}>
              <button
                onClick={() => setMockMissedGroupBanner((v) => !v)}
                className={`${styles.btn} ${styles.btnFlex} ${mockMissedGroupBanner ? styles.btnSuccess : styles.btnMuted}`}
                style={{ fontSize: 10 }}
              >
                Пропущенный
              </button>
              <button
                onClick={() => setMockOtherGroupBanner((v) => !v)}
                className={`${styles.btn} ${styles.btnFlex} ${mockOtherGroupBanner ? styles.btnSuccess : styles.btnMuted}`}
                style={{ fontSize: 10 }}
              >
                Другая группа
              </button>
              <button
                onClick={() => setMockMissedDirectBanner((v) => !v)}
                className={`${styles.btn} ${styles.btnFlex} ${mockMissedDirectBanner ? styles.btnSuccess : styles.btnMuted}`}
                style={{ fontSize: 10 }}
              >
                Пропущен 1:1
              </button>
            </div>
          </div>

          {/* ── Badge showcase ────────────────────────── */}
          <div className={styles.section}>
            <button
              onClick={() => setShowBadges((v) => !v)}
              className={`${styles.btnToggle} ${showBadges ? styles.btnToggleActive : ""}`}
            >
              {showBadges ? "▲ Hide badges" : "▼ Badge showcase"}
            </button>
            {showBadges && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div className={styles.sectionLabel}>StatusBadge — tones (sm)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <StatusBadge tone="neutral">neutral</StatusBadge>
                    <StatusBadge tone="accent">accent</StatusBadge>
                    <StatusBadge tone="success">success</StatusBadge>
                    <StatusBadge tone="warning">warning</StatusBadge>
                    <StatusBadge tone="danger">danger</StatusBadge>
                  </div>
                </div>
                <div>
                  <div className={styles.sectionLabel}>StatusBadge — sizes · dot · icon</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <StatusBadge size="sm">sm</StatusBadge>
                    <StatusBadge size="md">md</StatusBadge>
                    <StatusBadge size="lg">lg</StatusBadge>
                    <StatusBadge tone="success" dot>dot</StatusBadge>
                    <StatusBadge tone="accent" icon="🔒">icon</StatusBadge>
                  </div>
                </div>
                <div>
                  <div className={styles.sectionLabel}>LabelPill — default</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <LabelPill size="xs">xs</LabelPill>
                    <LabelPill size="sm">sm</LabelPill>
                    <LabelPill size="md">md</LabelPill>
                  </div>
                </div>
                <div>
                  <div className={styles.sectionLabel}>LabelPill — overlay</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", background: "#1a1a2e", padding: "6px 8px", borderRadius: 4 }}>
                    <LabelPill tone="overlay" size="xs">xs</LabelPill>
                    <LabelPill tone="overlay" size="sm">sm</LabelPill>
                    <LabelPill tone="overlay" size="md">md</LabelPill>
                  </div>
                </div>
                <div>
                  <div className={styles.sectionLabel}>IconPill</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <IconPill icon="🔒" size="sm">sm</IconPill>
                    <IconPill icon="📹" size="md">md</IconPill>
                  </div>
                </div>
                <div>
                  <div className={styles.sectionLabel}>SecurityModeBadge</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <SecurityModeBadge tone="frame">Frame</SecurityModeBadge>
                    <SecurityModeBadge tone="transport">Transport</SecurityModeBadge>
                  </div>
                </div>
                <div>
                  <div className={styles.sectionLabel}>InlineNotice — sm / md</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <InlineNotice tone="info" size="sm">info · sm</InlineNotice>
                    <InlineNotice tone="warning" size="sm">warning · sm</InlineNotice>
                    <InlineNotice tone="error" size="sm">error · sm</InlineNotice>
                    <InlineNotice tone="info" size="md">info · md</InlineNotice>
                    <InlineNotice tone="warning" size="md">warning · md</InlineNotice>
                    <InlineNotice tone="error" size="md">error · md</InlineNotice>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Actions ───────────────────────────────── */}
          <div className={styles.btnGroup}>
            <button
              onClick={() => void clearAllData()}
              className={`${styles.btn} ${styles.btnDanger}`}
            >
              {t("dev.clearAllData")}
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
              onClick={() => void handleDumpCallSnapshot()}
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

      {(mockMissedGroupBanner || mockOtherGroupBanner || mockMissedDirectBanner) && (
        <div className={styles.mockAlertOverlay}>
          {mockMissedGroupBanner && (
            <div className={`${styles.mockAlertBanner} ${styles.mockAlertBannerMissed}`} role="alert">
              <span className={styles.mockAlertText}>Пропущенный групповой звонок</span>
              <div style={{ display: "flex", gap: "0.36rem", flexShrink: 0 }}>
                <button className={styles.mockAlertDismiss} onClick={() => setMockMissedGroupBanner(false)}>Скрыть</button>
              </div>
            </div>
          )}
          {mockOtherGroupBanner && (
            <div className={styles.mockAlertBanner} role="alert">
              <span className={styles.mockAlertText}>Идёт звонок в Design Reviews</span>
              <div style={{ display: "flex", gap: "0.36rem", flexShrink: 0 }}>
                <button className={styles.mockAlertBtn} onClick={() => setMockOtherGroupBanner(false)}>Перейти</button>
              </div>
            </div>
          )}
          {mockMissedDirectBanner && (
            <div className={`${styles.mockAlertBanner} ${styles.mockAlertBannerMissed}`} role="alert">
              <span className={styles.mockAlertText}>Пропущенный звонок от alice</span>
              <div style={{ display: "flex", gap: "0.36rem", flexShrink: 0 }}>
                <button className={styles.mockAlertDismiss} onClick={() => setMockMissedDirectBanner(false)}>Скрыть</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
