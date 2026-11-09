package rs.tijanaradenkovic.academicplanner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Recreate local alarms after device restart or APK update. */
public class PlannerReminderBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            PlannerReminderReceiver.restore(context);
        }
    }
}
