// partyBots.js — pure bot-decision layer for solo/demo play of the 3–8 player party
// games (WAVELENGTH, FIBBAGE, SPYFAIR). NO React, NO Firebase, NO DOM.
//
// Every decision function takes an injectable `rng = Math.random` (a () => [0,1)
// function) as its last parameter so callers/tests can drive it deterministically.
// `generateBotRoster` is the one exception — it takes a `seed` instead, so a whole
// roster (names/avatars/personas) is reproducible without threading an rng through
// every call site that needs the same bots across a session.
//
// Personas are `{ skill, acuity, boldness }`, each a float in 0..1, generated once
// per bot and passed back into the per-decision functions by the caller.

import { seededShuffle, hashString, isTruthLike, sameOption } from './fibbageLogic'
import { clampGuess } from './wavelengthLogic'
import { matchKey } from './textMatchLogic'
import { LEGACY_CREATURES, TONES, makeAvatar } from './avatars'
import { SPYFAIR_LOCATIONS } from './decks/spyfair'
import {
  NON_SPY_STATEMENT_TEMPLATES,
  SPY_STATEMENT_TEMPLATES,
  PROMPT_TEMPLATES,
  SPY_REPLY_STYLES,
} from './decks/spyfairChat'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t

// Cheap Irwin-Hall approximation of a zero-centered Gaussian: sum of 3 uniforms
// in [0,1) has mean 1.5, so subtracting it centers the noise on 0.
function gaussianNoise(stdDev, rng) {
  return (rng() + rng() + rng() - 1.5) * stdDev
}

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)]
}

