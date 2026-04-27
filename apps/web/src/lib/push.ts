import { api } from "./api";

const PUSH_BROWSER_ENABLED_KEY = "seclettr.push.browserEnabled.v1";

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const base64 = padded.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.codePointAt(i)!;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPreferences {
  directMessagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  callInvitesEnabled: boolean;
  showSender: boolean;
}

export interface PushClientStatus {
  supported: boolean;
  browserEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  pushConfigured: boolean;
  platformHint: "none" | "ios-install-app";
}

function getPushPlatformHint(): PushClientStatus["platformHint"] {
  const userAgent = (navigator.userAgent ?? "").toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) &&
    !/crios|fxios|edgios|chrome|android/.test(userAgent);
  const isStandalone = globalThis.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;

  if (isIos && isSafari && !isStandalone) {
    return "ios-install-app";
  }

  return "none";
}

function hasPushManagerApi(): boolean {
  return (
    typeof PushManager !== "undefined" ||
    (globalThis.window !== undefined && "PushManager" in globalThis.window)
  );
}

function getNotificationApi(): typeof Notification | null {
  if (typeof Notification !== "undefined") {
    return Notification;
  }
  if (globalThis.window === undefined || !("Notification" in globalThis.window)) {
    return null;
  }
  return (globalThis.window as unknown as { Notification?: typeof Notification }).Notification ?? null;
}

function serializeSubscription(subscription: PushSubscription): PushSubscriptionPayload | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    return null;
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

async function getPushServiceWorkerRegistration(
  options?: { registerIfMissing?: boolean }
): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration("/").catch(() => null);
  if (existing) {
    return existing;
  }
  if (!options?.registerIfMissing) {
    return null;
  }
  return navigator.serviceWorker.register("/push-sw.js");
}

function isPushEnabledForBrowser(): boolean {
  const stored = localStorage.getItem(PUSH_BROWSER_ENABLED_KEY);
  return stored !== "0";
}

function setPushEnabledForBrowser(enabled: boolean): void {
  localStorage.setItem(PUSH_BROWSER_ENABLED_KEY, enabled ? "1" : "0");
}

export async function getPushClientStatus(): Promise<PushClientStatus> {
  const notificationApi = getNotificationApi();
  const supported =
    "serviceWorker" in navigator &&
    hasPushManagerApi() &&
    notificationApi !== null;
  if (!supported) {
    return {
      supported: false,
      browserEnabled: false,
      permission: "unsupported",
      subscribed: false,
      pushConfigured: false,
      platformHint: getPushPlatformHint(),
    };
  }

  let pushConfigured = true;
  try {
    await api.get<{ vapidPublicKey: string }>("/push/vapid-public-key");
  } catch {
    pushConfigured = false;
  }

  const registration = await getPushServiceWorkerRegistration().catch(() => null);
  const subscription = registration
    ? await registration.pushManager.getSubscription().catch(() => null)
    : null;

  return {
    supported: true,
    browserEnabled: isPushEnabledForBrowser(),
    permission: notificationApi.permission,
    subscribed: Boolean(subscription),
    pushConfigured,
    platformHint: "none",
  };
}

export async function ensurePushSubscription(options?: { force?: boolean }): Promise<void> {
  const notificationApi = getNotificationApi();
  if (!("serviceWorker" in navigator) || !hasPushManagerApi() || !notificationApi) {
    return;
  }
  if (!options?.force && !isPushEnabledForBrowser()) {
    return;
  }

  let permission = notificationApi.permission;
  if (permission === "default") {
    permission = await notificationApi.requestPermission();
  }
  if (permission !== "granted") {
    return;
  }

  let vapidPublicKey: string;
  try {
    const result = await api.get<{ vapidPublicKey: string }>("/push/vapid-public-key");
    vapidPublicKey = result.vapidPublicKey;
  } catch {
    return;
  }

  const registration = await getPushServiceWorkerRegistration({
    registerIfMissing: true,
  });
  if (!registration) {
    return;
  }
  let subscription = await registration.pushManager.getSubscription();
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToArrayBuffer(vapidPublicKey),
  });

  const payload = serializeSubscription(subscription);
  if (!payload) return;
  await api.post<void>("/push/subscriptions", payload);
}

export async function enablePushForBrowser(): Promise<void> {
  setPushEnabledForBrowser(true);
  await ensurePushSubscription({ force: true });
}

export async function unsubscribePush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !hasPushManagerApi()) {
    return;
  }
  const registration = await getPushServiceWorkerRegistration({
    registerIfMissing: false,
  }).catch(() => null);
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const payload = serializeSubscription(subscription);
  if (payload) {
    await api.post<void>("/push/subscriptions/unsubscribe", {
      endpoint: payload.endpoint,
    }).catch(() => null);
  }
  await subscription.unsubscribe().catch(() => null);
}

export async function disablePushForBrowser(): Promise<void> {
  setPushEnabledForBrowser(false);
  await unsubscribePush();
}
