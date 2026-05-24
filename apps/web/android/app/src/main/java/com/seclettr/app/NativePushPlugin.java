package com.seclettr.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativePush")
public class NativePushPlugin extends Plugin {

    static final String ACTION_START = "start";
    static final String ACTION_STOP = "stop";
    static final String ACTION_UPDATE_TOKEN = "updateToken";
    static final String EVENT_AUTH_FAILURE = "pushAuthFailure";

    private static NativePushPlugin activeInstance = null;

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
