// @ts-check
// Opens the phone's settings for this app, where a player who once refused
// notifications can allow them. iOS: the web view hands the app-settings: URL
// to the system (Capacitor opens unknown schemes with UIApplication.open).
// Android: the app-local AppSettings plugin (android/.../AppSettingsPlugin.java).
import { registerPlugin } from '@capacitor/core'
import { isAndroid, isIOS } from '../platform'

/** @type {{ openNotifications: () => Promise<void> } | null} */
let androidPlugin = null

/** @returns {Promise<boolean>} whether the settings screen could be opened */
export async function openAppNotificationSettings() {
  try {
    if (isIOS) {
      window.open('app-settings:', '_blank')
      return true
    }
    if (isAndroid) {
      androidPlugin ??= registerPlugin('AppSettings')
      await androidPlugin.openNotifications()
      return true
    }
  } catch (err) {
    console.warn('[native] could not open settings:', err)
  }
  return false
}
