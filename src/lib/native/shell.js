// Runtime glue for the Capacitor shell (ios/, android/, docs/MOBILE.md):
// splash, system bars, Android back button, background/foreground handling and
// the iOS keyboard bar. main.jsx loads this module and runs initNativeShell()
// only inside the shell, so the web never downloads it. Every @capacitor/* plugin is loaded with a dynamic
// import behind `isNative`, so the web bundle never carries them. The decisions
// live in shellLogic.js (tested); this file only talks to the platform.
import { goOffline, goOnline } from 'firebase/database'
import { isNative, isIOS, isAndroid, nativePlatform } from '../platform'
import { authReady } from '../auth'
import { db } from '../firebase'
import { requestNavigate, firstScreen } from './navigation'
import { setSystemTextZoom } from '../displayPrefs'
import { recordBootTime } from '../analytics'
import { chooseBackAction, hexForColor, settleWithin, systemBarStyleForBackground } from './shellLogic'

// The splash never outlives this, however slow or broken boot is.
const SPLASH_MAX_MS = 6000
const SPLASH_FADE_MS = 250
// How long a backgrounding app waits for listeners' last writes (the room's
// away stamp) before dropping the database connection.
const PAUSE_FLUSH_MS = 1500
// A dialog the back button should close with Escape (BottomSheet, modals).
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"], dialog[open]'

let started = false

/** No-op on the web. Safe to call once, before the first render. */
export function initNativeShell() {
  if (!isNative || started) return
  started = true
  // Synchronous, before React paints: native-only CSS (index.css) keys on it.
  document.documentElement.dataset.native = nativePlatform
  run('splash', startSplash)
  run('system bars', startSystemBars)
  run('back button', startBackButton)
  run('lifecycle', startLifecycle)
  run('keyboard', startKeyboard)
  run('text zoom', startTextZoom)
}

function run(name, fn) {
  Promise.resolve()
    .then(fn)
    .catch(err => console.warn(`[native] ${name} setup failed:`, err))
}

function warn(err) {
  console.warn('[native]', err)
}

// Resolves after the next paint; the timeout covers a page that is hidden at
// launch (requestAnimationFrame does not run then).
function afterPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
    setTimeout(resolve, 150)
  })
}

// launchAutoHide is off (capacitor.config.ts): hide once auth has settled AND
// the first screen has rendered, or after SPLASH_MAX_MS, whichever is first.
async function startSplash() {
  let hidden = false
  let hide = () => {}
  const timer = setTimeout(() => hide(), SPLASH_MAX_MS)
  const { SplashScreen } = await import('@capacitor/splash-screen')
  hide = () => {
    if (hidden) return
    hidden = true
    clearTimeout(timer)
    SplashScreen.hide({ fadeOutDuration: SPLASH_FADE_MS }).catch(warn)
  }
  Promise.all([authReady().catch(() => null), firstScreen]).then(afterPaint).then(() => {
    // Real-phone boot timing (analytics.js bootDaily): page start to first screen.
    recordBootTime(nativePlatform, performance.now())
    hide()
  })
}

// Status bar (and Android's gesture/navigation bar) content follows the theme:
// light icons on the dark themes, dark icons on the light ones. The active
// theme is data-theme on <html>, which swaps the --c-bg tokens. The ground is
// also saved for the next launch's splash (iOS GameNightViewController,
// Android MainActivity), so a dark-theme player is not greeted by the light
// default.
async function startSystemBars() {
  const [{ SystemBars }, { Preferences }] = await Promise.all([import('@capacitor/core'), import('@capacitor/preferences')])
  let last = null
  let lastGround = null
  const apply = () => {
    // Mid theme transition (theme.js switchTheme): restyle the bars once it
    // ends, so they do not flip while the old colours are still on screen.
    if (document.documentElement.dataset.themeVt) return
    const ground = getComputedStyle(document.documentElement).getPropertyValue('--c-bg')
    const style = systemBarStyleForBackground(ground)
    const hex = hexForColor(ground)
    if (hex && hex !== lastGround) {
      lastGround = hex
      Preferences.set({ key: 'splashBackground', value: hex }).catch(warn)
      Preferences.set({ key: 'splashDark', value: style === 'DARK' ? '1' : '0' }).catch(warn)
    }
    if (style === last) return
    last = style
    SystemBars.setStyle({ style }).catch(warn)
  }
  apply()
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-vt'] })
}

