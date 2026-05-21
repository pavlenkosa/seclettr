// ── App-shell offline fallback ─────────────────────────────────────────────
// This SW is the only SW registered at scope '/'. Cache the app shell at
// install time so that installed (standalone) users see the app instead of
// the browser's offline error page when connectivity is lost.

const CACHE_NAME = "shell-v1";
const SHELL_URLS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  // Take control immediately so the app shell cache is available right away.
  globalThis.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove caches from previous shell versions.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("shell-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  globalThis.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only intercept same-origin navigation requests (page loads).
  // All other requests (API, assets) pass through to the network unchanged.
  const { request } = event;
  if (
    request.mode !== "navigate" ||
    !request.url.startsWith(self.location.origin + "/")
  ) {
    return;
  }
  event.respondWith(
    fetch(request).catch(() =>
      caches.match("/index.html").then(
        (cached) =>
          cached ??
          new Response("Offline — please reconnect to the internet.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
      )
    )
  );
});

// ── Push notifications ──────────────────────────────────────────────────────

self.addEventListener("notificationclose", () => {
  // Intentionally no-op for compatibility. Some browsers fire close aggressively.
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function getStringPayloadValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function getNotificationAsset(value) {
  return isNonEmptyString(value) ? value : "/favicon.svg";
}

function getNotificationMaxActions() {
  return typeof Notification !== "undefined" &&
    typeof Notification.maxActions === "number"
    ? Notification.maxActions
    : 0;
}

function isValidNotificationAction(action) {
  return Boolean(
    action &&
    typeof action.action === "string" &&
    typeof action.title === "string"
  );
}

function buildNotificationActions(payload) {
  const maxActions = getNotificationMaxActions();
  if (maxActions <= 0 || !Array.isArray(payload.actions)) {
    return undefined;
  }
  return payload.actions.filter(isValidNotificationAction).slice(0, maxActions);
}

function buildNotificationOptions(payload) {
  const options = {
    body: getStringPayloadValue(payload.body, "New message"),
    tag: getStringPayloadValue(payload.tag, "seclettr-message"),
    data: payload.data && typeof payload.data === "object" ? payload.data : {},
    icon: getNotificationAsset(payload.icon),
    badge: getNotificationAsset(payload.badge),
  };

  if (typeof payload.timestamp === "number") {
    options.timestamp = payload.timestamp;
  }
  if (payload.renotify === true) {
    options.renotify = true;
  }
  if (payload.requireInteraction === true) {
    options.requireInteraction = true;
  }

  const actions = buildNotificationActions(payload);
  if (actions) {
    options.actions = actions;
  }

  return options;
}

function normalizeTargetUrl(rawUrl) {
  try {
    const targetUrl = new URL(
      typeof rawUrl === "string" ? rawUrl : "/",
      self.location.origin
    );
    if (targetUrl.origin !== self.location.origin) {
      return new URL("/", self.location.origin).toString();
    }
    return targetUrl.toString();
  } catch {
    return new URL("/", self.location.origin).toString();
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Seclettr";
  const options = buildNotificationOptions(payload);

  event.waitUntil(globalThis.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || "";

  if (action === "mark-read") {
    event.waitUntil((async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({ type: "push:action", action: "mark-read", data });
      }
    })());
    return;
  }

  const targetUrl = normalizeTargetUrl(data.url);

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });

    for (const client of windows) {
      if (client.url === targetUrl && "focus" in client) {
        await client.focus();
        return;
      }
    }

    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(targetUrl);
          } catch {
            // Navigation support differs across browsers; focus is still useful.
          }
        }
        return;
      }
    }
    if (clients.openWindow) {
      await clients.openWindow(targetUrl);
    }
  })());
});
