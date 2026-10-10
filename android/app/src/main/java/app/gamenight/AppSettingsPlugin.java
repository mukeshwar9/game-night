package app.gamenight;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Opens this app's notification settings, so a player who once refused
// notifications can turn them on (src/lib/native/appSettings.js). iOS needs no
// plugin: the web view opens the app-settings: URL itself.
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    @PluginMethod
    public void openNotifications(PluginCall call) {
        String pkg = getContext().getPackageName();
        Intent notifications = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(notifications);
            call.resolve();
            return;
        } catch (Exception ignored) {
            // Some launchers lack the notification screen: open the app's page.
        }
        try {
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(details);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings", e);
        }
    }
}
