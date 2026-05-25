package com.seclettr.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "SeclettrBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        Log.d(TAG, "Boot completed — scheduling push service start");

        Intent serviceIntent = new Intent(context, PushForegroundService.class);
        PendingIntent pi = PendingIntent.getService(
            context, 0, serviceIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            // 2-second delay avoids ForegroundServiceStartNotAllowedException
            // on Android 12+ when starting a FG service directly from a receiver.
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 2000, pi);
        }
    }
}
