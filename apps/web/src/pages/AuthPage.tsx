import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { useI18n } from "@/i18n";
import { mapAuthErrorMessage, shouldShowAuthErrorDetails } from "@/lib/auth-errors";
import { useAuthStore } from "@/stores/auth";
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
  const canSubmit = (
    !loading
    && normalizedUsername.length >= 3
    && normalizedUsername.length <= 32
    && isUsernamePatternValid
    && password.length >= 8
  );
  const friendlyError = mapAuthErrorMessage(error, t);
  const showTechnicalError = shouldShowAuthErrorDetails(error);
  const submitLabel = mode === "login" ? t("auth.submit.signIn") : t("auth.submit.createAccount");

  useEffect(() => {
    if (!error) return;
    errorAlertRef.current?.focus();
  }, [error]);

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

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardTop}>
          <div className={styles.logo}>
            <span className={styles.logoMark} aria-hidden="true">
              <SeclettrMark decorative />
            </span>
            <span className={styles.logoName}>{t("common.appName")}</span>
          </div>
          <LanguageSwitcher />
        </div>

        <h1 className={styles.title}>
          {mode === "login" ? t("auth.title.signIn") : t("auth.title.createAccount")}
        </h1>
        <p className={styles.subtitle}>
          {mode === "login"
            ? t("auth.subtitle.signIn")
            : t("auth.subtitle.createAccount")}
        </p>

        <form onSubmit={(e) => handleSubmit(e)} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>{t("auth.username")}</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("auth.usernamePlaceholder")}
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9._-]+"
              className={styles.input}
              aria-invalid={!isUsernamePatternValid}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>{t("auth.password")}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                minLength={8}
                className={styles.input}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              ref={errorAlertRef}
              className={styles.error}
              role="alert"
              tabIndex={-1}
            >
              <p className={styles.errorText}>{friendlyError ?? error}</p>
              {showTechnicalError ? (
                <p className={styles.errorDetail}>{error}</p>
              ) : null}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={styles.submit}
          >
            {loading ? t("auth.generatingKeys") : submitLabel}
          </button>
          {mode === "login" ? (
            <div className={styles.helpRow}>
              <Link to="/auth/recovery" className={styles.helpLink} onClick={() => clearError()}>
                {t("auth.helpCta")}
              </Link>
            </div>
          ) : null}
        </form>

        <div className={styles.toggle}>
          {mode === "login" ? (
            <>
              {t("auth.noAccount")}{" "}
              <button
                type="button"
                onClick={() => { setMode("register"); clearError(); }}
                className={styles.link}
              >
                {t("auth.createOne")}
              </button>
            </>
          ) : (
            <>
              {t("auth.hasAccount")}{" "}
              <button
                type="button"
                onClick={() => { setMode("login"); clearError(); }}
                className={styles.link}
              >
                {t("auth.signInLink")}
              </button>
            </>
          )}
        </div>

        <div className={styles.e2eeBadge}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L9 3.5V7C9 9 6 11 6 11C6 11 3 9 3 7V3.5L6 1Z" fill="currentColor" />
          </svg>
          {`v${__APP_VERSION__}`}
        </div>
      </div>
    </div>
  );
}
