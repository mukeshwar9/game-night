import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installGlobalErrorHandlers } from './lib/telemetry'
import { captureFirstTouch } from './lib/attribution'
import { recordFunnel } from './lib/analytics'

// Before the first render, so errors thrown while the app boots are reported
// too. ErrorBoundary covers render-time crashes; these cover event handlers,
// timers and async code (telemetry.js).
installGlobalErrorHandlers()

// Remember where this visitor came from (UTM / click id / referrer) before the
// first render, then count the landing. In-house only: see attribution.js.
captureFirstTouch()
recordFunnel('landed')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
