/**
 * Unified client-side logger.
 *
 * Levels: debug < info < warn < error
 *
 * In production only warn and error are emitted. debug and info are no-ops
 * so they tree-shake cleanly from production bundles when the bundler can
 * inline the constant.
 */

const IS_DEV = import.meta.env.DEV;

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|cookie|session|ciphertext|digest|signature|stack|private|proof/i;

function redactText(value: string, maxLength = 200): string {
  return value
    .replaceAll(/\bBearer\s+[A-Z0-9._-]+\b/gi, "Bearer [REDACTED]")
    .replaceAll(
      /\b(access_token|refresh_token|token|password|secret|session|cookie|authorization)=([^&\s]+)/gi,
      "$1=[REDACTED]"
    )
    .replaceAll(
      /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
      "[REDACTED_JWT]"
    )
    .slice(0, maxLength);
}

function sanitizeError(value: Error): Record<string, unknown> {
  const next: Record<string, unknown> = {
    name: value.name,
    message: redactText(value.message),
  };
  const code = Reflect.get(value, "code");
  const status = Reflect.get(value, "status");
  if (typeof code === "string" || typeof code === "number") {
    next.code = code;
  }
  if (typeof status === "number") {
    next.status = status;
  }
  return next;
}

function sanitizeArray(value: unknown[], depth: number): unknown[] {
  return value.slice(0, 8).map((entry) => sanitizeLogValue(entry, depth + 1));
}

function sanitizeObject(value: object, depth: number): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  let count = 0;
  for (const [key, entry] of Object.entries(value)) {
    if (count >= 12) break;
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[REDACTED]"
      : sanitizeLogValue(entry, depth + 1);
    count += 1;
  }
  return sanitized;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (IS_DEV || depth > 2) return value;
  if (value instanceof Error) return sanitizeError(value);
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return sanitizeArray(value, depth);
  if (value && typeof value === "object") return sanitizeObject(value, depth);
  return value;
}

function sanitizeArgs(args: unknown[]): unknown[] {
  if (IS_DEV) {
    return args;
  }
  return args.map((arg) => sanitizeLogValue(arg));
}

export const logger = {
  debug: IS_DEV
    ? (message: string, ...args: unknown[]) => console.debug(message, ...args)
    : () => {},
  info: IS_DEV
    ? (message: string, ...args: unknown[]) => console.info(message, ...args)
    : () => {},
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...sanitizeArgs(args)),
  error: (message: string, ...args: unknown[]) => console.error(message, ...sanitizeArgs(args)),
};
