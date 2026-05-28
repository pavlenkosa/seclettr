import { isNativePlatform } from "./native-platform";
import { resolveApiBaseUrl } from "./runtime-config";

interface LocalNotificationsPlugin {
  requestPermissions: () => Promise<{ display: "granted" | "denied" | "prompt" }>;
  checkPermissions: () => Promise<{ display: "granted" | "denied" | "prompt" }>;
  schedule: (options: { notifications: NativeNotificationRequest[] }) => Promise<unknown>;
}

interface NativeNotificationRequest {
  id: number;
  title: string;
  body: string;
  extra?: Record<string, unknown>;
  smallIcon?: string;
  iconColor?: string;
  sound?: string;
}

interface NativePushPlugin {
  checkPermission: () => Promise<{ value: "granted" | "denied" }>;
  requestPermission: () => Promise<{ value: "granted" | "denied" }>;
  start: (opts: { serverUrl: string; token: string }) => Promise<void>;
  stop: () => Promise<void>;
  updateToken: (opts: { token: string }) => Promise<void>;
  isRunning: () => Promise<{ value: boolean }>;
  getFcmToken: () => Promise<{ token: string }>;
  useFcm: () => Promise<void>;
  addListener: (event: string, handler: (data: unknown) => void) => Promise<{ remove: () => void }>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

let _initialized = false;

interface NativeNotifPrefs {
  directMessagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  showSender: boolean;
}

let _prefs: NativeNotifPrefs = {
  directMessagesEnabled: true,
  groupMessagesEnabled: true,
  showSender: true,
};

/** Called by usePushSettings whenever preferences are loaded or updated. */
export function setNativeNotificationPreferences(prefs: NativeNotifPrefs): void {
  _prefs = prefs;
}

// Access the plugin through the Capacitor global injected by the native bridge —
// avoids bundling @capacitor/local-notifications into the web build entirely.
function getPlugin(): LocalNotificationsPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["LocalNotifications"];
  return plugin ? (plugin as LocalNotificationsPlugin) : null;
}

let _permissionGranted: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (_permissionGranted !== null) return _permissionGranted;
  const plugin = getPlugin();
  if (!plugin) return false;
  const { display } = await plugin.checkPermissions();
  if (display === "granted") {
    _permissionGranted = true;
    return true;
  }
  if (display === "prompt") {
    const result = await plugin.requestPermissions();
    _permissionGranted = result.display === "granted";
    return _permissionGranted;
  }
  _permissionGranted = false;
  return false;
}

export async function initNativeNotifications(): Promise<void> {
  if (_initialized || !isNativePlatform()) return;
  _initialized = true;
  await ensurePermission();
}

export async function getNativeNotificationPermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  const plugin = getPlugin();
  if (!plugin) return "unsupported";
  const { display } = await plugin.checkPermissions();
  return display;
}

export async function requestNativeNotificationPermission(): Promise<"granted" | "denied"> {
  const plugin = getPlugin();
  if (!plugin) return "denied";
  const result = await plugin.requestPermissions();
  _permissionGranted = result.display === "granted";
  return result.display === "granted" ? "granted" : "denied";
}

let _notifIdCounter = Date.now() & 0x7fffffff;
function nextId(): number {
  _notifIdCounter = (_notifIdCounter + 1) & 0x7fffffff;
  return _notifIdCounter;
}

const MAX_BODY_LEN = 200;
function truncate(text: string): string {
  return text.length <= MAX_BODY_LEN ? text : text.slice(0, MAX_BODY_LEN) + "…";
}

export async function showNativeDmNotification(params: {
  senderUserId: string;
  senderUsername: string;
  content: string;
  messageType: string;
}): Promise<void> {
  if (!_prefs.directMessagesEnabled) return;
  const plugin = getPlugin();
  if (!plugin) return;
  if (!(await ensurePermission())) return;

  const { senderUserId, senderUsername, content, messageType } = params;
  const title = _prefs.showSender ? `@${senderUsername}` : "Seclettr";
  let body: string;
  if (!_prefs.showSender) {
    body = "New message";
  } else if (messageType === "text") {
    body = truncate(content);
  } else if (messageType === "voice_note") {
    body = "🎤 Voice message";
  } else if (messageType === "video_note") {
    body = "🎥 Video message";
  } else {
    body = "📎 File";
  }

  await plugin.schedule({
    notifications: [{
      id: nextId(),
      title,
      body,
      extra: { type: "dm", senderUserId, url: `/?chat=${encodeURIComponent(senderUserId)}` },
      smallIcon: "ic_stat_notification",
      iconColor: "#4f8ef7",
    }],
  });
}

