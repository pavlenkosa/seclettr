import type { TranslationParams } from "@/i18n/messages";

type TranslateFn = (key: string, params?: TranslationParams) => string;
const IS_DEV = import.meta.env.DEV;

export function mapAuthErrorMessage(error: string | null, t: TranslateFn): string | null {
  if (!error) return null;
  const normalized = error.toLowerCase();

  if (normalized.includes("invalid credentials")) {
    return t("auth.error.invalidCredentials");
  }
  if (normalized.includes("too many auth requests") || normalized.includes("too many refresh requests")) {
    return t("auth.error.rateLimited");
  }
  if (normalized.includes("session expired")) {
    return t("auth.error.sessionExpired");
  }
  if (normalized.includes("username already taken")) {
    return t("auth.error.usernameTaken");
  }
  if (normalized.includes("registration is disabled")) {
    return t("auth.error.registrationDisabled");
  }
  if (normalized.includes("local e2ee keys are missing")) {
    return t("auth.error.localKeysMissing");
  }
  if (normalized.includes("session restore failed unexpectedly")) {
    return t("auth.error.restoreUnexpected");
  }

  return t("auth.error.generic");
}

export function shouldShowAuthErrorDetails(error: string | null): boolean {
  if (!error) return false;
  if (!IS_DEV) return false;
  const normalized = error.toLowerCase();
  return !(
    normalized.includes("invalid credentials")
    || normalized.includes("too many auth requests")
    || normalized.includes("too many refresh requests")
    || normalized.includes("session expired")
    || normalized.includes("username already taken")
    || normalized.includes("registration is disabled")
    || normalized.includes("local e2ee keys are missing")
    || normalized.includes("session restore failed unexpectedly")
  );
}
