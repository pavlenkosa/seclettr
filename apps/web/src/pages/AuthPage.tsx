import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { LabelPill } from "@/components/ui";
import { useI18n } from "@/i18n";
import { getAuthErrorCode, mapAuthErrorMessage, shouldShowAuthErrorDetails } from "@/lib/auth-errors";
import {
  getNativeServerUrl,
  isNativePlatform,
  setNativeServerUrl,
} from "@/lib/native-platform";
import { useAuthStore } from "@/stores/auth";
import { AuthCard } from "./auth/AuthCard";
import { AuthErrorNotice } from "./auth/AuthErrorNotice";
import { AuthFormFooter } from "./auth/AuthFormFooter";
import { AuthPasswordField } from "./auth/AuthPasswordField";
import { AuthUsernameField } from "./auth/AuthUsernameField";
import styles from "./AuthPage.module.css";

type Mode = "login" | "register";
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Browser";
}

function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Returns true when the error string looks like a network-level failure
 * (server unreachable, DNS, connection refused) rather than an API error.
 * Covers browser-specific wording: Chrome "Failed to fetch", Safari "Load failed",
 * Firefox "NetworkError when attempting to fetch resource".
 */
function isNetworkError(error: string): boolean {
  const n = error.toLowerCase();
  return (
    n.includes("failed to fetch") ||
    n.includes("load failed") ||
    n.includes("networkerror") ||
    n.includes("network request failed") ||
    n.includes("err_connection_refused") ||
    n.includes("err_name_not_resolved") ||
    n.includes("err_internet_disconnected")
  );
}

// ── Native layout (full-screen, no card wrapper) ──────────────────────────

interface NativeAuthFormProps {
  readonly mode: Mode;
  readonly username: string;
  readonly password: string;
  readonly serverUrl: string;
  readonly loading: boolean;
  readonly canSubmit: boolean;
  readonly showPassword: boolean;
  readonly isUsernamePatternValid: boolean;
  readonly friendlyError: string | null;
  readonly rawError: string | null | undefined;
  readonly errorDetail: string | null | undefined;
  readonly errorAlertRef: React.RefObject<HTMLDivElement>;
  readonly onUsernameChange: (v: string) => void;
  readonly onPasswordChange: (v: string) => void;
  readonly onServerUrlChange: (v: string) => void;
  readonly onTogglePassword: () => void;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly onModeToggle: () => void;
}

