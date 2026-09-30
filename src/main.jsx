import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installGlobalErrorHandlers } from './lib/telemetry'
import { captureFirstTouch } from './lib/attribution'
import { recordFunnel } from './lib/analytics'
import { initNativeShell } from './lib/native/shell'
import { isNative } from './lib/platform'
import { NATIVE_PUSH } from './lib/features'

// Before the first render, so errors thrown while the app boots are reported
// too. ErrorBoundary covers render-time crashes; these cover event handlers,
// timers and async code (telemetry.js).
installGlobalErrorHandlers()

// Remember where this visitor came from (UTM / click id / referrer) before the
// first render, then count the landing. In-house only: see attribution.js.
captureFirstTouch()
recordFunnel('landed')

// Capacitor shell only (no-op on the web): marks <html data-native>, hides the
// native splash once the first screen is up, themes the system bars, handles
// Android back and app pause/resume. Before the first render so data-native is
// in place when React paints.
initNativeShell()
// Opened invite links, and taps on invite notifications (which can cold-start
// the app, so the listener must exist before the router mounts; the path waits
// in lib/native/navigation.js until it does).
if (isNative) {
  import('./lib/native/deepLinks').then(m => m.initDeepLinks())
  if (NATIVE_PUSH) import('./lib/native/nativePush').then(m => m.initNativePush())
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
