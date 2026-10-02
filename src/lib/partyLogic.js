// Party-first rooms: friends gather in a party (2–4 people), then the host
// picks a game that fits how many are here. A party is an ordinary room
// (games/{id}) with `partyRoom: true` that starts on the PARTY lobby and
// returns to it between games; everything room-level that survives switches
// (night, queue, hostUid, locked, removed, partyCap) keeps working.
//
// Pure — no DOM/Firebase/React.
// @ts-check

import { memberPresent, partyMembers, partyHostUid } from './nightLogic'

export { partyMembers, partyHostUid }

/** The party lobby's pseudo game type (not a catalogue game). */
export const PARTY_TYPE = 'party'

/** Most people a party holds (captain call D4). */
export const PARTY_CAP = 4

/**
 * How a game fits a party of `n` people.
 *  - 'all':    everyone plays at once
 *  - 'rotate': a 2-player game: two play, the rest wait in line (winner stays)
 *  - 'short':  needs `short` more people
 *  - 'over':   more people than the game seats (n above its maximum)
 * @param {{ nPlayer?: boolean, minPlayers?: number, maxPlayers?: number } | null | undefined} cfg
 * @param {number} n
 * @returns {{ fit: 'all' | 'rotate' | 'short' | 'over', short: number }}
 */
export function playableAt(cfg, n) {
  if (!cfg) return { fit: 'short', short: 0 }
  const min = cfg.nPlayer ? cfg.minPlayers || 2 : 2
  const max = cfg.nPlayer ? cfg.maxPlayers || 8 : 2
  if (n < min) return { fit: 'short', short: min - n }
  if (!cfg.nPlayer) return { fit: n === 2 ? 'all' : 'rotate', short: 0 }
  if (n > max) return { fit: 'over', short: 0 }
  return { fit: 'all', short: 0 }
}

/**
 * The size-filtered picker's three groups for a party of `n`, catalogue cards
 * only (variants are picked through their base card). Each group keeps the
 * registry's order.
 * @template {{ type: string, variantOf?: string, nPlayer?: boolean, minPlayers?: number, maxPlayers?: number }} T
 * @param {T[]} types
 * @param {number} n
 * @returns {{ all: T[], rotate: T[], short: { cfg: T, short: number }[] }}
 */
export function groupPickerForParty(types, n) {
  /** @type {{ all: T[], rotate: T[], short: { cfg: T, short: number }[] }} */
  const out = { all: [], rotate: [], short: [] }
  for (const cfg of types || []) {
    if (!cfg || cfg.variantOf) continue
    const { fit, short } = playableAt(cfg, n)
    if (fit === 'all') out.all.push(cfg)
    else if (fit === 'rotate') out.rotate.push(cfg)
    else if (fit === 'short') out.short.push({ cfg, short })
  }
  out.short.sort((a, b) => a.short - b.short)
  return out
}

/**
 * Members who are here right now, in join order: the head-count the picker
 * filters by, and the pool the host and the next seat come from.
 * @param {any} game
 * @param {boolean} nPlayer - the current game's seat family
 */
export function partyPresentMembers(game, nPlayer) {
  return partyMembers(game, nPlayer).filter(m => memberPresent(game, m.uid, nPlayer))
}

/**
 * The room's effective cap: the game's own maximum, and in a party room never
 * more than its `partyCap`. Counted over seats AND queue (partyMembers).
 * @param {any} game
 * @param {{ nPlayer?: boolean, maxPlayers?: number } | null | undefined} cfg
 */
export function effectiveCap(game, cfg) {
  const own = cfg?.nPlayer ? cfg.maxPlayers || 8 : Infinity
  const cap = game?.partyRoom && typeof game.partyCap === 'number' && game.partyCap > 0 ? game.partyCap : Infinity
  const out = Math.min(own, cap)
  return Number.isFinite(out) ? out : 8
}

/**
 * Members past the cap, by join order. Two joiners racing each write only
 * their own seat, so both can pass a client-side count; every client sees the
 * same order, so the host's client moves these out (they stay to watch) and
 * the PARTY FULL screen shows for them.
 * @param {any} game
 * @param {boolean} nPlayer
 * @param {number} cap
 * @returns {string[]}
 */
export function overCapMembers(game, nPlayer, cap) {
  if (!game?.partyRoom || !(cap > 0)) return []
  return partyMembers(game, nPlayer).slice(cap).map(m => m.uid)
}

/**
 * Whether `uid` may not get in because the party is full: not yet a member,
 * and the members already fill the cap.
 * @param {any} game
 * @param {boolean} nPlayer
 * @param {number} cap
 * @param {string} uid
 */
export function partyFullFor(game, nPlayer, cap, uid) {
  if (!game?.partyRoom || !uid) return false
  const members = partyMembers(game, nPlayer)
  const idx = members.findIndex(m => m.uid === uid)
  if (idx >= 0) return idx >= cap
  return members.length >= cap
}

/**
 * The invite banner's second line: "PARTY · 2 / 4" for a party invite, else
 * the game's label (older invites).
 * @param {{ kind?: string, size?: number, cap?: number, gameType?: string | null } | null | undefined} invite
 * @param {(type: string) => string | undefined} [labelFor]
 */
export function partyInviteLine(invite, labelFor = () => undefined) {
  if (!invite) return ''
  if (invite.kind === 'party') {
    const size = typeof invite.size === 'number' && invite.size > 0 ? invite.size : null
    const cap = typeof invite.cap === 'number' && invite.cap > 0 ? invite.cap : PARTY_CAP
    return size ? `PARTY · ${size} / ${cap}` : 'PARTY'
  }
  return (invite.gameType && labelFor(invite.gameType)) || 'GAME'
}
