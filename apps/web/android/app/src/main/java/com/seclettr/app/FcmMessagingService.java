package com.seclettr.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class FcmMessagingService extends FirebaseMessagingService {

    private static final String TAG = "SeclettrFCM";
    private static final String CHANNEL_MESSAGES = "seclettr_messages";
    private static final int NOTIF_BASE_ID = 3000;

    private static String currentFcmToken = null;
    private static final Map<String, Integer> conversationNotifIds = new ConcurrentHashMap<>();
    private static int notifIdCounter = NOTIF_BASE_ID;

    public static String getCurrentFcmToken() {
        return currentFcmToken;
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "New FCM token: " + token);
        currentFcmToken = token;

        NativePushPlugin plugin = NativePushPlugin.getActiveInstance();
        if (plugin != null) {
            plugin.notifyFcmToken(token);
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Log.d(TAG, "FCM message received");

        Map<String, String> data = message.getData();
        if (data == null || data.isEmpty()) {
            Log.w(TAG, "Empty FCM data payload");
            return;
        }

        String type = data.get("type");
        if (type == null) type = "";
        String serverUrl = data.get("serverUrl");
        if (serverUrl == null) serverUrl = "";
        String fromUsername = data.get("fromUsername");
        if (fromUsername == null) fromUsername = "";
        String url = data.get("url");
        if (url == null) url = "/";
        String deepLinkUrl = buildDeepLinkUrl(serverUrl, url);

        String conversationKey;
        int priority;

        switch (type) {
            case "message":
                conversationKey = "dm:" + data.get("fromUserId");
                priority = NotificationCompat.PRIORITY_HIGH;
                showMessageNotification(conversationKey, "Reply", deepLinkUrl, data, serverUrl, priority);
                break;

            case "group_message":
                conversationKey = "group:" + data.get("groupId");
                priority = NotificationCompat.PRIORITY_HIGH;
                showMessageNotification(conversationKey, "Reply", deepLinkUrl, data, serverUrl, priority);
                break;

            case "call_invite":
                String callId = data.get("callId");
                conversationKey = "call:" + (callId != null ? callId : "unknown");
                priority = NotificationCompat.PRIORITY_HIGH;
                String answerUrl = deepLinkUrl;
                String declineUrl = deepLinkUrl;
                showCallNotification(conversationKey, "Incoming call", fromUsername + " is calling",
                    answerUrl, declineUrl, priority, true);
                break;

            case "group_call_invite":
                String gCallId = data.get("callId");
                conversationKey = "call:" + (gCallId != null ? gCallId : "unknown");
                priority = NotificationCompat.PRIORITY_HIGH;
                String joinUrl = deepLinkUrl;
                String gDeclineUrl = deepLinkUrl;
                String groupName = data.get("groupName");
                if (groupName == null) groupName = "Group";
                showCallNotification(conversationKey, "Group call", groupName + " — call started",
                    joinUrl, gDeclineUrl, priority, true);
                break;

            case "missed_call":
                String mcId = data.get("callId");
                conversationKey = "call:" + (mcId != null ? mcId : "unknown");
                priority = NotificationCompat.PRIORITY_DEFAULT;
                showMissedCallNotification(conversationKey, deepLinkUrl, priority);
                break;

            default:
                Log.w(TAG, "Unknown FCM message type: " + type);
        }
    }

    private void showMessageNotification(String conversationKey, String replyLabel,
                                          String deepLinkUrl, Map<String, String> data,
                                          String serverUrl, int priority) {
        int notifId = getOrCreateNotifId(conversationKey);

        String title = data.get("fromUsername");
        if (title == null || title.isEmpty()) title = "Seclettr";
        String body = data.get("body");
        if (body == null || body.isEmpty()) body = "New message";

        PendingIntent tapIntent = buildTapIntent(deepLinkUrl, notifId);
        PendingIntent replyIntent = buildNavigateIntent(deepLinkUrl, notifId + 1);
        PendingIntent markReadIntent = buildNavigateIntent(deepLinkUrl, notifId + 2);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tapIntent)
            .setPriority(priority)
            .addAction(R.drawable.ic_stat_notification, replyLabel, replyIntent)
            .addAction(R.drawable.ic_stat_notification, "Mark as read", markReadIntent);

        notify(notifId, builder);
    }

    private void showCallNotification(String conversationKey, String title, String body,
                                       String answerUrl, String declineUrl,
                                       int priority, boolean requireInteraction) {
        int notifId = getOrCreateNotifId(conversationKey);

        PendingIntent tapIntent = buildTapIntent(answerUrl, notifId);
        PendingIntent answerIntent = buildNavigateIntent(answerUrl, notifId + 1);
        PendingIntent declineIntent = buildNavigateIntent(declineUrl, notifId + 2);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tapIntent)
            .setPriority(priority)
            .setFullScreenIntent(tapIntent, true)
            .addAction(R.drawable.ic_stat_notification, "Answer", answerIntent)
            .addAction(R.drawable.ic_stat_notification, "Decline", declineIntent);

        notify(notifId, builder);
    }

    private void showMissedCallNotification(String conversationKey, String deepLinkUrl, int priority) {
        int notifId = getOrCreateNotifId(conversationKey);

        PendingIntent tapIntent = buildTapIntent(deepLinkUrl, notifId);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle("Missed call")
            .setContentText("You missed a call")
            .setAutoCancel(true)
            .setContentIntent(tapIntent)
            .setPriority(priority);

        notify(notifId, builder);
    }

    private PendingIntent buildNavigateIntent(String deepLinkUrl, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLinkUrl));
        intent.setClass(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private PendingIntent buildTapIntent(String deepLinkUrl, int requestCode) {
        return buildNavigateIntent(deepLinkUrl, requestCode);
    }

    private void notify(int notifId, NotificationCompat.Builder builder) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(notifId, builder.build());
        }
    }

    private static int getOrCreateNotifId(String key) {
        return conversationNotifIds.computeIfAbsent(key, k -> notifIdCounter++);
    }

    private String buildDeepLinkUrl(String serverUrl, String path) {
        if (serverUrl.isEmpty()) return path;
        String base = serverUrl.replaceFirst("/api/?$", "");
        if (path.startsWith("/")) return base + path;
        return base + "/" + path;
    }
}
