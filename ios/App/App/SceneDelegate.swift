import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GameNightViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The bridge view controller with the native touches the web build cannot
/// provide on its own.
class GameNightViewController: CAPBridgeViewController {
    /// The splash and the web view's ground follow the player's last theme,
    /// which the app saves on every theme change (@capacitor/preferences key
    /// `splashBackground`, src/lib/native/shell.js). Without it a player on a
    /// dark theme saw the light default splash, then a hard switch to dark.
    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        guard let hex = UserDefaults.standard.string(forKey: "CapacitorStorage.splashBackground"),
              hex.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else {
            return descriptor
        }
        descriptor.backgroundColor = UIColor.capacitor.color(fromHex: hex)
        var plugins = descriptor.pluginConfigurations
        var splash = plugins["SplashScreen"] as? [String: Any] ?? [:]
        splash["backgroundColor"] = hex
        plugins["SplashScreen"] = splash
        descriptor.pluginConfigurations = plugins
        return descriptor
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Edge swipe goes back like in Safari: the app's routes are history
        // entries, so this steps back through them (and the in-match leave
        // guard, useBackGuard, still catches the resulting popstate).
        webView?.allowsBackForwardNavigationGestures = true
    }
}
