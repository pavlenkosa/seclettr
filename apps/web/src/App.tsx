import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { AppErrorFallback, ErrorBoundary } from "./components/common/ErrorBoundary";
import { LockScreen } from "./components/common/LockScreen";
import { useI18n } from "./i18n";
import { useInactivityLock } from "./lib/useInactivityLock";
import { AuthPage } from "./pages/AuthPage";
import { AuthRecoveryPage } from "./pages/AuthRecoveryPage";
import { RoomJoinPage } from "./pages/RoomJoinPage";
import { useAuthStore } from "./stores/auth";
import { useMessagesStore } from "./stores/messages";
import { useGroupsStore } from "./stores/groups";
import { usePlainMessagesStore, usePlainGroupsStore } from "./stores/plain";

/** 15 minutes — configurable in Settings (future). */
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const ChatPage = lazy(() =>
  import("./pages/ChatPage").then(({ ChatPage: C }) => ({ default: C }))
);
const DevToolsPanel = import.meta.env.DEV
  ? lazy(() => import("./components/DevToolsPanel").then(({ DevToolsPanel: C }) => ({ default: C })))
  : null;
const UIKitPage = import.meta.env.DEV
  ? lazy(() => import("./pages/UIKitPage").then(({ UIKitPage: C }) => ({ default: C })))
  : null;

const DEVTOOLS_VISIBILITY_KEY = "seclettr.devtools.visible.v1";

interface AppRouteElementsOptions {
  readonly hasActiveSession: boolean;
  readonly shouldForceRecovery: boolean;
  readonly loadingFallback: ReactNode;
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
    : <AuthPage />;
}

function renderChatRouteElement({
  hasActiveSession,
  shouldForceRecovery,
  loadingFallback,
}: AppRouteElementsOptions): ReactNode {
  if (shouldForceRecovery) {
    return <Navigate to="/auth/recovery" replace />;
  }

  return hasActiveSession
    ? (
      <Suspense fallback={loadingFallback}>
        <ChatPage />
      </Suspense>
    )
    : <Navigate to="/auth" replace />;
}


export function App() {
  const { t } = useI18n();
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

  const hasActiveSession = authLifecycle === "ready" && Boolean(userId && identityDhKeyPair);
  const isSessionLocked = authLifecycle === "locked" && pinEnabled && Boolean(userId);
  const isBootstrapping = authLifecycle === "restoring";
  const shouldForceRecovery = authLifecycle === "recovery_required";
  const isUnlocking = authOperation === "unlocking";

  const [isDevToolsVisible, setIsDevToolsVisible] = useState(() => readDevToolsVisibility());
  const hasStarted = useRef(false);
  const loadingFallback = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-secondary)",
        fontSize: "0.875rem",
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      {t("app.loading")}
    </div>
  );

  const handleLock = useCallback(() => {
    void lock();
  }, [lock]);

  useInactivityLock({
    enabled: hasActiveSession && pinEnabled,
    timeoutMs: LOCK_TIMEOUT_MS,
    onLock: handleLock,
  });


  useEffect(() => {
    const stopMessagesListening = useMessagesStore.getState().startListening();
    const stopGroupsListening = useGroupsStore.getState().startListening();
    const stopPlainMessagesListening = usePlainMessagesStore.getState().subscribe();
    const stopPlainGroupsListening = usePlainGroupsStore.getState().subscribe();
    return () => {
      stopMessagesListening();
      stopGroupsListening();
      stopPlainMessagesListening();
      stopPlainGroupsListening();
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
      <LockScreen
        username={username}
        isUnlocking={isUnlocking}
        pinWrong={authError === "pin_wrong"}
        onUnlock={(pin) => {
          clearError();
          void unlock(pin);
        }}
        onLogout={() => {
          void logout();
        }}
      />
    );
  }

  if (isBootstrapping) {
    return loadingFallback;
  }

  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
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
            element={<RoomJoinPage />}
          />

          <Route
            path="/auth/recovery"
            element={hasActiveSession ? <Navigate to="/" replace /> : <AuthRecoveryPage />}
          />

          <Route
            path="/auth"
            element={renderAuthRouteElement({ hasActiveSession, shouldForceRecovery, loadingFallback })}
          />

          <Route
            path="/*"
            element={renderChatRouteElement({ hasActiveSession, shouldForceRecovery, loadingFallback })}
          />
        </Routes>
      </BrowserRouter>

      {DevToolsPanel && isDevToolsVisible ? (
        <Suspense fallback={null}>
          <DevToolsPanel />
        </Suspense>
      ) : null}
    </ErrorBoundary>
  );
}
