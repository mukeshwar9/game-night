// Global database-connection banner state (F-49). Pure — no DOM/Firebase.
//
// Keeps the Firebase transport (`.info/connected`) authoritative and the
// browser's online/offline events as an extra hint: an `online` event alone
// never counts as connected.
//
//   hidden       connected, or still inside a grace window
//   offline      the browser says there is no network
//   lost         connected earlier this session, then lost for a while
//   unreachable  never connected since the app opened (first connection
//                failed), past the initial grace window
export const LOST_GRACE_MS = 2500
export const INITIAL_GRACE_MS = 8000

export function connectionBannerState({ netOffline, everConnected, signalLost, initialExpired }) {
  if (netOffline) return 'offline'
  if (everConnected) return signalLost ? 'lost' : 'hidden'
  return initialExpired ? 'unreachable' : 'hidden'
}

export const CONNECTION_COPY = {
  offline: 'OFFLINE — CHECK YOUR CONNECTION',
  lost: 'SIGNAL LOST — RECONNECTING',
  unreachable: "CAN'T REACH THE SERVER",
}