// Android only (iOS has no back button). Registering a listener replaces the
// plugin's default, so every case must be handled here.
async function startBackButton() {
  if (!isAndroid) return
  const { App } = await import('@capacitor/app')
  App.addListener('backButton', ({ canGoBack }) => handleBack(App, canGoBack, true))
}

function handleBack(App, canGoBack, allowEscape) {
  const dialog = allowEscape ? document.querySelector(DIALOG_SELECTOR) : null
  const action = chooseBackAction({
    hasModalMarker: !!window.history.state?.modalHistory,
    hasOpenDialog: !!dialog,
    canGoBack,
    pathname: window.location.pathname,
  })
  if (action === 'history') return window.history.back()
  if (action === 'home') return requestNavigate('/')
  if (action === 'exit') return App.minimizeApp().catch(warn)
  // 'escape': close it the way a keyboard user would. A dialog that ignores
  // Escape is still there a moment later; then fall through to history/home/exit.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
  setTimeout(() => { if (dialog?.isConnected) handleBack(App, canGoBack, false) }, 120)
}

// Backgrounded: drop the Realtime Database connection so the server runs the
// onDisconnect handlers now (presence goes offline cleanly) instead of after a
// socket timeout, and reconnect on return. 'native-pause' / 'native-resume' are
// window events for anything else that wants them; a 'native-pause' listener
// may pass a promise to event.detail.waitUntil (a last write, such as the
// room's away stamp) and the connection drops once it settles, or after
// PAUSE_FLUSH_MS. iOS reports true
// backgrounding with pause/resume; on Android pause fires for any overlay
// (share sheet), so appStateChange, which follows onStop, is the right signal.
async function startLifecycle() {
  const { App } = await import('@capacitor/app')
  let background = false
  let pauses = 0
  const toBackground = () => {
    if (background) return
    background = true
    const pause = ++pauses
    const pending = []
    window.dispatchEvent(new CustomEvent('native-pause', { detail: { waitUntil: (p) => pending.push(p) } }))
    settleWithin(pending, PAUSE_FLUSH_MS).then(() => {
      // Back in the foreground before the writes finished: stay connected.
      if (background && pause === pauses && db) goOffline(db)
    })
  }
  const toForeground = () => {
    if (!background) return
    background = false
    pauses++
    if (db) goOnline(db)
    window.dispatchEvent(new CustomEvent('native-resume'))
  }
  if (isAndroid) {
    App.addListener('appStateChange', ({ isActive }) => (isActive ? toForeground() : toBackground()))
  } else {
    App.addListener('pause', toBackground)
    App.addListener('resume', toForeground)
  }
}

// iOS shows a prev/next/done bar above the keyboard for web inputs. Every text
// field here has its own return key (send / next / done), so the bar is noise.
// Resize mode stays 'native' (capacitor.config.ts): the web view shrinks above
// the keyboard like a browser's visual viewport.
async function startKeyboard() {
  if (!isIOS) return
  const { Keyboard } = await import('@capacitor/keyboard')
  await Keyboard.setAccessoryBarVisible({ isVisible: false })
}

// The phone's text-size setting. Left alone, Android's web view scaled every
// px font by it (layouts clipped at 200 %) while iOS ignored Dynamic Type.
// Turn the web view's own scaling off and hand the setting to the app's TEXT
// SIZE (AUTO maps it to S/M/L/XL, layouts the app is tested at). Re-read on
// every return, since the player may have changed it in Settings meanwhile.
async function startTextZoom() {
  const { TextZoom } = await import('@capacitor/text-zoom')
  const sync = async () => {
    const { value } = await TextZoom.getPreferred()
    await TextZoom.set({ value: 1 })
    setSystemTextZoom(value)
  }
  await sync()
  window.addEventListener('native-resume', () => { sync().catch(warn) })
}