function NativeAuthForm({
  mode,
  username,
  password,
  serverUrl,
  loading,
  canSubmit,
  showPassword,
  isUsernamePatternValid,
  friendlyError,
  rawError,
  errorDetail,
  errorAlertRef,
  onUsernameChange,
  onPasswordChange,
  onServerUrlChange,
  onTogglePassword,
  onSubmit,
  onModeToggle,
}: NativeAuthFormProps) {
  const { t } = useI18n();
  const isLogin = mode === "login";

  return (
    <div className={styles.nativeContainer}>
      <div className={styles.nativeTop}>
        <div className={styles.nativeLogo}>
          <img src="/favicon.svg" width="68" height="68" alt="" aria-hidden="true" className={styles.nativeLogoImg} />
        </div>
        <h1 className={styles.nativeTitle}>{t("common.appName")}</h1>
        <p className={styles.nativeSubtitle}>
          {isLogin ? t("auth.title.signIn") : t("auth.title.createAccount")}
        </p>
      </div>

      <form onSubmit={onSubmit} className={styles.nativeForm}>
        {/* Server URL field */}
        <div className={styles.nativeFieldGroup}>
          <label className={styles.nativeLabel} htmlFor="native-server">
            {t("auth.serverUrl")}
          </label>
          <input
            id="native-server"
            className={styles.nativeInput}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://my-server.com"
            value={serverUrl}
            onChange={(e) => onServerUrlChange(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        {/* Username field */}
        <div className={styles.nativeFieldGroup}>
          <label className={styles.nativeLabel} htmlFor="native-username">
            {t("auth.username")}
          </label>
          <input
            id="native-username"
            className={`${styles.nativeInput} ${!isUsernamePatternValid ? styles.nativeInputError : ""}`}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("auth.usernamePlaceholder")}
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            disabled={loading}
            minLength={3}
            maxLength={32}
            required
            aria-invalid={!isUsernamePatternValid}
          />
        </div>

        {/* Password field */}
        <div className={styles.nativeFieldGroup}>
          <label className={styles.nativeLabel} htmlFor="native-password">
            {t("auth.password")}
          </label>
          <div className={styles.nativePasswordWrapper}>
            <input
              id="native-password"
              className={styles.nativeInput}
              type={showPassword ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              disabled={loading}
              minLength={8}
              required
            />
            <button
              type="button"
              className={styles.nativePasswordToggle}
              onClick={onTogglePassword}
              aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {showPassword ? <EyeOffSvg /> : <EyeSvg />}
            </button>
          </div>
        </div>

        {/* Error */}
        {(friendlyError ?? rawError) ? (
          <div ref={errorAlertRef} tabIndex={-1} className={styles.nativeError} role="alert">
            {friendlyError ?? rawError}
            {errorDetail ? <span className={styles.nativeErrorDetail}>{errorDetail}</span> : null}
          </div>
        ) : null}

        <button
          type="submit"
          className={styles.nativeSubmit}
          disabled={!canSubmit || loading}
        >
          {loading
            ? t("auth.generatingKeys")
            : (isLogin ? t("auth.submit.signIn") : t("auth.submit.createAccount"))}
        </button>

        <p className={styles.nativeToggle}>
          {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
          <button type="button" className={styles.nativeToggleLink} onClick={onModeToggle}>
            {isLogin ? t("auth.createOne") : t("auth.signInLink")}
          </button>
        </p>

        {isLogin ? (
          <Link to="/auth/recovery" className={styles.nativeRecoveryLink}>
            {t("auth.helpCta")}
          </Link>
        ) : null}
      </form>

      <div className={styles.nativeFooter}>
        <LabelPill size="sm">{`v${__APP_VERSION__}`}</LabelPill>
        <LanguageSwitcher />
      </div>
    </div>
  );
}

function EyeSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  );
}

function EyeOffSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Main export ──────────────────────────────────────────────────────────

export function AuthPage() {
  const { t } = useI18n();
  const { register, login, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(() => getNativeServerUrl() ?? "");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);

  const normalizedUsername = username.trim();
  const isUsernamePatternValid = normalizedUsername.length === 0 || USERNAME_PATTERN.test(normalizedUsername);
  const native = isNativePlatform();
  const canSubmit = !loading
    && normalizedUsername.length >= 3
    && normalizedUsername.length <= 32
    && isUsernamePatternValid
    && password.length >= 8
    && (!native || serverUrl.trim().length > 0);

  const friendlyError = mapAuthErrorMessage(error, t);
  const showTechnicalError = shouldShowAuthErrorDetails(error);
  const errorDetail = showTechnicalError ? error : getAuthErrorCode(error);
  const isLogin = mode === "login";
  const submitLabel = mode === "login" ? t("auth.submit.signIn") : t("auth.submit.createAccount");

  const combinedError = serverError ?? friendlyError ?? error;
  const combinedErrorDetail = serverError ? null : errorDetail;

  useEffect(() => {
    if (!error && !serverError) return;
    errorAlertRef.current?.focus();
  }, [error, serverError]);

  const setAuthMode = (nextMode: Mode) => {
    setMode(nextMode);
    clearError();
    setServerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    clearError();
    setServerError(null);
    setLoading(true);

    try {
      // On native: validate and save server URL before attempting auth.
      // Reachability is verified implicitly — if the server is down the login
      // call will fail with a network error which we detect below.
      if (native) {
        const normalized = normalizeServerUrl(serverUrl);
        if (!normalized) {
          setServerError("Введите корректный URL сервера");
          return;
        }
        const currentStored = getNativeServerUrl();
        if (normalized !== currentStored) {
          setNativeServerUrl(normalized);
          setServerUrl(normalized);
        }
      }

      const deviceName = getDeviceName();
      if (mode === "register") {
        await register(normalizedUsername, password, deviceName);
      } else {
        await login(normalizedUsername, password, deviceName);
      }

      // Auth store catches network errors internally and stores them.
      // Surface them as a clearer server-unreachable message.
      const storeError = useAuthStore.getState().error;
      if (storeError && isNetworkError(storeError)) {
        clearError();
        setServerError("Сервер недоступен. Проверьте URL и подключение.");
      }
    } catch {
      // error is in store
    } finally {
      setLoading(false);
    }
  };

  // Native: full-screen layout with integrated server URL
  if (native) {
    return (
      <NativeAuthForm
        mode={mode}
        username={username}
        password={password}
        serverUrl={serverUrl}
        loading={loading}
        canSubmit={canSubmit}
        showPassword={showPassword}
        isUsernamePatternValid={isUsernamePatternValid}
        friendlyError={combinedError ?? null}
        rawError={error}
        errorDetail={combinedErrorDetail}
        errorAlertRef={errorAlertRef}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onServerUrlChange={(v) => { setServerUrl(v); setServerError(null); }}
        onTogglePassword={() => setShowPassword((v) => !v)}
        onSubmit={(e) => { void handleSubmit(e); }}
        onModeToggle={() => setAuthMode(isLogin ? "register" : "login")}
      />
    );
  }

  // Web: card layout (original)
  const recoveryLink = isLogin
    ? <Link to="/auth/recovery" className={styles.helpLink} onClick={() => clearError()}>{t("auth.helpCta")}</Link>
    : null;
  const modeToggle = isLogin
    ? (
        <>
          {t("auth.noAccount")}{" "}
          <button type="button" onClick={() => setAuthMode("register")} className={styles.link}>
            {t("auth.createOne")}
          </button>
        </>
      )
    : (
        <>
          {t("auth.hasAccount")}{" "}
          <button type="button" onClick={() => setAuthMode("login")} className={styles.link}>
            {t("auth.signInLink")}
          </button>
        </>
      );

  return (
    <div className={styles.container}>
      <AuthCard
        appName={t("common.appName")}
        actions={<LanguageSwitcher />}
        title={isLogin ? t("auth.title.signIn") : t("auth.title.createAccount")}
        subtitle={isLogin ? t("auth.subtitle.signIn") : t("auth.subtitle.createAccount")}
        body={(
          <form onSubmit={(e) => { void handleSubmit(e); }} className={styles.form}>
            <AuthUsernameField
              id="username"
              label={t("auth.username")}
              value={username}
              placeholder={t("auth.usernamePlaceholder")}
              invalid={!isUsernamePatternValid}
              onChange={(e) => setUsername(e.target.value)}
            />

            <AuthPasswordField
              id="password"
              label={t("auth.password")}
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={t("auth.passwordPlaceholder")}
              showPassword={showPassword}
              onChange={(e) => setPassword(e.target.value)}
              onToggle={() => setShowPassword((value) => !value)}
              showLabel={t("auth.showPassword")}
              hideLabel={t("auth.hidePassword")}
            />

            <AuthErrorNotice ref={errorAlertRef} message={friendlyError ?? error} detail={errorDetail} />

            <AuthFormFooter
              submitLabel={submitLabel}
              loadingLabel={t("auth.generatingKeys")}
              loading={loading}
              disabled={!canSubmit}
              recoveryLink={recoveryLink}
              modeToggle={modeToggle}
            />
          </form>
        )}
        footer={<footer className={styles.cardFooter}><LabelPill className={styles.versionBadge} size="sm">{`v${__APP_VERSION__}`}</LabelPill></footer>}
      />
    </div>
  );
}
