/**
 * @ownedBy attachment-upload-pipeline
 *
 * `registry` tracks in-flight XHR/fetch uploads keyed by optimistic message ID.
 * Written by the message store on upload start; cleared on complete, cancel, or error.
 * `localSourceRegistry` holds sender-side Blob references for 15 minutes (TTL via
 * setTimeout), enabling re-renders to read the local source without re-fetching.
 * Both Maps are module-level and shared across all call sites on the page.
 * Use `__uploadProgressTestUtils.reset()` in `beforeEach` to prevent cross-test leakage.
 */

type ProgressListener = (progress: number | null) => void;

interface UploadLocalSourceEntry {
  blob: Blob;
  cleanupTimer: ReturnType<typeof setTimeout>;
}

interface UploadEntry {
  progress: number;
  abort: () => void;
  listeners: Set<ProgressListener>;
}

const registry = new Map<string, UploadEntry>();
const localSourceRegistry = new Map<string, UploadLocalSourceEntry>();
const LOCAL_SOURCE_TTL_MS = 15 * 60_000;
const MIXED_CONTENT_PARSE_BASE = "https://upload.invalid";

export function registerUpload(messageId: string, abort: () => void): void {
  registry.set(messageId, { progress: 0, abort, listeners: new Set() });
}

export function updateUploadProgress(messageId: string, progress: number): void {
  const entry = registry.get(messageId);
  if (!entry) return;
  entry.progress = Math.min(100, Math.max(0, progress));
  for (const listener of entry.listeners) {
    listener(entry.progress);
  }
}

export function unregisterUpload(messageId: string): void {
  const entry = registry.get(messageId);
  if (entry) {
    for (const listener of entry.listeners) {
      listener(null);
    }
  }
  registry.delete(messageId);
}

export function cancelUpload(messageId: string): void {
  const entry = registry.get(messageId);
  if (!entry) return;
  entry.abort();
  for (const listener of entry.listeners) {
    listener(null);
  }
  registry.delete(messageId);
}

export function getUploadProgress(messageId: string): number | null {
  return registry.get(messageId)?.progress ?? null;
}

export function subscribeUploadProgress(
  messageId: string,
  listener: ProgressListener
): () => void {
  const entry = registry.get(messageId);
  if (!entry) return () => {};
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function setUploadLocalSource(messageId: string, blob: Blob): void {
  clearUploadLocalSource(messageId);
  const cleanupTimer = setTimeout(() => {
    localSourceRegistry.delete(messageId);
  }, LOCAL_SOURCE_TTL_MS);
  localSourceRegistry.set(messageId, { blob, cleanupTimer });
}

export function getUploadLocalSource(messageId: string): Blob | null {
  return localSourceRegistry.get(messageId)?.blob ?? null;
}

export function clearUploadLocalSource(messageId: string): void {
  const entry = localSourceRegistry.get(messageId);
  if (!entry) return;
  clearTimeout(entry.cleanupTimer);
  localSourceRegistry.delete(messageId);
}

function resetUploadProgress(): void {
  registry.clear();
  for (const entry of localSourceRegistry.values()) {
    clearTimeout(entry.cleanupTimer);
  }
  localSourceRegistry.clear();
}

export const __uploadProgressTestUtils = {
  reset: resetUploadProgress,
} as const;

export function shouldSkipDirectUploadForMixedContent(
  uploadUrl: string,
  pageProtocol = globalThis.location?.protocol
): boolean {
  if (pageProtocol !== "https:") {
    return false;
  }
  try {
    return new URL(uploadUrl, MIXED_CONTENT_PARSE_BASE).protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Uploads a FormData payload via XHR with progress events.
 * Falls back to fetch (no progress) when XHR is not available (e.g. test envs).
 * Resolves true on 2xx, false on non-2xx, rejects on network error / abort.
 */
export function uploadFormDataWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
  signal: AbortSignal
): Promise<boolean> {
  // Browsers block HTTPS pages from sending XHR/fetch to HTTP endpoints.
  // Return `false` so callers transparently fall back to same-origin proxy upload.
  if (shouldSkipDirectUploadForMixedContent(url)) {
    return Promise.resolve(false);
  }

  if (typeof XMLHttpRequest === "undefined") {
    // Fallback for environments without XHR (e.g. jsdom tests).
    return fetch(url, { method: "POST", body: formData, signal }).then(
      (r) => { onProgress(100); return r.ok; },
      (err: unknown) => { throw err; }
    );
  }

  return new Promise<boolean>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    signal.addEventListener("abort", () => {
      xhr.abort();
      reject(new DOMException("Upload cancelled", "AbortError"));
    }, { once: true });

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress((e.loaded / e.total) * 100);
      }
    });

    xhr.addEventListener("load", () => {
      onProgress(100);
      resolve(xhr.status >= 200 && xhr.status < 300);
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new DOMException("Upload cancelled", "AbortError"));
    });

    xhr.open("POST", url);
    xhr.send(formData);
  });
}
