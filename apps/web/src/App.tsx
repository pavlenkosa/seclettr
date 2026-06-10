/**
 * App — top-level web shell and route gate.
 *
 * Owns:
 *   - initial app boot skeleton and route gating
 *   - auth/lock/recovery route decisions
 *   - one-shot session restore kickoff
 *   - app-level realtime listener attachment
 *   - lazy route prefetching and devtools visibility
 *   - non-blocking client runtime bootstrap for push/native bridges
 *
 * Does not own:
 *   - auth lifecycle semantics
 *   - chat page runtime
 *   - room/direct/group call runtime
 *   - settings/chat presentation internals
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { AppErrorFallback, ErrorBoundary } from "./components/common/ErrorBoundary";
import { AppBootSkeleton } from "./components/common/AppBootSkeleton";
import { startAppRealtimeListeners } from "./lib/app-realtime-bootstrap";
import { formatBootDiagnostics, getBootDiagnosticsSnapshot } from "./lib/boot-diagnostics";
import { IS_DIAGNOSTIC_BUILD } from "./lib/diagnostic-mode";
import { logger } from "./lib/logger.js";
import { useInactivityLock } from "./lib/useInactivityLock";
import { useAppForegroundResync } from "./lib/useAppForegroundResync";
import { useAuthStore } from "./stores/auth";
import { useI18n } from "./i18n";

/** 15 minutes — configurable in Settings (future). */
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const ChatPage = lazy(() =>
  import("./pages/ChatPage").then(({ ChatPage: C }) => ({ default: C }))
);
const AuthPage = lazy(() =>
  import("./pages/AuthPage").then(({ AuthPage: C }) => ({ default: C }))
);
const AuthRecoveryPage = lazy(() =>
  import("./pages/AuthRecoveryPage").then(({ AuthRecoveryPage: C }) => ({ default: C }))
);
const RoomJoinPage = lazy(() =>
  import("./pages/RoomJoinPage").then(({ RoomJoinPage: C }) => ({ default: C }))
);
const LockScreen = lazy(() =>
  import("./components/common/LockScreen").then(({ LockScreen: C }) => ({ default: C }))
);
const DevToolsPanel = import.meta.env.DEV
  ? lazy(() => import("./components/DevToolsPanel").then(({ DevToolsPanel: C }) => ({ default: C })))
  : null;
const UIKitPage = import.meta.env.DEV
  ? lazy(() => import("./pages/UIKitPage").then(({ UIKitPage: C }) => ({ default: C })))
  : null;

const DEVTOOLS_VISIBILITY_KEY = "seclettr.devtools.visible.v1";

// ── Diagnostic overlay (diagnostic builds only) ───────────────────────────

const diagShell: CSSProperties = {
  position: "fixed",
  bottom: "calc(var(--safe-bottom, 0px) + 12px)",
  right: "12px",
  zIndex: 999999,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "8px",
  pointerEvents: "none",
};
const diagTrace: CSSProperties = {
  pointerEvents: "all",
  background: "rgba(0,0,0,0.94)",
  color: "#a8ff78",
  fontFamily: "monospace",
  fontSize: "10px",
  lineHeight: "1.45",
  padding: "10px 12px",
  borderRadius: "12px",
  maxWidth: "min(92vw, 400px)",
  maxHeight: "55vh",
  overflowY: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  border: "1px solid rgba(168,255,120,0.28)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.7)",
};
const diagRow: CSSProperties = {
  display: "flex",
  gap: "6px",
  pointerEvents: "all",
};
const diagBtn = (accent?: boolean, active?: boolean): CSSProperties => ({
  padding: "6px 12px",
  background: accent
    ? "rgba(220,50,50,0.92)"
    : active ? "rgba(60,180,60,0.88)" : "rgba(20,20,20,0.88)",
  color: "#fff",
  border: accent ? "none" : "1px solid rgba(255,255,255,0.22)",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
});

