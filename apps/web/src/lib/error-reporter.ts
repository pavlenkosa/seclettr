/**
 * @ownedBy client-error-reporting pipeline
 *
 * `seenMessages` (Set) deduplicates error keys for the page lifetime — unbounded
 * by design, grows at most once per unique error+context pair.
 * `queue` buffers reports between 2-second flush cycles (drained 10 at a time).
 * `flushTimer` is a single pending setTimeout handle, or null when idle.
 * All three are module-level state. Use `__errorReporterTestUtils.reset()` in
 * `beforeEach` to prevent cross-test dedup/queue leakage.
 *
 * Client-side error reporter.
 *
 * Collects JS errors that occur in production and ships them to the
 * server via POST <apiBase>/client-errors so they appear in server logs.
 *
 * Design decisions:
 * - Silent in development (use DevTools instead).
 * - Batched with a 2-second debounce to avoid hammering the endpoint.
 * - Session-level deduplication: same error message sent at most once.
 * - Fire-and-forget: failures are silently dropped (no recursive reporting).
 */
import { resolveApiBaseUrl } from "@/lib/runtime-config";

const IS_PROD = import.meta.env.PROD;
const API_BASE_URL = resolveApiBaseUrl();

interface ErrorReport {
  name?: string;
  message: string;
  stack?: string;
  context?: string;
  url: string;
  appVersion: string;
}

const seenMessages = new Set<string>();
const queue: ErrorReport[] = [];
let flushTimer: number | null = null;

function redactText(value: string, maxLength = 180): string {
  return value
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\bBearer\s+[A-Z0-9._-]+\b/gi, "Bearer [REDACTED]")
    .replaceAll(
      /\b(access_token|refresh_token|token|password|secret|session|cookie|authorization)=([^&\s]+)/gi,
      "$1=[REDACTED]"
    )
    .replaceAll(
      /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
      "[REDACTED_JWT]"
    )
    .trim()
    .slice(0, maxLength);
}

function sanitizePathname(pathname: string): string {
  const parts = pathname.split("/");
  return parts
    .map((segment, index) => {
      if (index === 0 || segment.length === 0) {
        return segment;
      }
      if (
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
        /^[A-Za-z0-9_-]{24,}$/.test(segment)
      ) {
        return ":id";
      }
      return segment;
    })
    .join("/");
}

function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split("\n")
    .map((line) => redactText(line, 120))
    .filter(Boolean)
    .slice(0, 3);

  return frames.length > 0 ? frames.join("\n") : undefined;
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = globalThis.window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 2000);
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 10);
  try {
    await fetch(`${API_BASE_URL}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    // silently drop — never throw from error reporter
  }
}

/**
 * Report an error to the server. Safe to call from any context.
 * No-op in development.
 */
export function reportError(
  error: unknown,
  context?: string,
): void {
  if (!IS_PROD) return;

  const messageForStringError = typeof error === "string" ? redactText(error) : "Unknown error";
  const message = error instanceof Error
    ? redactText(error.message || error.name || "Error")
    : messageForStringError;
  const errorName = error instanceof Error ? redactText(error.name, 40) : undefined;
  const sanitizedContext = context ? redactText(context, 120) : undefined;

  // Session-level dedup: same message at most once per session
  const dedupKey = `${sanitizedContext ?? ""}::${errorName ?? ""}::${message}`;
  if (seenMessages.has(dedupKey)) return;
  seenMessages.add(dedupKey);

  queue.push({
    name: errorName,
    message,
    stack: error instanceof Error ? sanitizeStack(error.stack) : undefined,
    context: sanitizedContext,
    url: sanitizePathname(globalThis.location.pathname),
    appVersion: __APP_VERSION__,
  });

  scheduleFlush();
}

function resetErrorReporter(): void {
  seenMessages.clear();
  queue.splice(0);
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export const __errorReporterTestUtils = {
  reset: resetErrorReporter,
  redactText,
  sanitizePathname,
} as const;
