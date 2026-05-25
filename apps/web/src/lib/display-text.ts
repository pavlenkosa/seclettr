// eslint-disable-next-line no-control-regex
const CONTROL_AND_BIDI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const COLLAPSIBLE_WHITESPACE_PATTERN = /[\s\u00A0]+/g;

export function sanitizeDisplayText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .normalize("NFKC")
    .replaceAll(CONTROL_AND_BIDI_PATTERN, "")
    .replaceAll(COLLAPSIBLE_WHITESPACE_PATTERN, " ")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

export function sanitizeDisplayTextOrFallback(
  value: string | null | undefined,
  fallback: string
): string {
  return sanitizeDisplayText(value) ?? fallback;
}
