// Ad traffic: a stranger who tapped an ad should be playing within one tap,
// with a short list of games that work on a phone in a minute, not the whole
// catalogue. HEADLINE_GAMES is that list (all turn-based or solo-friendly, so a
// visitor never waits for an opponent), and /play/<game> is the ad URL that
// drops straight into one of them. UTM tags survive the redirect untouched, so
// attribution.js still sees the original query.

// Order is display order. Every entry needs registry `solo: true` and a
// Demo.jsx entry (adLanding.test.js checks the registry half).
export const HEADLINE_GAMES = [
  { type: 'connectfour', pitch: 'Drop discs, get four in a row' },
  { type: 'dotsandboxes', pitch: 'Close boxes, take extra turns' },
  { type: 'battleship', pitch: 'Sink the hidden fleet' },
  { type: 'wordduel', pitch: 'Guess the word before the CPU' },
  { type: 'trivia', pitch: 'Fast answers score more' },
  { type: 'animalstack', pitch: 'Stack the animals, do not topple' },
]

export const DEFAULT_LANDING_GAME = HEADLINE_GAMES[0].type

export function isHeadlineGame(type) {
  return HEADLINE_GAMES.some(g => g.type === type)
}

// Where /play/<type> sends the visitor: the solo page of that game when it is
// a headline game, else of the default one. `search` (with its "?") is kept.
export function landingPath(type, search = '') {
  const game = isHeadlineGame(type) ? type : DEFAULT_LANDING_GAME
  const q = typeof search === 'string' && search.startsWith('?') && search.length > 1 ? search : ''
  return `/solo/${game}${q}`
}

const AD_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid', 'ttclid', 'msclkid']

// Whether this visit came from a campaign link (or the /play redirect), which
// is when the solo page shows the headline strip in place of the full picker.
export function isAdVisit(search = '', state = null) {
  if (state && state.landing) return true
  try {
    const params = new URLSearchParams(search)
    return AD_PARAMS.some(name => params.has(name))
  } catch { return false }
}
