package app.gamenight;

import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins register before the bridge starts.
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // iOS suspends the web view when the app leaves the foreground; Android
    // leaves it running unless told otherwise. Pausing it hides the page
    // (visibilitychange fires, requestAnimationFrame loops and audio stop) so a
    // backgrounded game does not burn battery. JavaScript itself keeps running,
    // so the bridge's pause/resume events (src/lib/native/shell.js) still arrive.
    @Override
    public void onPause() {
        super.onPause();
        WebView webView = webView();
        if (webView != null) webView.onPause();
        setSplashTheme();
    }

    // The system splash cannot change colour once launch has begun, but from
    // Android 13 the app can pick the theme for its next cold start. The app
    // saves whether the player's theme is dark on every theme change
    // (@capacitor/preferences key splashDark, src/lib/native/shell.js).
    private void setSplashTheme() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        boolean dark = "1".equals(prefs.getString("splashDark", null));
        try {
            getSplashScreen().setSplashScreenTheme(dark ? R.style.AppTheme_NoActionBarLaunch_Dark : R.style.AppTheme_NoActionBarLaunch);
        } catch (Exception ignored) {
            // Never let a cosmetic setting take the app down.
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        WebView webView = webView();
        if (webView != null) webView.onResume();
    }

    private WebView webView() {
        return getBridge() != null ? getBridge().getWebView() : null;
    }
}
