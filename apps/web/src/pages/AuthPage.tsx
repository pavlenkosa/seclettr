import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { LabelPill } from "@/components/ui";
import { useI18n } from "@/i18n";
import { getAuthErrorCode, mapAuthErrorMessage, shouldShowAuthErrorDetails } from "@/lib/auth-errors";
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

export function AuthPage() {
  const { t } = useI18n();
  const { register, login, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const normalizedUsername = username.trim();
  const isUsernamePatternValid = normalizedUsername.length === 0 || USERNAME_PATTERN.test(normalizedUsername);
  const canSubmit = !loading
    && normalizedUsername.length >= 3
    && normalizedUsername.length <= 32
    && isUsernamePatternValid
    && password.length >= 8;
  const friendlyError = mapAuthErrorMessage(error, t);
  const showTechnicalError = shouldShowAuthErrorDetails(error);
  const errorDetail = showTechnicalError ? error : getAuthErrorCode(error);
  const isLogin = mode === "login";
  const submitLabel = mode === "login" ? t("auth.submit.signIn") : t("auth.submit.createAccount");

  useEffect(() => {
    if (!error) return;
    errorAlertRef.current?.focus();
  }, [error]);

  const setAuthMode = (nextMode: Mode) => {
    setMode(nextMode);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    clearError();
    setLoading(true);
    try {
      const deviceName = getDeviceName();
      if (mode === "register") {
        await register(normalizedUsername, password, deviceName);
      } else {
        await login(normalizedUsername, password, deviceName);
      }
    } catch {
      // error is in store
    } finally {
      setLoading(false);
    }
  };

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
          <form onSubmit={handleSubmit} className={styles.form}>
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
