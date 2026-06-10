package com.seclettr.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "NativePush",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class NativePushPlugin extends Plugin {

    private static final String PERMISSION_ALIAS = "notifications";

    static final String ACTION_START = "start";
    static final String ACTION_STOP = "stop";
    static final String ACTION_UPDATE_TOKEN = "updateToken";
    static final String EVENT_AUTH_FAILURE = "pushAuthFailure";
    static final String EVENT_FCM_TOKEN = "fcmTokenReceived";

    private static NativePushPlugin activeInstance = null;
    private String fcmToken = null;
    private boolean fcmActive = false;

    public static NativePushPlugin getActiveInstance() {
        return activeInstance;
    }

    @Override
    public void load() {
        super.load();
        activeInstance = this;

        // Eagerly prime the in-memory FCM token cache so the first getFcmToken()
        // call returns the real token instead of "".  onNewToken() is NOT called
        // on every app launch (only on token rotation), so without this the JS
        // layer always sees an empty token and starts the WS foreground service
        // even when FCM is properly configured.
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    if (token != null && !token.isEmpty()) {
                        fcmToken = token;
                    }
                });
        } catch (Exception e) {
            // Firebase unavailable (e.g., no google-services.json in dev build) — ignore.
        }
    }

    @Override
    protected void handleOnDestroy() {
        activeInstance = null;
        super.handleOnDestroy();
    }

    void notifyFcmToken(String token) {
        fcmToken = token;
        JSObject result = new JSObject();
        result.put("token", token);
        notifyListeners(EVENT_FCM_TOKEN, result);
    }

    @PluginMethod
    public void getFcmToken(PluginCall call) {
        // Serve from cache if already populated (by load() or onNewToken()).
        if (fcmToken != null && !fcmToken.isEmpty()) {
            JSObject result = new JSObject();
            result.put("token", fcmToken);
            call.resolve(result);
            return;
        }

        // Cache cold — fetch from Firebase SDK.  This path runs on first launch
        // before load()'s async getToken() has completed.
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    fcmToken = (token != null) ? token : "";
                    JSObject result = new JSObject();
                    result.put("token", fcmToken);
                    call.resolve(result);
                })
                .addOnFailureListener(e -> {
                    JSObject result = new JSObject();
                    result.put("token", "");
                    call.resolve(result);
                });
        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("token", "");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void useFcm(PluginCall call) {
        fcmActive = true;
        // Persist the flag so BootReceiver and PushForegroundService skip the
        // WS fallback after process death / device reboot.
        getContext().getSharedPreferences("seclettr_push_state", android.content.Context.MODE_PRIVATE)
            .edit().putBoolean("use_fcm", true).apply();
        call.resolve();
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            result.put("value", "granted");
        } else {
            boolean granted = ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
            result.put("value", granted ? "granted" : "denied");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("value", "granted");
            call.resolve(result);
            return;
        }

        if (ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("value", "granted");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias(PERMISSION_ALIAS, call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = getPermissionStates().containsKey(PERMISSION_ALIAS)
            && Boolean.TRUE.equals(getPermissionStates().get(PERMISSION_ALIAS));
        result.put("value", granted ? "granted" : "denied");
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String serverUrl = call.getString("serverUrl");
        String token = call.getString("token");

        if (serverUrl == null || token == null) {
            call.reject("serverUrl and token are required");
            return;
        }

        // When FCM is active, skip the WebSocket ForegroundService
        if (fcmActive) {
            call.resolve();
            return;
        }

        Intent intent = new Intent(getContext(), PushForegroundService.class);
        intent.setAction(ACTION_START);
        intent.putExtra("serverUrl", serverUrl);
        intent.putExtra("token", token);

        try {
            getContext().startForegroundService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start push service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        // Clear the persisted FCM flag so the WS fallback can restart on next
        // boot if FCM becomes unavailable (e.g., user clears app data and FCM
        // token registration fails on next launch).
        getContext().getSharedPreferences("seclettr_push_state", android.content.Context.MODE_PRIVATE)
            .edit().putBoolean("use_fcm", false).apply();

        Intent intent = new Intent(getContext(), PushForegroundService.class);
        intent.setAction(ACTION_STOP);

        try {
            getContext().startService(intent);
        } catch (Exception e) {
            call.reject("Failed to stop push service: " + e.getMessage());
            return;
        }

        call.resolve();
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
        if (fcmActive) {
            call.resolve();
            return;
        }

        String token = call.getString("token");
        if (token == null) {
            call.reject("token is required");
            return;
        }

        Intent intent = new Intent(getContext(), PushForegroundService.class);
        intent.setAction(ACTION_UPDATE_TOKEN);
        intent.putExtra("token", token);

        try {
            getContext().startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to update push token: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", fcmActive || PushForegroundService.isRunning());
        call.resolve(result);
    }

    static void emitAuthFailure(NativePushPlugin plugin) {
        plugin.notifyListeners(EVENT_AUTH_FAILURE, new JSObject());
    }
}
