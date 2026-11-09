package rs.tijanaradenkovic.academicplanner;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/** Device-only reminder alarms. No server or notification content leaves the device. */
public class PlannerReminderReceiver extends BroadcastReceiver {
    static final String ACTION_NOTIFY = "rs.tijanaradenkovic.academicplanner.NOTIFY";
    static final String CHANNEL_ID = "planner_deadlines";
    static final String PREFS = "planner_local_reminders";
    static final String ITEMS = "scheduled_items";
    static final int MAX_ITEMS = 160;

    static int alarmId(String key) { return ("ap:" + key).hashCode() & 0x7fffffff; }

    static PendingIntent alarmIntent(Context ctx, String key, String title, String body) {
        Intent intent = new Intent(ctx, PlannerReminderReceiver.class);
        intent.setAction(ACTION_NOTIFY);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("id", alarmId(key));
        return PendingIntent.getBroadcast(ctx, alarmId(key), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void sync(Context ctx, JSONArray incoming) throws Exception {
        AlarmManager alarms = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray previous;
        try { previous = new JSONArray(prefs.getString(ITEMS, "[]")); }
        catch (Exception e) { previous = new JSONArray(); }
        for (int i = 0; i < previous.length(); i++) {
            JSONObject old = previous.optJSONObject(i);
            if (old == null) continue;
            String key = old.optString("id", "");
            if (key.isEmpty()) continue;
            PendingIntent pending = alarmIntent(ctx, key, "", "");
            alarms.cancel(pending);
            pending.cancel();
        }
        JSONArray accepted = new JSONArray();
        long now = System.currentTimeMillis();
        for (int i = 0; i < incoming.length() && accepted.length() < MAX_ITEMS; i++) {
            JSONObject item = incoming.optJSONObject(i);
            if (item == null) continue;
            String key = item.optString("id", "");
            String title = item.optString("title", "Academic Planner");
            String body = item.optString("body", "You have an upcoming deadline");
            long at = item.optLong("at", 0);
            if (key.isEmpty() || at <= now || at > now + 370L * 86400000L) continue;
            JSONObject safe = new JSONObject();
            safe.put("id", key);
            safe.put("title", title.length() > 180 ? title.substring(0, 180) : title);
            safe.put("body", body.length() > 240 ? body.substring(0, 240) : body);
            safe.put("at", at);
            accepted.put(safe);
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at,
                    alarmIntent(ctx, key, safe.getString("title"), safe.getString("body")));
        }
        prefs.edit().putString(ITEMS, accepted.toString()).apply();
    }

    static void restore(Context ctx) {
        try {
            JSONArray saved = new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(ITEMS, "[]"));
            sync(ctx, saved);
        } catch (Exception ignored) { /* Next app opening will resynchronize. */ }
    }

    private static void notifyUser(Context ctx, Intent intent) {
        if (Build.VERSION.SDK_INT >= 33 &&
                ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Academic Planner reminders",
                    NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Conference, grant, paper and other deadlines");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent click = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, CHANNEL_ID) : new Notification.Builder(ctx);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(intent.getStringExtra("title"))
                .setContentText(intent.getStringExtra("body"))
                .setStyle(new Notification.BigTextStyle().bigText(intent.getStringExtra("body")))
                .setContentIntent(click).setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE);
        manager.notify(intent.getIntExtra("id", 0), builder.build());
    }

    @Override public void onReceive(Context ctx, Intent intent) {
        if (intent == null) return;
        if (ACTION_NOTIFY.equals(intent.getAction())) notifyUser(ctx, intent);
        else if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) ||
                 Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) restore(ctx);
    }
}