function shuffleWithRng(arr, rng) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Deterministic float in [0, 1) derived from a string key — used by
// generateBotRoster so persona stats are reproducible from a seed without
// pulling in a second PRNG implementation.
function seededFloat(key) {
  return (hashString(key) % 100000) / 100000
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const BOT_NAMES = [
  'RUBY', 'ZED', 'NOVA', 'PIXEL', 'DASH', 'ECHO', 'VOLT', 'COMET', 'BYTE', 'GRIT',
  'ORBIT', 'FIZZ', 'TANGO', 'CIPHER', 'SPARK', 'REX', 'IRIS', 'QUARTZ', 'HAZE', 'TITAN',
]

// Bots only ever wear creature avatars (never 'boy'/'girl') so they read as
// visually distinct from human players at a glance.
const CREATURE_SHAPES = LEGACY_CREATURES

// Deterministic for a fixed seed: every value below is derived from `seed` via
// hashString/seededShuffle, never Math.random. `seed` may be any primitive — it's
// stringified into hash keys. Omitting it falls back to Math.random() once, up
// front, so unseeded callers still get a fresh roster each time.
export function generateBotRoster(botCount, seed = Math.random()) {
  const n = Math.max(0, botCount | 0)
  const names = seededShuffle(BOT_NAMES, hashString(`${seed}-names`)).slice(0, n)
  const shapes = seededShuffle(CREATURE_SHAPES, hashString(`${seed}-shapes`)).slice(0, n)
  const roster = []
  for (let i = 0; i < n; i++) {
    const toneIdx = Math.floor(seededFloat(`${seed}-tone-${i}`) * TONES.length) % TONES.length
    roster.push({
      id: `bot-${i + 1}`,
      name: names[i],
      avatar: makeAvatar(shapes[i], TONES[toneIdx]),
      persona: {
        skill: seededFloat(`${seed}-skill-${i}`),
        acuity: seededFloat(`${seed}-acuity-${i}`),
        boldness: seededFloat(`${seed}-boldness-${i}`),
      },
    })
  }
  return roster
}

// ---------------------------------------------------------------------------
// WAVELENGTH
// ---------------------------------------------------------------------------

// pair = { left, right, clueBank: [{ word, pos }] }
export function pickBotClue(pair, usedWords, persona, rng = Math.random) {
  const bank = pair?.clueBank || []
  if (!bank.length) return null
  const used = usedWords instanceof Set ? usedWords : new Set(usedWords || [])
  const fresh = bank.filter(entry => !used.has(entry.word))
  const pool = fresh.length ? fresh : bank
  const entry = pickRandom(pool, rng)
  return { word: entry.word, target: clampGuess(entry.pos + gaussianNoise(4, rng)) }
}

// Legacy: guesses around the TRUE target. Solo play no longer uses it (bots
// must not see the target — see pickBotGuessFromClue); kept for callers/tests.
export function pickBotGuess(target, persona, rng = Math.random) {
  const stdDev = lerp(25, 4, persona.skill)
  return clampGuess(target + gaussianNoise(stdDev, rng))
}

// Spread (gaussianNoise stdDev argument) for a bot reading a clue it knows,
// from a clumsy bot (skill 0) to a sharp one (skill 1), and for a clue it
// doesn't know at all.
export const BOT_CLUE_READ_SPREAD = { clumsy: 30, sharp: 8, unknown: 80 }

// A bot guesser reads the CLUE, never the hidden target: if the clue is one of
// the pair's clueBank words it aims at that word's position (noisier for less
// skilled bots); a word it doesn't know gets a wide guess around the middle.
export function pickBotGuessFromClue(pair, clueWord, persona, rng = Math.random) {
  const key = matchKey(clueWord)
  const entry = key ? (pair?.clueBank || []).find(e => matchKey(e.word) === key) : null
  if (!entry) return clampGuess(50 + gaussianNoise(BOT_CLUE_READ_SPREAD.unknown, rng))
  const skill = persona?.skill ?? 0.5
  const spread = lerp(BOT_CLUE_READ_SPREAD.clumsy, BOT_CLUE_READ_SPREAD.sharp, skill)
  return clampGuess(entry.pos + gaussianNoise(spread, rng))
}

// ---------------------------------------------------------------------------
// FIBBAGE
// ---------------------------------------------------------------------------

// fact = { prompt, answer, decoys: [...] }
export function pickBotLie(fact, usedDecoys, persona, rng = Math.random) {
  // Same rule human lies face: nothing that is really the truth (fibbageLogic.isTruthLike).
  const eligible = (fact.decoys || []).filter(d => !isTruthLike(d, fact.answer))
  if (!eligible.length) return ''
  const used = usedDecoys instanceof Set ? usedDecoys : new Set(usedDecoys || [])
  const fresh = eligible.filter(d => !used.has(d))
  const pool = fresh.length ? fresh : eligible
  return pickRandom(pool, rng)
}

// options = [{ id, text }] (the shape produced by fibbageLogic's buildOptions)
export function pickBotVote(options, answer, myLieText, persona, rng = Math.random) {
  // Loose matching (fibbageLogic.sameOption): a merged duplicate of my own lie
  // may carry another author's spelling.
  const eligible = (options || []).filter(o => !myLieText || !sameOption(o.text, myLieText))
  const truthOption = eligible.find(o => sameOption(o.text, answer))
  const truthProb = lerp(0.3, 0.6, persona.skill)
  if (truthOption && rng() < truthProb) return truthOption.id
  const distractors = eligible.filter(o => o.id !== truthOption?.id)
  const pool = distractors.length ? distractors : eligible
  return pool.length ? pickRandom(pool, rng).id : null
}

// ---------------------------------------------------------------------------
// SPYFAIR
// ---------------------------------------------------------------------------

export function pickSpyfairLocation(prevIndex, rng = Math.random) {
  const n = SPYFAIR_LOCATIONS.length
  if (n <= 1) return 0
  let idx = Math.floor(rng() * n)
  if (idx === prevIndex) idx = (idx + 1) % n
  return idx
}

// Spyfair round-to-round memory, shared by multiplayer (stored on the room as
// `spyfairRotation: { spied, recent }`) and the solo demo. Pure helpers below.

// A location is not dealt again until this many other rounds have passed.
export const SPYFAIR_RECENT_LOCATIONS = 5

// Firebase returns a list as an array or a numeric-keyed object (and drops it
// when empty) — read it back as a plain array in index order.
export function normalizeIdList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(v => v != null)
  if (typeof raw !== 'object') return []
  return Object.keys(raw)
    .filter(k => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map(k => raw[k])
    .filter(v => v != null)
}

// Rotation bag: everyone at the table is spy once before anyone repeats.
// `spied` lists who has been spy this cycle; players who left are ignored and
// newcomers are simply eligible. When the bag is empty a new cycle starts —
// skipping `lastSpy` so nobody is spy twice in a row across the boundary.
// Returns { spyId, spied } (the updated list to store).
export function pickSpyFromRotation(seatIds, spied, lastSpy = null, rng = Math.random) {
  const seats = [...new Set((seatIds || []).filter(Boolean))]
  if (!seats.length) return { spyId: null, spied: [] }
  let done = normalizeIdList(spied).filter(id => seats.includes(id))
  let eligible = seats.filter(id => !done.includes(id))
  if (!eligible.length) {
    done = []
    eligible = seats.length > 1 ? seats.filter(id => id !== lastSpy) : seats
  }
  const spyId = eligible[Math.floor(rng() * eligible.length)]
  return { spyId, spied: [...done, spyId] }
}

// Update the rotation bag once a round's spy is public (the result phase —
// storing it at deal time would expose the spy in world-readable room data).
// Mirrors pickSpyFromRotation: a spy drawn after the bag emptied starts a new
// cycle; otherwise the spy is added to this cycle's list.
export function recordSpy(spied, seatIds, spyId) {
  if (!spyId) return normalizeIdList(spied)
  const seats = [...new Set((seatIds || []).filter(Boolean))]
  const done = normalizeIdList(spied).filter(id => seats.includes(id))
  if (done.includes(spyId) || (seats.length > 0 && seats.every(id => done.includes(id)))) return [spyId]
  return [...done, spyId]
}

// Pick a location not dealt in the last SPYFAIR_RECENT_LOCATIONS rounds
// (`recent`, oldest first). Falls back to "anything but the latest" if the
// deck is too small to honour the window.
export function pickFreshLocation(recent, rng = Math.random, count = SPYFAIR_LOCATIONS.length) {
  if (count <= 1) return 0
  const recentList = normalizeIdList(recent).map(Number)
  const avoid = new Set(recentList.slice(-SPYFAIR_RECENT_LOCATIONS))
  let pool = []
  for (let i = 0; i < count; i++) if (!avoid.has(i)) pool.push(i)
  if (!pool.length) {
    const last = recentList[recentList.length - 1]
    for (let i = 0; i < count; i++) if (i !== last) pool.push(i)
  }
  return pool[Math.floor(rng() * pool.length)]
}

// Append a dealt location to the recent list, keeping only the window we need.
export function pushRecentLocation(recent, index) {
  return [...normalizeIdList(recent).map(Number), index].slice(-SPYFAIR_RECENT_LOCATIONS)
}

// `spyId` (optional) — the spy chosen by pickSpyFromRotation; omitted, a
// random seat is the spy (legacy behaviour).
export function assignSpyfairRoles(rosterIds, locationIndex, rng = Math.random, spyId = null) {
  const ids = [...(rosterIds || [])]
  if (!ids.length) return { spyId: null, roles: {} }
  const loc = SPYFAIR_LOCATIONS[locationIndex]
  const forced = spyId != null && ids.includes(spyId) ? ids.indexOf(spyId) : -1
  const spyIdx = forced >= 0 ? forced : Math.floor(rng() * ids.length)
  spyId = ids[spyIdx]
  const nonSpies = ids.filter((_, i) => i !== spyIdx)
  const rolePool = shuffleWithRng(loc.roles, rng)
  const roles = { [spyId]: null }
  nonSpies.forEach((id, i) => { roles[id] = rolePool[i % rolePool.length] })
  return { spyId, roles }
}

export function generateBotStatement(bot, { role, isSpy }, rng = Math.random) {
  if (isSpy) return pickRandom(SPY_STATEMENT_TEMPLATES, rng)
  return pickRandom(NON_SPY_STATEMENT_TEMPLATES, rng).replace('{role}', role)
}

export function generateQuestionPrompt(fromBot, toName, rng = Math.random) {
  return pickRandom(PROMPT_TEMPLATES, rng).replace('{name}', toName)
}

// context = { askerName, roleWord } — roleWord is a role the human spy overheard
// during questioning; may be '' if they haven't heard one yet.
export function renderSpyReply(styleId, context) {
  const style = SPY_REPLY_STYLES.find(s => s.id === styleId) || SPY_REPLY_STYLES[0]
  return style.render(context || {})
}

// If botId is itself the spy it has no read on who else is suspicious, so it
// deflects uniformly. Otherwise it accuses the real spy with probability scaled
// by its acuity persona stat; the rest of the time it picks uniformly among the
// other non-spy candidates — which can legitimately land on the human player or
// another innocent bot. That's the point: a wrongly-accused human is normal.
export function pickBotSpyVote(botId, rosterIds, spyId, persona, rng = Math.random) {
  const others = (rosterIds || []).filter(id => id !== botId)
  if (!others.length) return null
  if (botId === spyId) return pickRandom(others, rng)

  const accuseProb = lerp(0.25, 0.75, persona.acuity)
  if (others.includes(spyId) && rng() < accuseProb) return spyId

  const nonSpyOthers = others.filter(id => id !== spyId)
  const pool = nonSpyOthers.length ? nonSpyOthers : others
  return pickRandom(pool, rng)
}

// votes = { [voterId]: accusedId } → strict-plurality tally. Mirrors the
// semantics of the inline tallyVotes() in SpyfairGame.jsx exactly: `top` is the
// first accusedId to reach the current lead, and any later accusedId that ties
// the lead count flips `tied` to true (without changing `top`) — so a caller
// must check `!tied` before trusting `top`.
export function tallySpyfairVotes(votes) {
  const counts = {}
  for (const accused of Object.values(votes || {})) {
    if (!accused) continue
    counts[accused] = (counts[accused] || 0) + 1
  }
  let top = null
  let topCount = 0
  let tied = false
  for (const [pid, n] of Object.entries(counts)) {
    if (n > topCount) { top = pid; topCount = n; tied = false }
    else if (n === topCount) { tied = true }
  }
  return { top, topCount, tied }
}
