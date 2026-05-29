import type { TranslationParams } from "@/i18n/messages";
import { AUTH_ERROR_CODES, isAuthErrorCode } from "./auth-error-codes";

type TranslateFn = (key: string, params?: TranslationParams) => string;
const IS_DEV = import.meta.env.DEV;

// djb2 hash — stable, no crypto needed
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ (s.codePointAt(i) ?? 0);
  }
  return (h >>> 0).toString(16).slice(0, 4).toUpperCase();
}

export function getAuthErrorCode(error: string | null): string | null {
  if (!error) return null;
  if (error === AUTH_ERROR_CODES.registrationFailed) return "AUTH_08";
  if (error === AUTH_ERROR_CODES.loginFailed) return "AUTH_09";
  if (error === AUTH_ERROR_CODES.localKeysMissing) return "AUTH_06";
  if (error === AUTH_ERROR_CODES.restoreUnexpected) return "AUTH_07";
  const n = error.toLowerCase();
  if (n.includes("invalid credentials")) return "AUTH_01";
  if (n.includes("too many auth requests") || n.includes("too many refresh requests")) return "AUTH_02";
  if (n.includes("session expired")) return "AUTH_03";
  if (n.includes("username already taken")) return "AUTH_04";
  if (n.includes("registration is disabled")) return "AUTH_05";
  if (n.includes("local e2ee keys are missing")) return "AUTH_06";
  if (n.includes("session restore failed unexpectedly")) return "AUTH_07";
  return `AUTH_${shortHash(error)}`;
}

export function mapAuthErrorMessage(error: string | null, t: TranslateFn): string | null {
  if (!error) return null;
  if (error === AUTH_ERROR_CODES.registrationFailed) {
    return t("auth.error.generic");
  }
  if (error === AUTH_ERROR_CODES.loginFailed) {
    return t("auth.error.generic");
  }
  if (error === AUTH_ERROR_CODES.localKeysMissing) {
    return t("auth.error.localKeysMissing");
  }
  if (error === AUTH_ERROR_CODES.restoreUnexpected) {
    return t("auth.error.restoreUnexpected");
  }
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
  if (isAuthErrorCode(error)) return false;
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
