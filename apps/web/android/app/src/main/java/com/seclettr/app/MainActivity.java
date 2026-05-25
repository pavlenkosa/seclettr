package com.seclettr.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "SeclettrMain";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePushPlugin.class);
        registerPlugin(AudioRoutePlugin.class);
        super.onCreate(savedInstanceState);
        handleDeepLinkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleDeepLinkIntent(intent);
    }

    private void handleDeepLinkIntent(Intent intent) {
        if (intent == null) return;

        Uri data = intent.getData();
        if (data != null) {
            Log.d(TAG, "Deep link: " + data);
            // Capacitor 8 AppPlugin fires appUrlOpen event natively via
            // BridgeActivity.load() → onNewIntent(getIntent()) for cold start
            // AND via onNewIntent(intent) for subsequent launches.
            // This override exists solely for debug logging.
        }
    }
}
