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
        // Заставка «Звук першим» (17.10) звучить із першої секунди, ще до дотику: гравець щойно
        // натиснув іконку, і цей дотик — уже його дозвіл. Без цього WebView глушить Web Audio до тапу.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
