package rs.tijanaradenkovic.academicplanner;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/** Native local reminders; permission is requested only after an explicit opt-in. */
@CapacitorPlugin(name = "PlannerReminders", permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class PlannerRemindersPlugin extends Plugin {
    @PluginMethod
    public void sync(PluginCall call) {
        try {
            if (call.getArray("items") == null) { call.reject("Missing reminder list."); return; }
            PlannerReminderReceiver.sync(getContext(), call.getArray("items"));
            JSObject result = new JSObject();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not schedule Android reminders.", e);
        }
    }
}
