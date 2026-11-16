package rs.tijanaradenkovic.academicplanner;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Save exports through Android's document picker, without storage permissions. */
@CapacitorPlugin(name = "PlannerFiles")
public class PlannerFilesPlugin extends Plugin {
    private boolean saving = false;

    @PluginMethod
    public void save(PluginCall call) {
        if (saving) { call.reject("Another save dialog is already open."); return; }
        if (call.getString("text") == null) { call.reject("Missing file contents."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "text/plain"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "academic-planner.txt"));
        saving = true;
        try { startActivityForResult(call, intent, "documentCreated"); }
        catch (Exception e) { saving = false; call.reject("Could not open the save dialog.", e); }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        saving = false;
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
            if (stream == null) throw new java.io.IOException("Could not open the selected document.");
            stream.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            JSObject response = new JSObject();
            response.put("saved", true);
            call.resolve(response);
        } catch (Exception e) { call.reject("Could not save the document.", e); }
    }
}
