package com.seclettr.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class PushForegroundService extends Service {

    private static final String TAG = "SeclettrPush";
    private static final String CHANNEL_SERVICE = "seclettr_push_service";
    private static final String CHANNEL_MESSAGES = "seclettr_messages";
    private static final int NOTIF_SERVICE_ID = 1001;
    private static final int NOTIF_BASE_ID = 2000;
    private static final int MAX_RECONNECT_DELAY_MS = 30_000;
    private static final int INITIAL_RECONNECT_DELAY_MS = 1_000;

    private static boolean running = false;

    private OkHttpClient httpClient;
    private WebSocket webSocket;
    private String serverUrl;
    private String token;
    private String wsUrl;
    private int reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    private boolean intentionalClose = false;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());

    public static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "PushForegroundService created");
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_STICKY;
        }

        String action = intent.getAction();
        if (action == null) return START_STICKY;

        switch (action) {
            case NativePushPlugin.ACTION_START:
                String newServerUrl = intent.getStringExtra("serverUrl");
                String newToken = intent.getStringExtra("token");
                if (newServerUrl == null || newToken == null) {
                    Log.w(TAG, "start missing serverUrl or token");
                    break;
                }
                serverUrl = newServerUrl;
                token = newToken;
                wsUrl = deriveWsUrl(serverUrl);
                startForeground(NOTIF_SERVICE_ID, buildServiceNotification());
                running = true;
                connectWebSocket();
                break;

            case NativePushPlugin.ACTION_STOP:
                intentionalClose = true;
                closeWebSocket();
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
                running = false;
                break;

            case NativePushPlugin.ACTION_UPDATE_TOKEN:
                String updatedToken = intent.getStringExtra("token");
                if (updatedToken == null) break;
                token = updatedToken;
                reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
                closeWebSocket();
                connectWebSocket();
                break;
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "PushForegroundService destroyed");
        intentionalClose = true;
        closeWebSocket();
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── WebSocket ─────────────────────────────────────────────────────────────

    private void connectWebSocket() {
        if (wsUrl == null || token == null) return;

        if (httpClient == null) {
            httpClient = new OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(30, TimeUnit.SECONDS)
                .build();
        }

        String protocolHeader = "seclettr.v1, seclettr.auth." + token;
        Request request = new Request.Builder()
            .url(wsUrl)
            .addHeader("Sec-WebSocket-Protocol", protocolHeader)
            .build();

        Log.d(TAG, "Connecting WebSocket: " + wsUrl);
        httpClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                Log.d(TAG, "WebSocket connected");
                reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                handleWsMessage(text);
            }

            @Override
            public void onClosing(WebSocket ws, int code, String reason) {
                Log.d(TAG, "WebSocket closing: " + code + " " + reason);
                ws.close(code, reason);
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                Log.d(TAG, "WebSocket closed: " + code + " " + reason);
                webSocket = null;
                if (!intentionalClose) {
                    scheduleReconnect(code);
                }
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                Log.w(TAG, "WebSocket failure: " + (t != null ? t.getMessage() : "unknown"), t);
                webSocket = null;
                if (!intentionalClose) {
                    int code = response != null ? response.code() : 0;
                    scheduleReconnect(code);
                }
            }
        });
    }

    private void closeWebSocket() {
        if (webSocket != null) {
            webSocket.close(1000, "Service stopping");
            webSocket = null;
        }
        handler.removeCallbacksAndMessages(null);
    }

    private void scheduleReconnect(int closeCode) {
        if (closeCode == 4001) {
            Log.w(TAG, "Auth failure (4001) — waiting for new token");
            notifyAuthFailure();
            handler.postDelayed(() -> {
                if (!intentionalClose && token != null) {
                    connectWebSocket();
                }
            }, 30_000);
            return;
        }

        int delay = reconnectDelay;
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        long jitteredDelay = (long) (delay * (0.8 + Math.random() * 0.4));

        Log.d(TAG, "Reconnecting in " + jitteredDelay + "ms");
        handler.postDelayed(() -> {
            if (!intentionalClose) {
                connectWebSocket();
            }
        }, jitteredDelay);
    }

    // ── Message handling ──────────────────────────────────────────────────────

    private void handleWsMessage(String text) {
        try {
            JSONObject msg = new JSONObject(text);
            String type = msg.optString("type", "");

            if ("plain_message.new".equals(type)) {
                handlePlainMessageNew(msg.optJSONObject("message"));
            }
        } catch (JSONException e) {
            Log.w(TAG, "Failed to parse WS message", e);
        }
    }

    private void handlePlainMessageNew(JSONObject message) {
        if (message == null) return;

        String senderUsername = message.optString("senderUsername", "Unknown");
        String messageContent = message.optString("content", "");
        String messageType = message.optString("messageType", "text");
        String groupId = message.optString("groupId", null);
        String senderUserId = message.optString("senderUserId", "");
        String messageId = message.optString("id", UUID.randomUUID().toString());

        String content = formatContent(messageContent, messageType);

        String conversationKey;
        String title;
        if (groupId != null && !groupId.isEmpty()) {
            conversationKey = "group:" + groupId;
            title = senderUsername + " (group)";
        } else {
            conversationKey = "dm:" + senderUserId;
            title = senderUsername;
        }

        int notifId = NOTIF_BASE_ID + Math.abs(conversationKey.hashCode() % 1000);

        Intent tapIntent = new Intent(this, com.getcapacitor.BridgeActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, notifId, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(content)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(notifId, builder.build());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String deriveWsUrl(String apiUrl) {
        String wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
        String stripped = apiUrl
            .replaceFirst("^https?://", "")
            .replaceFirst("/api/?$", "")
            .replaceFirst("/$", "");
        return wsProtocol + "://" + stripped + "/ws";
    }

    private String formatContent(String content, String messageType) {
        switch (messageType) {
            case "voice_note": return "🎤 Voice message";
            case "video_note": return "🎥 Video message";
            case "attachment": return "📎 File";
            default: return content;
        }
    }

    private void createNotificationChannels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_SERVICE,
                "Push Service",
                NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Ongoing notification for push message service");
            nm.createNotificationChannel(serviceChannel);

            NotificationChannel messagesChannel = new NotificationChannel(
                CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            messagesChannel.setDescription("New message notifications");
            messagesChannel.enableVibration(true);
            nm.createNotificationChannel(messagesChannel);
        }
    }

    private Notification buildServiceNotification() {
        Intent tapIntent = new Intent(this, com.getcapacitor.BridgeActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Seclettr")
            .setContentText("Push notifications active")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    /**
     * Notifies the web layer via Capacitor event when our WS token expires.
     * Uses the static plugin reference set by NativePushPlugin on load().
     */
    private void notifyAuthFailure() {
        NativePushPlugin plugin = NativePushPlugin.getActiveInstance();
        if (plugin != null) {
            NativePushPlugin.emitAuthFailure(plugin);
        }
    }
}
