import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installGlobalErrorHandlers } from './lib/telemetry'

// Before the first render, so errors thrown while the app boots are reported
// too. ErrorBoundary covers render-time crashes; these cover event handlers,
// timers and async code (telemetry.js).
installGlobalErrorHandlers()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
