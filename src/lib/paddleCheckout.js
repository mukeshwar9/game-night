// Loads Paddle.js and opens the checkout for a Paddle Billing transaction on
// our own page (the default payment link). Rules are in paddleCheckoutLogic.js.
import { paddleSetup } from './paddleCheckoutLogic'

const PADDLE_SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js'
let script = null
let initialized = false
let onEvent = () => {}

/** The client-side token and environment from the build (VITE_PADDLE_*). */
export function paddleConfig() {
  return paddleSetup({ token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN, env: import.meta.env.VITE_PADDLE_ENV })
}

function loadPaddle() {
  if (window.Paddle) return Promise.resolve(window.Paddle)
  if (!script) {
    script = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = PADDLE_SCRIPT
      s.async = true
      s.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error('paddle-unavailable')))
      s.onerror = () => { script = null; reject(new Error('paddle-unavailable')) }
      document.head.appendChild(s)
    })
  }
  return script
}

/**
 * Opens Paddle's overlay checkout for `transactionId`. `handlers.onEvent` gets
 * every Paddle.js event ({ name, data }), e.g. 'checkout.completed' and
 * 'checkout.closed'. Throws 'no-token' / 'token-env-mismatch' when the build is
 * not configured, or 'paddle-unavailable' when the script cannot load.
 */
export async function openPaddleCheckout(transactionId, handlers = {}) {
  const cfg = paddleConfig()
  if (!cfg.ok) throw new Error(cfg.reason)
  onEvent = handlers.onEvent || (() => {})
  const Paddle = await loadPaddle()
  if (!initialized) {
    if (cfg.environment === 'sandbox') Paddle.Environment.set('sandbox')
    Paddle.Initialize({ token: cfg.token, eventCallback: (ev) => onEvent(ev) })
    initialized = true
  }
  Paddle.Checkout.open({ transactionId })
  return Paddle
}

export function closePaddleCheckout() {
  try { window.Paddle?.Checkout?.close() } catch { /* already closed */ }
}
