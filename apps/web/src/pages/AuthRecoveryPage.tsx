import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { useI18n } from "@/i18n";
import { mapAuthErrorMessage, shouldShowAuthErrorDetails } from "@/lib/auth-errors";
import { logger } from "@/lib/logger.js";
import { useAuthStore } from "@/stores/auth";
import styles from "./AuthRecoveryPage.module.css";

export function AuthRecoveryPage() {
  const { t } = useI18n();
  const { error, authRecoveryReason, clearError, resetLocalDeviceData } = useAuthStore();
  const [isResetting, setIsResetting] = useState(false);
  const [hasResetCompleted, setHasResetCompleted] = useState(false);

  const friendlyError = useMemo(() => mapAuthErrorMessage(error, t), [error, t]);
  const showErrorDetails = shouldShowAuthErrorDetails(error);
  const recoveryReasonText = useMemo(() => {
    if (authRecoveryReason === "missing_local_keys") {
      return t("auth.recovery.reasonMissingLocalKeys");
    }
    if (authRecoveryReason === "unexpected_restore_failure") {
      return t("auth.recovery.reasonUnexpectedRestoreFailure");
    }
    return null;
  }, [authRecoveryReason, t]);

  const handleResetLocalData = async () => {
    const isConfirmed = globalThis.confirm(t("auth.recovery.resetConfirm"));
    if (!isConfirmed) {
      return;
    }

    clearError();
    setHasResetCompleted(false);
    setIsResetting(true);

    try {
      await resetLocalDeviceData();
      setHasResetCompleted(true);
    } catch {
      logger.warn("[auth] local recovery reset failed");
      // store error is surfaced by useAuthStore
    } finally {
      setIsResetting(false);
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

        <h1 className={styles.title}>{t("auth.recovery.title")}</h1>
        <p className={styles.subtitle}>{t("auth.recovery.subtitle")}</p>

        {recoveryReasonText ? (
          <section className={styles.section} aria-labelledby="auth-recovery-reason">
            <h2 id="auth-recovery-reason" className={styles.sectionTitle}>
              {t("auth.recovery.reasonTitle")}
            </h2>
            <p className={styles.sectionText}>{recoveryReasonText}</p>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="auth-recovery-step-1">
          <h2 id="auth-recovery-step-1" className={styles.sectionTitle}>{t("auth.recovery.stepCredentialsTitle")}</h2>
          <p className={styles.sectionText}>{t("auth.recovery.stepCredentialsBody")}</p>
        </section>

        <section className={styles.section} aria-labelledby="auth-recovery-step-2">
          <h2 id="auth-recovery-step-2" className={styles.sectionTitle}>{t("auth.recovery.stepDataTitle")}</h2>
          <p className={styles.sectionText}>{t("auth.recovery.stepDataBody")}</p>
          <button
            type="button"
            className={styles.resetButton}
            onClick={() => handleResetLocalData()}
            disabled={isResetting}
          >
            {isResetting ? t("auth.recovery.resetting") : t("auth.recovery.resetAction")}
          </button>
          {hasResetCompleted ? (
            <div className={styles.success} role="status" aria-live="polite">
              {t("auth.recovery.resetDone")}
            </div>
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="auth-recovery-step-3">
          <h2 id="auth-recovery-step-3" className={styles.sectionTitle}>{t("auth.recovery.stepPasswordTitle")}</h2>
          <p className={styles.sectionText}>{t("auth.recovery.stepPasswordBody")}</p>
        </section>

        {friendlyError ? (
          <div className={styles.error} role="alert" aria-live="assertive">
            <p className={styles.errorText}>{friendlyError}</p>
            {showErrorDetails && error ? <p className={styles.errorDetail}>{error}</p> : null}
          </div>
        ) : null}

        <div className={styles.actions}>
          <Link to="/auth" className={styles.primaryLink} onClick={() => clearError()}>
            {t("auth.recovery.backToSignIn")}
          </Link>
        </div>
      </div>
    </div>
  );
}
