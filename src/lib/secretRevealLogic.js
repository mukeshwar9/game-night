// Pass-the-phone secret reveal: the step machine behind <SecretReveal>. One
// phone goes round the table; each player in turn sees a "pass to NAME"
// screen, holds a button to read a private secret, taps GOT IT, and the phone
// moves on. Pure — no DOM/React. Who holds which secret is the caller's
// business; this module only tracks whose turn it is and what the screen
// should show, so any secret-word or hidden-role game can reuse it.

export const REVEAL_MIN_PLAYERS = 2

// Each seat gets a distinct full-screen colour so a glance tells the next
// player the phone is theirs. These are seat token names (--c-p1..p4 in
// src/index.css), never hex values; they repeat after four seats, and the seat
// number on screen keeps larger tables unambiguous.
export const REVEAL_TINTS = ['p1', 'p2', 'p3', 'p4']

export function tintFor(index) {
  const n = REVEAL_TINTS.length
  return REVEAL_TINTS[((index % n) + n) % n]
}

/** Fresh sequence for `count` seats (clamped to at least REVEAL_MIN_PLAYERS). */
export function startReveal(count) {
  const total = Math.max(REVEAL_MIN_PLAYERS, Math.floor(Number(count) || 0))
  // phase: 'pass'  — phone is being handed over, secret hidden
  //        'hold'  — the player is pressing; secret visible
  //        'seen'  — released after at least one reveal; GOT IT is offered
  return { total, index: 0, phase: 'pass', viewed: false, done: false }
}

/** Finger down (or key down) on the reveal button. */
export function pressDown(state) {
  if (state.done) return state
  return { ...state, phase: 'hold', viewed: true }
}

/** Finger up. The secret hides again; GOT IT unlocks once it has been seen. */
export function pressUp(state) {
  if (state.done || state.phase !== 'hold') return state
  return { ...state, phase: 'seen' }
}

/** GOT IT — only counts after the player has actually looked. */
export function confirmSeen(state) {
  if (state.done || !state.viewed || state.phase === 'hold') return state
  const next = state.index + 1
  if (next >= state.total) return { ...state, phase: 'pass', viewed: false, done: true }
  return { ...state, index: next, phase: 'pass', viewed: false }
}

/** Progress label for the pass screen: "PLAYER 2 OF 5". */
export function progressLabel(state) {
  return `PLAYER ${Math.min(state.index + 1, state.total)} OF ${state.total}`
}
