// Pure RTCPeerConnection config builder. rtc.js reads the env vars (see its
// header) and passes them in; this module only decides the shape.
//
// - Public STUN is always present.
// - TURN servers are added only when URLs AND a username AND a credential are
//   all set — a turn: URL without credentials makes the RTCPeerConnection
//   constructor throw, which would break every real-time game.
// - Public rooms (strangers from /online) with TURN configured use
//   iceTransportPolicy 'relay', so neither peer ever learns the other's IP
//   address. Private rooms (friends) keep 'all' and only fall back to TURN
//   when a direct path fails (symmetric NATs).

export const PUBLIC_STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/** Split a comma-separated URL list, keeping only turn:/turns: entries. */
export function parseTurnUrls(raw) {
  if (typeof raw !== 'string') return []
  return raw.split(',').map(s => s.trim()).filter(s => /^turns?:/i.test(s))
}

/** Pull the TURN settings out of a Vite `import.meta.env`-shaped object. */
export function readTurnEnv(env = {}) {
  return {
    turnUrls: parseTurnUrls(env.VITE_TURN_URLS),
    turnUsername: typeof env.VITE_TURN_USERNAME === 'string' ? env.VITE_TURN_USERNAME.trim() : '',
    turnCredential: typeof env.VITE_TURN_CREDENTIAL === 'string' ? env.VITE_TURN_CREDENTIAL.trim() : '',
  }
}

export function isTurnConfigured({ turnUrls = [], turnUsername = '', turnCredential = '' } = {}) {
  return turnUrls.length > 0 && !!turnUsername && !!turnCredential
}

/**
 * @param {object} o
 * @param {string[]} [o.turnUrls]
 * @param {string} [o.turnUsername]
 * @param {string} [o.turnCredential]
 * @param {boolean} [o.isPublic]   room is listed in the public lobby
 * @returns {RTCConfiguration}
 */
export function buildIceConfig({ turnUrls = [], turnUsername = '', turnCredential = '', isPublic = false } = {}) {
  const iceServers = PUBLIC_STUN.map(s => ({ ...s }))
  const turn = isTurnConfigured({ turnUrls, turnUsername, turnCredential })
  if (turn) iceServers.push({ urls: [...turnUrls], username: turnUsername, credential: turnCredential })
  return {
    iceServers,
    iceTransportPolicy: turn && isPublic ? 'relay' : 'all',
  }
}
