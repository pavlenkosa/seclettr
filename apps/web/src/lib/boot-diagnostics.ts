import { IS_DIAGNOSTIC_BUILD } from "./diagnostic-mode";

const MAX_BOOT_DIAGNOSTICS = 48;
const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|cookie|session|ciphertext|digest|signature|private|proof/i;

export interface BootDiagnosticEvent {
  readonly at: string;
  readonly scope: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

const bootDiagnostics: BootDiagnosticEvent[] = [];

function sanitizeString(value: string): string {
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 2) return "[truncated]";
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((entry) => sanitizeValue(entry, depth + 1));
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    let count = 0;
    for (const [key, entry] of Object.entries(value)) {
      if (count >= 12) break;
      next[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : sanitizeValue(entry, depth + 1);
      count += 1;
    }
    return next;
  }
  return String(value);
}

function pushDiagnosticEvent(event: BootDiagnosticEvent): void {
  bootDiagnostics.push(event);
  if (bootDiagnostics.length > MAX_BOOT_DIAGNOSTICS) {
    bootDiagnostics.splice(0, bootDiagnostics.length - MAX_BOOT_DIAGNOSTICS);
  }
}

export function recordBootDiagnostic(
  scope: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (!IS_DIAGNOSTIC_BUILD) return;
  const event: BootDiagnosticEvent = {
    at: new Date().toISOString(),
    scope,
    message,
    data: data ? sanitizeValue(data) as Record<string, unknown> : undefined,
  };
  pushDiagnosticEvent(event);
  console.info(`[diag:${scope}] ${message}`, event.data ?? {});
}

export function getBootDiagnosticsSnapshot(): readonly BootDiagnosticEvent[] {
  return bootDiagnostics.slice();
}

export function formatBootDiagnostics(): string {
  return getBootDiagnosticsSnapshot()
    .map((event) => {
      const time = event.at.slice(11, 19);
      const data = event.data ? ` ${JSON.stringify(event.data)}` : "";
      return `${time} ${event.scope}: ${event.message}${data}`;
    })
    .join("\n");
}
