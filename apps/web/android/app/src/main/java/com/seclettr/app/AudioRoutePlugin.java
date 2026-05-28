package com.seclettr.app;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private AudioManager getAudioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void isSpeakerOn(PluginCall call) {
        AudioManager am = getAudioManager();
        JSObject result = new JSObject();
        result.put("value", am != null && am.isSpeakerphoneOn());
        call.resolve(result);
    }

    @PluginMethod
    public void setSpeaker(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Missing 'enabled' parameter");
            return;
        }
        AudioManager am = getAudioManager();
        if (am == null) {
            call.reject("AudioManager unavailable");
            return;
        }
        // MODE_IN_COMMUNICATION is required for setSpeakerphoneOn to take
        // effect during a WebRTC call. WebRTC sets this mode itself, but
        // may not have done so yet when we first apply the earpiece default.
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
        am.setSpeakerphoneOn(enabled);
        call.resolve();
    }

    /**
     * Returns the set of currently available audio routes and the active one.
     * hasBluetooth is true when a Bluetooth SCO-capable headset is connected.
     * currentRoute is "earpiece" | "speaker" | "bluetooth".
     */
    @PluginMethod
    public void getAudioRoutes(PluginCall call) {
        AudioManager am = getAudioManager();
        if (am == null) {
            call.reject("AudioManager unavailable");
            return;
        }
        boolean bluetoothScoOn = am.isBluetoothScoOn();
        boolean a2dpOn = am.isBluetoothA2dpOn();
        boolean hasBluetooth = bluetoothScoOn || a2dpOn;
        String currentRoute;
        if (am.isSpeakerphoneOn()) {
            currentRoute = "speaker";
        } else if (bluetoothScoOn) {
            currentRoute = "bluetooth";
        } else {
            currentRoute = "earpiece";
        }
        JSObject result = new JSObject();
        result.put("hasEarpiece", true);  // always available on phones
        result.put("hasSpeaker", true);
        result.put("hasBluetooth", hasBluetooth);
        result.put("currentRoute", currentRoute);
        call.resolve(result);
    }

    /**
     * Switches the active audio route.
     * route: "earpiece" | "speaker" | "bluetooth"
     */
    @PluginMethod
    public void setAudioRoute(PluginCall call) {
        String route = call.getString("route");
        if (route == null) {
            call.reject("Missing 'route' parameter");
            return;
        }
        AudioManager am = getAudioManager();
        if (am == null) {
            call.reject("AudioManager unavailable");
            return;
        }
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
        switch (route) {
            case "speaker":
                am.stopBluetoothSco();
                am.setBluetoothScoOn(false);
                am.setSpeakerphoneOn(true);
                break;
            case "bluetooth":
                am.setSpeakerphoneOn(false);
                am.startBluetoothSco();
                am.setBluetoothScoOn(true);
                break;
            default: // "earpiece"
                am.stopBluetoothSco();
                am.setBluetoothScoOn(false);
                am.setSpeakerphoneOn(false);
                break;
        }
        call.resolve();
    }
}
