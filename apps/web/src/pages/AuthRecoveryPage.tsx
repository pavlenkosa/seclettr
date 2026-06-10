import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { useI18n } from "@/i18n";
import { mapAuthErrorMessage, shouldShowAuthErrorDetails } from "@/lib/auth-errors";
import { logger } from "@/lib/logger.js";
import { isNativePlatform } from "@/lib/native-platform";
import { useAuthStore } from "@/stores/auth";
import { LabelPill } from "@/components/ui";
import { AuthCard } from "./auth/AuthCard";
import { AuthErrorNotice } from "./auth/AuthErrorNotice";
import { AuthRecoveryDestructiveAction } from "./auth/AuthRecoveryDestructiveAction";
import { AuthRecoveryExplanation } from "./auth/AuthRecoveryExplanation";
import { AuthRecoverySuccess } from "./auth/AuthRecoverySuccess";
import styles from "./AuthRecoveryPage.module.css";

interface NativeAuthRecoveryLayoutProps {
  readonly recoveryReasonText: string | null;
  readonly friendlyError: string | null;
  readonly errorDetail: string | null | undefined;
  readonly isResetting: boolean;
  readonly hasResetCompleted: boolean;
  readonly onReset: () => void;
  readonly onBackToSignIn: () => void;
}

function NativeAuthRecoveryLayout({
  recoveryReasonText,
  friendlyError,
  errorDetail,
  isResetting,
  hasResetCompleted,
  onReset,
  onBackToSignIn,
}: NativeAuthRecoveryLayoutProps) {
  const { t } = useI18n();

  return (
    <div className={styles.nativeContainer}>
      <div className={styles.nativeTop}>
        <img src="/favicon.svg" width="68" height="68" alt="" aria-hidden="true" className={styles.nativeLogoImg} />
        <h1 className={styles.nativeTitle}>{t("common.appName")}</h1>
        <p className={styles.nativeSubtitle}>{t("auth.recovery.title")}</p>
      </div>

      <div className={styles.nativeSteps}>
        {recoveryReasonText ? (
          <AuthRecoveryExplanation
            id="auth-recovery-reason"
            title={t("auth.recovery.reasonTitle")}
            body={recoveryReasonText}
            tone="accent"
            flat
          />
        ) : null}

        <AuthRecoveryExplanation
          id="auth-recovery-step-1"
          title={t("auth.recovery.stepCredentialsTitle")}
          body={t("auth.recovery.stepCredentialsBody")}
          flat
        />

        <AuthRecoveryDestructiveAction
          id="auth-recovery-step-2"
          title={t("auth.recovery.stepDataTitle")}
          body={t("auth.recovery.stepDataBody")}
          actionLabel={t("auth.recovery.resetAction")}
          busyLabel={t("auth.recovery.resetting")}
          disabled={isResetting}
          onClick={onReset}
          successNotice={<AuthRecoverySuccess visible={hasResetCompleted} message={t("auth.recovery.resetDone")} />}
          flat
        />

        <AuthRecoveryExplanation
          id="auth-recovery-step-3"
          title={t("auth.recovery.stepPasswordTitle")}
          body={t("auth.recovery.stepPasswordBody")}
          flat
        />

        <AuthErrorNotice message={friendlyError} detail={errorDetail} />
      </div>

      <Link to="/auth" className={styles.nativeBackLink} onClick={onBackToSignIn}>
        {t("auth.recovery.backToSignIn")}
      </Link>

      <div className={styles.nativeFooter}>
        <LabelPill size="sm">{`v${__APP_VERSION__}`}</LabelPill>
        <LanguageSwitcher />
      </div>
    </div>
  );
}

export function AuthRecoveryPage() {
  const { t } = useI18n();
  const { error, authRecoveryReason, clearError, resetLocalDeviceData } = useAuthStore();
  const [isResetting, setIsResetting] = useState(false);
  const [hasResetCompleted, setHasResetCompleted] = useState(false);

  const friendlyError = useMemo(() => mapAuthErrorMessage(error, t), [error, t]);
  const showErrorDetails = shouldShowAuthErrorDetails(error);
  const errorDetail = showErrorDetails ? error : null;
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

  // Native: full-screen layout matching AuthPage's NativeAuthForm visual language
  if (isNativePlatform()) {
    return (
      <NativeAuthRecoveryLayout
        recoveryReasonText={recoveryReasonText}
        friendlyError={friendlyError}
        errorDetail={errorDetail}
        isResetting={isResetting}
        hasResetCompleted={hasResetCompleted}
        onReset={() => { void handleResetLocalData(); }}
        onBackToSignIn={clearError}
      />
    );
  }

  // Web: card layout
  return (
    <div className={styles.container}>
      <AuthCard
        appName={t("common.appName")}
        actions={<LanguageSwitcher />}
        title={t("auth.recovery.title")}
        subtitle={t("auth.recovery.subtitle")}
        body={(
          <div className={styles.body}>
            {recoveryReasonText ? (
              <AuthRecoveryExplanation
                id="auth-recovery-reason"
                title={t("auth.recovery.reasonTitle")}
                body={recoveryReasonText}
                tone="accent"
              />
            ) : null}

            <AuthRecoveryExplanation
              id="auth-recovery-step-1"
              title={t("auth.recovery.stepCredentialsTitle")}
              body={t("auth.recovery.stepCredentialsBody")}
            />

            <AuthRecoveryDestructiveAction
              id="auth-recovery-step-2"
              title={t("auth.recovery.stepDataTitle")}
              body={t("auth.recovery.stepDataBody")}
              actionLabel={t("auth.recovery.resetAction")}
              busyLabel={t("auth.recovery.resetting")}
              disabled={isResetting}
              onClick={() => { void handleResetLocalData(); }}
              successNotice={<AuthRecoverySuccess visible={hasResetCompleted} message={t("auth.recovery.resetDone")} />}
            />

            <AuthRecoveryExplanation
              id="auth-recovery-step-3"
              title={t("auth.recovery.stepPasswordTitle")}
              body={t("auth.recovery.stepPasswordBody")}
            />

            <AuthErrorNotice message={friendlyError} detail={errorDetail} />
          </div>
        )}
        footer={(
          <div className={styles.actions}>
            <Link to="/auth" className={styles.primaryLink} onClick={() => clearError()}>
              {t("auth.recovery.backToSignIn")}
            </Link>
          </div>
        )}
      />
    </div>
  );
}
