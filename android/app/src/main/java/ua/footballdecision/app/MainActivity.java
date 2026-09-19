package ua.footballdecision.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Единое поведение на всех версиях Android: окно под полосами, отступы даёт Capacitor
        // (SystemBars.insetsHandling в capacitor.config.ts). На Android 15+ это и так принудительно.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
