// The party shell's pure rules: which rooms get it, the P1–P4 tile model, the
// per-device header view, and the footer's last-message ticker.
// The shell is persistent chrome (header of faces, footer of chat and
// reactions) that Game.jsx mounts OUTSIDE the gameType-keyed game tree.
// Pure — no DOM/Firebase/React.
// @ts-check

import { partyMembers, memberPresent } from './nightLogic'
import { normalizeChatLog } from './chat'

export const SHELL_MAX_SEATS = 4
export const SHELL_VIEW_KEY = 'gn-party-shell-view'
/** The header's three states: big tiles, the 64 pt face strip, a 30 pt row of dots. */
export const SHELL_VIEWS = Object.freeze(['tiles', 'strip', 'mini'])
export const DEFAULT_SHELL_VIEW = 'tiles'

/** Whether the room gets the shell: a party room (4-player lobby and the games it hosts). */
export function shellActive(game) {
  return !!game && game.partyRoom === true
}

/**
 * Which seat family a room is in, from the players node's shape (uid keys in
 * party games, X/O in 2P games played inside a party).
 * @param {any} game
 */
export function isPartyFamily(game) {
  return !game?.players?.X && !game?.players?.O
}

/**
 * A stored view name, or the default. The toggle never changes it by itself.
 * @param {unknown} raw
 */
export function parseShellView(raw) {
  return typeof raw === 'string' && SHELL_VIEWS.includes(raw) ? raw : DEFAULT_SHELL_VIEW
}

/**
 * The toggle between the two main views. From the minimised row it expands to
 * the strip (the view it was folded from).
 * @param {string} view
 */
export function toggleShellView(view) {
  return view === 'tiles' ? 'strip' : 'tiles'
}

/** Fold the strip to the dots row, or open the dots row back to the strip. */
export function toggleShellMinimised(view) {
  return view === 'mini' ? 'strip' : 'mini'
}

/**
 * Whose turn it is, as a uid, or null. 2P games inside a party have X/O seats
 * and `currentTurn` as a symbol; party games may carry a uid `currentTurn`.
 * @param {any} game
 * @returns {string | null}
 */
export function turnUid(game) {
  if (!game || game.status === 'waiting' || game.status === 'finished') return null
  const t = game.currentTurn
  if (typeof t !== 'string' || !t) return null
  if (t === 'X' || t === 'O') return game.players?.[t]?.playerId ?? null
  return game.players?.[t] ? t : null
}

/**
 * The seat tiles, in stable join order (P1 = first to join), capped at four.
 * Empty seats of a not-yet-full lobby become invite tiles; in play the empty
 * seats are left out (a three-person party shows three faces).
 *
 * `seatState`: 'playing' sits at a table seat, 'watching' waits in the
 * winner-stays queue or watches a 2P game inside the party.
 * @param {any} game
 * @param {{ inLobby?: boolean, cap?: number, hostUid?: string | null }} [opts]
 * @returns {{ key: string, uid: string | null, name: string, avatar: any, seat: number, online: boolean,
 *   isHost: boolean, turn: boolean, seatState: 'playing' | 'watching' | 'empty', invite: boolean }[]}
 */
export function shellTiles(game, { inLobby = false, cap = SHELL_MAX_SEATS, hostUid = null } = {}) {
  const family = isPartyFamily(game)
  const members = partyMembers(game, family).slice(0, SHELL_MAX_SEATS)
  const seated = new Set(
    family
      ? Object.values(game?.players || {}).map((p) => /** @type {any} */ (p)?.playerId).filter(Boolean)
      : ['X', 'O'].map((s) => game?.players?.[s]?.playerId).filter(Boolean),
  )
  const turn = turnUid(game)
  const tiles = members.map((m, i) => ({
    key: m.uid,
    uid: m.uid,
    name: m.name,
    avatar: m.avatar,
    seat: i + 1,
    online: memberPresent(game, m.uid, family),
    isHost: !!hostUid && m.uid === hostUid,
    turn: !!turn && m.uid === turn,
    seatState: /** @type {'playing' | 'watching' | 'empty'} */ (seated.has(m.uid) ? 'playing' : 'watching'),
    invite: false,
  }))
  if (inLobby) {
    const slots = Math.max(0, Math.min(SHELL_MAX_SEATS, Math.max(cap, 1)) - tiles.length)
    for (let i = 0; i < slots; i++) {
      tiles.push({
        key: `empty-${tiles.length + 1}`, uid: null, name: '', avatar: null,
        seat: tiles.length + 1, online: false, isHost: false, turn: false, seatState: 'empty', invite: true,
      })
    }
  }
  return tiles
}

/**
 * The newest chat line a player should see in the ticker: not hidden by the
 * moderation function, not from someone they blocked. Null when quiet.
 * @param {unknown} chatLog
 * @param {{ muted?: Record<string, unknown> }} [opts]
 * @returns {{ id: string, by: string, name: string, text: string, ts: number, img: boolean } | null}
 */
export function tickerLine(chatLog, { muted = {} } = {}) {
  const entries = normalizeChatLog(chatLog)
  for (let i = entries.length - 1; i >= 0; i--) {
    const [id, m] = entries[i]
    if (m.hidden || muted[m.by]) continue
    return {
      id,
      by: m.by,
      name: typeof m.name === 'string' && m.name ? m.name : '',
      text: m.text || '',
      ts: m.ts,
      img: m.img !== undefined,
    }
  }
  return null
}

/** A phone held sideways: too short for any row of faces but the 30 pt dots. */
export const SHORT_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)'

/**
 * The view to draw. The player's pick stands in portrait and on tablets; a
 * phone turned sideways (arenas that allow landscape, a browser tab that
 * rotated) has no height for faces, so it draws the dots row until it is
 * upright again. The stored pick is never changed.
 * @param {string} view
 * @param {boolean} shortLandscape
 */
export function effectiveShellView(view, shortLandscape) {
  return shortLandscape ? 'mini' : view
}
