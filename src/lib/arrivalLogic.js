// @ts-check
// The moment a friend arrives: the "NAME IS HERE!" beat and the short 3·2·1
// before a turn-based duel's first move, plus the anonymous "someone opened
// your link" signal and the lines around waiting. Pure: no DOM, Firebase or
// React. Unit-tested in arrivalLogic.test.js.
//
// The countdown hangs off ONE server timestamp, `startsAt`, written by the
// client that fills the second seat (in the same patch that flips the room to
// 'playing'). Every client reads the same value against the server clock, so
// both phones agree on the number without talking to each other. A rematch or
// a NEW MATCH clears the key (FIELD_NULLS), so only a fresh arrival counts it.

/** The whole beat: 3 · 2 · 1, then play. Kept short on purpose. */
export const COUNTDOWN_MS = 3000
/** How long "NAME IS HERE!" stays up, from the arrival. */
export const BANNER_MS = 2200
/** An arriving signal older than this is a tab someone forgot, not a person. */
export const ARRIVING_TTL_MS = 10 * 60 * 1000

/**
 * Which games get the countdown: a turn-based duel on the standard board. Real-
 * time sims, simultaneous races, party games and anything with its own start
 * step (waitForStart, lobby rooms) keep their own pacing.
 * @param {{ custom?: boolean, nPlayer?: boolean, realtime?: boolean, simultaneous?: boolean, waitForStart?: boolean } | null | undefined} cfg
 * @param {{ lobby?: unknown } | null | undefined} [room]
 */
export function countdownEligible(cfg, room = null) {
  if (!cfg || room?.lobby) return false
  return !cfg.custom && !cfg.nPlayer && !cfg.realtime && !cfg.simultaneous && !cfg.waitForStart
}

/**
 * Where the arrival beat stands.
 * @param {{ startsAt?: unknown, now: number }} p `now` is server-corrected ms
 * @returns {null | { elapsed: number, msLeft: number, count: 3 | 2 | 1, showBanner: boolean }}
 *   null when there is no beat (no key, or it is over)
 */
export function arrivalState({ startsAt, now }) {
  if (typeof startsAt !== 'number' || !Number.isFinite(startsAt)) return null
  // A touch of clock skew can put "now" just before the stamp: that is 0, not
  // a longer countdown.
  const elapsed = Math.max(0, now - startsAt)
  if (elapsed >= COUNTDOWN_MS) return null
  const msLeft = COUNTDOWN_MS - elapsed
  const count = /** @type {3 | 2 | 1} */ (Math.min(3, Math.max(1, Math.ceil(msLeft / 1000))))
  return { elapsed, msLeft, count, showBanner: elapsed < BANNER_MS }
}

/** Moves wait for the countdown, on this client only (the rules are untouched). */
export function movesBlocked(/** @type {{ startsAt?: unknown, now: number }} */ p) {
  return arrivalState(p) !== null
}

/**
 * The banner's words, from this player's seat. The host sees who arrived; the
 * guest is welcomed in. Both are told who moves first.
 * @param {{ mySeat: string | null | undefined, players?: Record<string, { name?: string } | undefined> | null, currentTurn?: string | null }} p
 * @returns {{ title: string, sub: string }}
 */
export function arrivalCopy({ mySeat, players, currentTurn }) {
  const first = currentTurn === 'O' ? 'O' : 'X'
  const hostName = nameOf(players?.X?.name, 'THE HOST')
  const guestName = nameOf(players?.O?.name, 'YOUR FRIEND')
  const sub = first === mySeat ? 'YOU GO FIRST' : `${first === 'X' ? hostName : guestName} GOES FIRST`
  return { title: mySeat === 'O' ? "YOU'RE IN!" : `${guestName} IS HERE!`, sub }
}

/** @param {unknown} name @param {string} fallback */
function nameOf(name, fallback) {
  const n = typeof name === 'string' ? name.trim() : ''
  return (n || fallback).toUpperCase()
}

/**
 * How many other people have the invite open on the join screen right now.
 * `arriving` is `{ [uid]: serverTimestamp }`; yourself, anyone already seated
 * and stale entries do not count.
 * @param {Record<string, unknown> | null | undefined} arriving
 * @param {{ now: number, selfUid?: string | null, seatedUids?: string[] }} p
 */
export function arrivingCount(arriving, { now, selfUid = null, seatedUids = [] }) {
  const seated = new Set(seatedUids)
  let n = 0
  for (const [uid, at] of Object.entries(arriving || {})) {
    if (uid === selfUid || seated.has(uid)) continue
    if (typeof at !== 'number' || !Number.isFinite(at)) continue
    // A stamp slightly ahead of this clock is still fresh.
    if (now - at > ARRIVING_TTL_MS) continue
    n += 1
  }
  return n
}

/**
 * The invite's share text: who is asking and for what.
 * @param {{ hostName?: string | null, gameLabel?: string | null, party?: boolean }} p
 */
export function inviteShareText({ hostName, gameLabel, party = false }) {
  const host = typeof hostName === 'string' ? hostName.trim() : ''
  const game = typeof gameLabel === 'string' ? gameLabel.trim() : ''
  const who = host || 'A friend'
  if (party) return `${who} saved you a seat at their Game Night party. Come play!`
  if (game) return `${who} saved you a seat for ${titleCase(game)} on Game Night. Come play!`
  return `${who} saved you a seat on Game Night. Come play!`
}

/** @param {string} s */
function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s&-])([a-z])/g, (_, a, b) => a + b.toUpperCase())
}

/**
 * The guest's invite card line: the host is already there.
 * @param {{ hostName?: string | null, gameLabel?: string | null }} p
 * @returns {string | null}
 */
export function hostWaitingLine({ hostName, gameLabel }) {
  const host = typeof hostName === 'string' ? hostName.trim() : ''
  if (!host) return null
  const game = typeof gameLabel === 'string' ? gameLabel.trim() : ''
  return game ? `${host.toUpperCase()} IS WAITING · PICKED ${game.toUpperCase()}` : `${host.toUpperCase()} IS WAITING FOR YOU`
}

/**
 * Party lobby, host alone: the "while your friends arrive" panel's progress.
 * @param {{ present: number, cap: number }} p
 */
export function arrivalProgress({ present, cap }) {
  const need = 2
  return { present, need, cap, alone: present <= 1, text: present >= need ? `${present} HERE · READY TO PLAY` : `${present} OF ${need} · WAITING FOR A FRIEND` }
}

/**
 * Someone new joined the party while the host was alone (or warming up): the
 * return cue's name. `before` and `after` are uid-keyed member lists.
 * @param {{ uid: string, name?: string }[]} before
 * @param {{ uid: string, name?: string }[]} after
 * @param {string | null | undefined} selfUid
 * @returns {string | null} the newest arrival's upper-cased name, or null
 */
export function newcomerName(before, after, selfUid) {
  const had = new Set((before || []).map(m => m.uid))
  const fresh = (after || []).filter(m => m.uid !== selfUid && !had.has(m.uid))
  if (!fresh.length) return null
  return nameOf(fresh[fresh.length - 1].name, 'A FRIEND')
}
