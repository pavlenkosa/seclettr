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
        am.setSpeakerphoneOn(enabled);
        call.resolve();
    }
}
