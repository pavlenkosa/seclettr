import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES } from "../auth-error-codes";
import { mapAuthErrorMessage, shouldShowAuthErrorDetails } from "../auth-errors";

const translate = (key: string) => key;

describe("mapAuthErrorMessage", () => {
  it("returns null for null input", () => {
    expect(mapAuthErrorMessage(null, translate)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(mapAuthErrorMessage("", translate)).toBeNull();
  });

  it("maps invalid credentials", () => {
    expect(mapAuthErrorMessage("Invalid credentials", translate)).toBe("auth.error.invalidCredentials");
    expect(mapAuthErrorMessage("INVALID CREDENTIALS", translate)).toBe("auth.error.invalidCredentials");
  });

  it("maps too many auth requests", () => {
    expect(mapAuthErrorMessage("Too many auth requests", translate)).toBe("auth.error.rateLimited");
  });

  it("maps too many refresh requests", () => {
    expect(mapAuthErrorMessage("Too many refresh requests", translate)).toBe("auth.error.rateLimited");
  });

  it("maps session expired", () => {
    expect(mapAuthErrorMessage("Session expired", translate)).toBe("auth.error.sessionExpired");
  });

  it("maps username already taken", () => {
    expect(mapAuthErrorMessage("Username already taken", translate)).toBe("auth.error.usernameTaken");
  });

  it("maps registration is disabled", () => {
    expect(mapAuthErrorMessage("Registration is disabled", translate)).toBe("auth.error.registrationDisabled");
  });

  it("maps local e2ee keys are missing", () => {
    expect(mapAuthErrorMessage("Local e2ee keys are missing", translate)).toBe("auth.error.localKeysMissing");
    expect(mapAuthErrorMessage(AUTH_ERROR_CODES.localKeysMissing, translate)).toBe("auth.error.localKeysMissing");
  });

  it("maps session restore failed unexpectedly", () => {
    expect(mapAuthErrorMessage("Session restore failed unexpectedly", translate)).toBe("auth.error.restoreUnexpected");
    expect(mapAuthErrorMessage(AUTH_ERROR_CODES.restoreUnexpected, translate)).toBe("auth.error.restoreUnexpected");
  });

  it("maps internal auth fallback codes", () => {
    expect(mapAuthErrorMessage(AUTH_ERROR_CODES.registrationFailed, translate)).toBe("auth.error.generic");
    expect(mapAuthErrorMessage(AUTH_ERROR_CODES.loginFailed, translate)).toBe("auth.error.generic");
  });

  it("falls back to generic for unknown errors", () => {
    expect(mapAuthErrorMessage("Something went wrong", translate)).toBe("auth.error.generic");
    expect(mapAuthErrorMessage("Network error", translate)).toBe("auth.error.generic");
  });

  it("is case-insensitive", () => {
    expect(mapAuthErrorMessage("SESSION EXPIRED", translate)).toBe("auth.error.sessionExpired");
  });

  it("matches substring in longer message", () => {
    expect(mapAuthErrorMessage("error: invalid credentials provided", translate)).toBe("auth.error.invalidCredentials");
  });
});

describe("shouldShowAuthErrorDetails", () => {
  it("returns false for null error", () => {
    expect(shouldShowAuthErrorDetails(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(shouldShowAuthErrorDetails("")).toBe(false);
  });

  it("returns true for unknown errors in dev mode (Vitest sets DEV=true)", () => {
    // import.meta.env.DEV is true in Vitest; unknown errors show details.
    expect(shouldShowAuthErrorDetails("some unknown error")).toBe(true);
  });

  it("returns false for known errors even in dev mode", () => {
    expect(shouldShowAuthErrorDetails(AUTH_ERROR_CODES.registrationFailed)).toBe(false);
    expect(shouldShowAuthErrorDetails(AUTH_ERROR_CODES.loginFailed)).toBe(false);
    expect(shouldShowAuthErrorDetails(AUTH_ERROR_CODES.localKeysMissing)).toBe(false);
    expect(shouldShowAuthErrorDetails(AUTH_ERROR_CODES.restoreUnexpected)).toBe(false);
    expect(shouldShowAuthErrorDetails("invalid credentials")).toBe(false);
    expect(shouldShowAuthErrorDetails("too many auth requests")).toBe(false);
    expect(shouldShowAuthErrorDetails("session expired")).toBe(false);
    expect(shouldShowAuthErrorDetails("username already taken")).toBe(false);
    expect(shouldShowAuthErrorDetails("registration is disabled")).toBe(false);
    expect(shouldShowAuthErrorDetails("local e2ee keys are missing")).toBe(false);
    expect(shouldShowAuthErrorDetails("session restore failed unexpectedly")).toBe(false);
  });
});
