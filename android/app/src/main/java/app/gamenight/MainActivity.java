package app.gamenight;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
