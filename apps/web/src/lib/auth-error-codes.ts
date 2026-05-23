/**
 * Auth error codes — semantic runtime-level auth failure identifiers.
 *
 * Owns:
 *   - Stable auth error codes emitted by auth store / restore runtimes.
 *   - Type guard for distinguishing internal auth codes from raw server errors.
 *
 * Does not own user-facing copy, translation mapping, or display formatting.
 */
export const AUTH_ERROR_CODES = {
  registrationFailed: "auth_registration_failed",
  loginFailed: "auth_login_failed",
  localKeysMissing: "auth_local_keys_missing",
  restoreUnexpected: "auth_restore_unexpected",
  pinRequired: "pin_required",
  pinWrong: "pin_wrong",
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

const AUTH_ERROR_CODE_SET = new Set<AuthErrorCode>(
  Object.values(AUTH_ERROR_CODES)
);

export function isAuthErrorCode(
  value: string | null | undefined
): value is AuthErrorCode {
  return (
    value !== null &&
    value !== undefined &&
    AUTH_ERROR_CODE_SET.has(value as AuthErrorCode)
  );
}