function DiagBootOverlay() {
  const [open, setOpen] = useState(false);
  const [trace, setTrace] = useState("");
  const [copied, setCopied] = useState(false);

  const handleToggle = () => {
    if (!open) {
      setTrace(formatBootDiagnostics() || "(no events yet — restore may not have run)");
    }
    setOpen((v) => !v);
  };

  const handleCopy = () => {
    if (!trace || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(trace).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 2200);
    });
  };

  const hasEvents = getBootDiagnosticsSnapshot().length > 0;

  return (
    <div style={diagShell}>
      {open ? (
        <div style={diagTrace}>{trace}</div>
      ) : null}
      <div style={diagRow}>
        {open ? (
          <button type="button" style={diagBtn(false, copied)} onClick={handleCopy}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        ) : null}
        <button
          type="button"
          style={{ ...diagBtn(true), outline: hasEvents ? "2px solid #a8ff78" : "none" }}
          onClick={handleToggle}
        >
          {open ? "✕ DIAG" : "DIAG"}
        </button>
      </div>
    </div>
  );
}

interface AppRouteElementsOptions {
  readonly hasActiveSession: boolean;
  readonly shouldForceRecovery: boolean;
}

function readDevToolsVisibility(): boolean {
  if (!import.meta.env.DEV || globalThis.window === undefined) {
    return false;
  }

  const params = new URLSearchParams(globalThis.location.search);
  if (params.get("devtools") === "1") {
    try {
      localStorage.setItem(DEVTOOLS_VISIBILITY_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }

  try {
    return localStorage.getItem(DEVTOOLS_VISIBILITY_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDevToolsVisibility(visible: boolean): void {
  if (globalThis.window === undefined) {
    return;
  }
  try {
    localStorage.setItem(DEVTOOLS_VISIBILITY_KEY, visible ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function renderAuthRouteElement({
  hasActiveSession,
  shouldForceRecovery,
}: AppRouteElementsOptions): ReactNode {
  if (shouldForceRecovery) {
    return <Navigate to="/auth/recovery" replace />;
  }

  return hasActiveSession
    ? <Navigate to="/" replace />
    : (
      <Suspense fallback={null}>
        <AuthPage />
      </Suspense>
    );
}

function renderAuthRecoveryRouteElement({
  hasActiveSession,
}: Pick<AppRouteElementsOptions, "hasActiveSession">): ReactNode {
  return hasActiveSession
    ? <Navigate to="/" replace />
    : (
      <Suspense fallback={null}>
        <AuthRecoveryPage />
      </Suspense>
    );
}

function renderRoomJoinRouteElement(_loadingFallback: ReactNode): ReactNode {
  return (
    <Suspense fallback={null}>
      <RoomJoinPage />
    </Suspense>
  );
}

function renderChatRouteElement({
  hasActiveSession,
  shouldForceRecovery,
}: AppRouteElementsOptions): ReactNode {
  if (shouldForceRecovery) {
    return <Navigate to="/auth/recovery" replace />;
  }

  return hasActiveSession
    ? (
      <Suspense fallback={null}>
        <ChatPage />
      </Suspense>
    )
    : <Navigate to="/auth" replace />;
}


export function App() {
  const {
    authLifecycle,
    authOperation,
    userId,
    username,
    identityDhKeyPair,
    pinEnabled,
    error: authError,
    tryRestoreSession,
    lock,
    unlock,
    logout,
    clearError,
  } = useAuthStore(useShallow((state) => ({
    authLifecycle: state.authLifecycle,
    authOperation: state.authOperation,
    userId: state.userId,
    username: state.username,
    identityDhKeyPair: state.identityDhKeyPair,
    pinEnabled: state.pinEnabled,
    error: state.error,
    tryRestoreSession: state.tryRestoreSession,
    lock: state.lock,
    unlock: state.unlock,
    logout: state.logout,
    clearError: state.clearError,
  })));

  const { t } = useI18n();

  const hasActiveSession = authLifecycle === "ready" && Boolean(userId && identityDhKeyPair);
  const isSessionLocked = authLifecycle === "locked" && pinEnabled && Boolean(userId);
  const isBootstrapping = authLifecycle === "restoring";
  const shouldForceRecovery = authLifecycle === "recovery_required";
  const isUnlocking = authOperation === "unlocking";
  const lockErrorMessage = authError === "network_error" ? t("lock.pin.networkError") : undefined;

  const [isDevToolsVisible, setIsDevToolsVisible] = useState(() => readDevToolsVisibility());
  const hasStarted = useRef(false);
  // bootFallback: shown only during initial session restore and the lock screen Suspense boundary.
  // routeFallback: null — route chunks are prefetched immediately so Suspense resolves instantly;
  //   using null avoids the skeleton appearing a second time and re-triggering its entry animation.
  const bootFallback = <AppBootSkeleton />;
  const loadingFallback = bootFallback;

  const handleLock = useCallback(() => {
    void lock();
  }, [lock]);

  const copyBootDiagnostics = useCallback(() => {
    const diagnostics = formatBootDiagnostics();
    if (!diagnostics || !navigator.clipboard?.writeText) {
      return;
    }
    void navigator.clipboard.writeText(diagnostics);
  }, []);

  useInactivityLock({
    enabled: hasActiveSession && pinEnabled,
    timeoutMs: LOCK_TIMEOUT_MS,
    onLock: handleLock,
  });

  // Force a token refresh + WS reconnect when the app returns to the foreground
  // after being backgrounded (critical on Android where the OS kills WebSockets).
  useAppForegroundResync(hasActiveSession);

  useEffect(() => {
    let cancelled = false;

    void import("./lib/app-client-runtime-bootstrap")
      .then(({ initAppClientRuntime }) => {
        if (!cancelled) {
          initAppClientRuntime();
        }
      })
      .catch((error) => {
        logger.error("[app] failed to initialize app client runtime", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Prefetch route chunks immediately so they are ready before isBootstrapping flips
  // to false — this prevents Suspense fallbacks from showing and avoids a second
  // skeleton appearance after the boot skeleton dismisses.
  useEffect(() => {
    void import("./pages/ChatPage");
    void import("./pages/AuthPage");
    void import("./pages/AuthRecoveryPage");
    void import("./pages/RoomJoinPage");
  }, []);

  useEffect(() => {
    let stopRealtimeListeners: (() => void) | null = null;

    try {
      stopRealtimeListeners = startAppRealtimeListeners();
    } catch (error) {
      logger.error("[app] failed to attach realtime listeners", error);
    }

    return () => {
      stopRealtimeListeners?.();
    };
  }, []);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    void tryRestoreSession();
  }, [tryRestoreSession]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      const isToggleShortcut = event.shiftKey && event.key.toLowerCase() === "m";

      if (!isToggleShortcut) {
        return;
      }

      event.preventDefault();
      setIsDevToolsVisible((current) => {
        const nextValue = !current;
        writeDevToolsVisibility(nextValue);
        return nextValue;
      });
    }

    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isSessionLocked) {
    return (
      <Suspense fallback={loadingFallback}>
        <LockScreen
          username={username}
          isUnlocking={isUnlocking}
          pinWrong={authError === "pin_wrong"}
          errorMessage={lockErrorMessage}
          onUnlock={(pin) => {
            clearError();
            void unlock(pin);
          }}
          onLogout={() => {
            void logout();
          }}
        />
      </Suspense>
    );
  }

  if (isBootstrapping) {
    if (authError === "network_error") {
      return (
        <AppBootSkeleton
          offline
          onRetry={() => { void tryRestoreSession(); }}
          diagnosticsText={IS_DIAGNOSTIC_BUILD ? formatBootDiagnostics() : null}
          onCopyDiagnostics={IS_DIAGNOSTIC_BUILD ? copyBootDiagnostics : undefined}
        />
      );
    }
    return loadingFallback;
  }

  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      {/* Key forces a fresh mount (and thus fade-in) each time we leave the boot skeleton. */}
      <div key="app-shell" style={{ display: "contents", animation: "appShellFadeIn 220ms ease both" }}>
      <BrowserRouter>
        <Routes>
          {UIKitPage ? (
            <Route
              path="/ui-kit"
              element={(
                <Suspense fallback={loadingFallback}>
                  <UIKitPage />
                </Suspense>
              )}
            />
          ) : null}

          <Route
            path="/room/:token"
            element={renderRoomJoinRouteElement(null)}
          />

          <Route
            path="/auth/recovery"
            element={renderAuthRecoveryRouteElement({ hasActiveSession })}
          />

          <Route
            path="/auth"
            element={renderAuthRouteElement({ hasActiveSession, shouldForceRecovery })}
          />

          <Route
            path="/*"
            element={renderChatRouteElement({ hasActiveSession, shouldForceRecovery })}
          />
        </Routes>
      </BrowserRouter>

      {DevToolsPanel && isDevToolsVisible ? (
        <Suspense fallback={null}>
          <DevToolsPanel />
        </Suspense>
      ) : null}

      {IS_DIAGNOSTIC_BUILD ? <DiagBootOverlay /> : null}
      </div>
    </ErrorBoundary>
  );
}
