// Background runner for Seclettr — runs every 15 min while app is backgrounded.
// Restricted JS runtime: no DOM, no modules, no localStorage, no cookies.
// Available globals: fetch, CapacitorPreferences, CapacitorLocalNotifications, addEventListener, dispatchEvent.

const POLL_TOKEN_KEY = "sc:background_poll_token";
const SERVER_URL_KEY = "sc:native_server_url";
const NOTIF_ID = 8800;

addEventListener("checkUnread", async function (event) {
  try {
    var tokenResult = await CapacitorPreferences.get({ key: POLL_TOKEN_KEY });
    var token = tokenResult.value;
    if (!token) return;

    var urlResult = await CapacitorPreferences.get({ key: SERVER_URL_KEY });
    var serverUrl = urlResult.value;
    if (!serverUrl) return;

    var res = await fetch(serverUrl + "/plain/conversations/unread-summary", {
      method: "GET",
      headers: { "Authorization": "Bearer " + token },
    });

    if (!res.ok) return;

    var data = await res.json();
    var totalUnread = data.totalUnread || 0;
    if (totalUnread <= 0) return;

    var body = totalUnread === 1
      ? "You have 1 unread message"
      : "You have " + totalUnread + " unread messages";

    await CapacitorLocalNotifications.schedule({
      notifications: [{
        id: NOTIF_ID,
        title: "Seclettr",
        body: body,
        smallIcon: "ic_stat_icon_config_sample",
        iconColor: "#4f8ef7",
      }],
    });
  } catch (e) {
    // Swallow all errors — background runner must not crash.
  }
});
