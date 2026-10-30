package rs.tijanaradenkovic.academicplanner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlannerFilesPlugin.class);
        registerPlugin(PlannerRemindersPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