export async function showNativeGroupNotification(params: {
  groupId: string;
  groupName: string;
  senderUsername: string;
  content: string;
  messageType: string;
}): Promise<void> {
  if (!_prefs.groupMessagesEnabled) return;
  const plugin = getPlugin();
  if (!plugin) return;
  if (!(await ensurePermission())) return;

  const { groupId, groupName, senderUsername, content, messageType } = params;
  const title = groupName || "Group";
  let body: string;
  if (!_prefs.showSender) {
    body = "New group message";
  } else if (messageType === "text") {
    body = `@${senderUsername}: ${truncate(content)}`;
  } else if (messageType === "voice_note") {
    body = `@${senderUsername}: 🎤 Voice message`;
  } else if (messageType === "video_note") {
    body = `@${senderUsername}: 🎥 Video message`;
  } else {
    body = `@${senderUsername}: 📎 File`;
  }

  await plugin.schedule({
    notifications: [{
      id: nextId(),
      title,
      body,
      extra: { type: "group", groupId, url: `/?group=${encodeURIComponent(groupId)}` },
      smallIcon: "ic_stat_notification",
      iconColor: "#4f8ef7",
    }],
  });
}

// ─── Native push foreground service (Android ForegroundService WS) ─────

function getNativePushPlugin(): NativePushPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["NativePush"];
  return plugin ? (plugin as NativePushPlugin) : null;
}

let _fcmTokenCleanup: (() => void) | null = null;

async function registerFcmTokenOnServer(token: string): Promise<boolean> {
  try {
    const apiBase = resolveApiBaseUrl().replace(/\/+$/, "");
    const resp = await fetch(`${apiBase}/push/fcm/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function unregisterFcmTokenOnServer(token: string): Promise<void> {
  try {
    const apiBase = resolveApiBaseUrl().replace(/\/+$/, "");
    await fetch(`${apiBase}/push/fcm/token`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token }),
    });
  } catch {
    // Best-effort
  }
}

export async function startNativePushService(token: string): Promise<void> {
  const plugin = getNativePushPlugin();
  if (!plugin) return;

  const { value: permission } = await plugin.checkPermission();
  if (permission !== "granted") {
    const { value: granted } = await plugin.requestPermission();
    if (granted !== "granted") return;
  }

  // Check if FCM token already exists
  let fcmToken = "";
  try {
    const result = await plugin.getFcmToken();
    fcmToken = result.token;
  } catch {
    // FCM SDK not available or not initialized — proceed with FG fallback
  }
  if (fcmToken) {
    const registered = await registerFcmTokenOnServer(fcmToken);
    if (registered) {
      await plugin.useFcm();
      return;
    }
  }

  // No FCM token yet — start FG service as fallback and listen for token
  const apiUrl = resolveApiBaseUrl();
  try {
    await plugin.start({ serverUrl: apiUrl, token });
  } catch {
    return;
  }

  // Listen for FCM token to upgrade
  if (!_fcmTokenCleanup) {
    try {
      const handle = await plugin.addListener("fcmTokenReceived", async (data: unknown) => {
        const { token: newToken } = data as { token: string };
        if (!newToken) return;
        const registered = await registerFcmTokenOnServer(newToken);
        if (registered) {
          await plugin.useFcm();
          await plugin.stop();
        }
      });
      _fcmTokenCleanup = () => handle.remove();
    } catch {
      // Non-critical — FG service will continue working
    }
  }
}

export async function stopNativePushService(): Promise<void> {
  const plugin = getNativePushPlugin();
  if (!plugin) return;

  // Unregister FCM token on server
  try {
    const { token: fcmToken } = await plugin.getFcmToken();
    if (fcmToken) {
      await unregisterFcmTokenOnServer(fcmToken);
    }
  } catch {
    // Best-effort
  }

  try {
    await plugin.stop();
  } catch {
    // Ignore
  }

  if (_fcmTokenCleanup) {
    _fcmTokenCleanup();
    _fcmTokenCleanup = null;
  }
}

export async function updateNativePushToken(token: string): Promise<void> {
  const plugin = getNativePushPlugin();
  if (!plugin) return;
  try {
    await plugin.updateToken({ token });
  } catch {
    // Ignore
  }
}

export async function isNativePushServiceRunning(): Promise<boolean> {
  const plugin = getNativePushPlugin();
  if (!plugin) return false;
  try {
    const result = await plugin.isRunning();
    return result.value;
  } catch {
    return false;
  }
}

export async function onNativePushAuthFailure(handler: () => void): Promise<() => void> {
  const plugin = getNativePushPlugin();
  if (!plugin) return () => {};
  try {
    const handle = await plugin.addListener("pushAuthFailure", () => { handler(); });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}
