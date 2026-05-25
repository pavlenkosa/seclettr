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

    private static NativePushPlugin activeInstance = null;
    private PluginCall pendingPermissionCall = null;

    public static NativePushPlugin getActiveInstance() {
        return activeInstance;
    }

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        activeInstance = null;
        super.handleOnDestroy();
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

        pendingPermissionCall = call;
        requestPermissionForAlias(PERMISSION_ALIAS, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = getPermissionStates().containsKey(PERMISSION_ALIAS)
            && Boolean.TRUE.equals(getPermissionStates().get(PERMISSION_ALIAS));
        result.put("value", granted ? "granted" : "denied");

        PluginCall pending = pendingPermissionCall;
        pendingPermissionCall = null;
        if (pending != null) {
            pending.resolve(result);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        String serverUrl = call.getString("serverUrl");
        String token = call.getString("token");

        if (serverUrl == null || token == null) {
            call.reject("serverUrl and token are required");
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
        Intent intent = new Intent(getContext(), PushForegroundService.class);
        intent.setAction(ACTION_STOP);

        try {
            getContext().startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop push service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
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
        result.put("value", PushForegroundService.isRunning());
        call.resolve(result);
    }

    static void emitAuthFailure(NativePushPlugin plugin) {
        plugin.notifyListeners(EVENT_AUTH_FAILURE, new JSObject());
    }
}
