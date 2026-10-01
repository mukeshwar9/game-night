import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installGlobalErrorHandlers } from './lib/telemetry'
import { captureFirstTouch } from './lib/attribution'
import { recordFunnel } from './lib/analytics'
import { isNative, nativePlatform } from './lib/platform'
import { NATIVE_PUSH } from './lib/features'

// Before the first render, so errors thrown while the app boots are reported
// too. ErrorBoundary covers render-time crashes; these cover event handlers,
// timers and async code (telemetry.js).
installGlobalErrorHandlers()

// Remember where this visitor came from (UTM / click id / referrer) before the
// first render, then count the landing. In-house only: see attribution.js.
captureFirstTouch()
recordFunnel('landed')

// Capacitor shell only; the web never loads any of it. data-native is set
// before the first render so the native-only CSS (index.css) is in place when
// React paints. initNativeShell hides the splash once the first screen is up,
// themes the system bars and handles Android back and app pause/resume. Deep
// links and notification taps (which can cold-start the app) are listened for
// before the router mounts; the path waits in lib/native/navigation.js.
if (isNative) {
  document.documentElement.dataset.native = nativePlatform
  import('./lib/native/shell').then(m => m.initNativeShell())
  import('./lib/native/deepLinks').then(m => m.initDeepLinks())
  if (NATIVE_PUSH) import('./lib/native/nativePush').then(m => m.initNativePush())
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
