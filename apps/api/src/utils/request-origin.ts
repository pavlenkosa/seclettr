/**
 * Best-effort extraction of the browser-facing origin from an incoming request.
 *
 * Priority:
 *   1. `X-Client-Origin` — explicit header set by the web client. Required because
 *      the app uses `referrer-policy=no-referrer` and same-origin GET requests
 *      don't include `Origin`, so neither standard header is reliably available.
 *   2. `Origin` header — set by the browser for cross-origin requests, POST/PUT/DELETE,
 *      and CORS preflights. Absent for same-origin GET/HEAD.
 *   3. `Referer` header — present only when the page allows referrer leaking.
 *      Stripped to scheme+host so a leaked path doesn't end up in presigned URLs.
 *
 * Returns `undefined` when no header is usable, leaving callers to fall back
 * to a static configured origin (e.g. `S3_PUBLIC_URL`).
 */
type HeaderBag = Record<string, string | string[] | undefined>;

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isValidOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveBrowserOrigin(headers: HeaderBag): string | undefined {
  const clientOrigin = pickFirst(headers["x-client-origin"]);
  if (clientOrigin && isValidOrigin(clientOrigin)) return clientOrigin;

  const origin = pickFirst(headers["origin"]);
  if (origin) return origin;

  const referer = pickFirst(headers["referer"]);
  if (referer) {
    try {
      const parsed = new URL(referer);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Malformed referer — ignore and fall through.
    }
  }

  return undefined;
}
