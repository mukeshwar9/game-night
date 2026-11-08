import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ref, update, push, set, runTransaction, serverTimestamp } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  seatOrder,
  hashString,
  CHOOSE_MS,
  DRAW_MS,
  REVEAL_MS,
  SKIP_CHOOSING_GRACE_MS,
  ARTIST_OFFLINE_DRAWING_MS,
  normalize,
  wordPattern,
  pickRoundOptions,
  scoringWindow,
  cyclesFor,
  nextRoundState,
  activeGuessers,
  participantGuessers,
  roundDeltas,
  deriveWord,
  SKETCH_SEEN_KEY,
  acceptHashes,
  guessMatchesAccept,
  isNearMiss,
  isBannedGuess,
  tierMultiplier,
  entryForWord,
  normalizeHints,
  nextHintToPublish,
} from '../lib/sketchLogic'
import {
  canvasSide,
  isKeyboardUp,
  faceTiles,
  gotItLabel,
  galleryEntry,
  addToGallery,
  galleryFor,
  podium,
} from '../lib/sketchStageLogic'
import { replayOver } from '../lib/sketchReplayLogic'
import {
  HEART_HINT_MS,
  MAX_HEART_FLOATS,
  foldLikes,
  heartView,
  likeCount,
  newHeartsFrom,
  crowdFavourite,
} from '../lib/sketchFavesLogic'
import { isRoomCoordinator } from '../lib/coordinator'
import { markSeen, normalizeSeen } from '../lib/seenHistory'
import { scaledMs, timersOff } from '../lib/timerScale'
import { normalizeList } from '../lib/normalize'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import { SKETCH_WORDS } from '../lib/decks/sketch'
import SketchCanvas from '../components/SketchCanvas'
import ReportButton from '../components/ReportButton'
import BottomSheet from '../components/BottomSheet'
import { TimerRing, FaceStrip, Blanks, GuessBubbles, Podium, Gallery, HeartButton, CrowdFavourite } from '../components/SketchStage'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import RoundEndPanel from '../components/RoundEndPanel'
import PixelDots from '../components/loading/PixelDots'
import WordFeedback from '../components/WordFeedback'
import { sounds } from '../lib/sounds'
import { haptic } from '../lib/haptics'
import { isReducedMotion } from '../hooks/useMotionPref'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 2
const MAX_GUESS_LEN = 40
const MIN_GUESS_INTERVAL_MS = 500
const MAX_CHAT_FEED = 60 // cap how much of the guess feed we render

// Firebase may hand the round's lists back as numeric-keyed objects — read them
// by key (normalizeList), never Object.values, so order can't shift.
function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'choosing',
    cycle: raw.cycle ?? 1,
    artist: raw.artist ?? null,
    order: normalizeList(raw.order),
    used: normalizeList(raw.used),
    matchSeed: raw.matchSeed ?? '',
    options: raw.options ? normalizeList(raw.options) : null,
    commitment: raw.commitment ?? null,
    accept: raw.accept ? normalizeList(raw.accept) : null,
    wordPattern: raw.wordPattern ?? '',
    // null = no deadline (room timer scale 0) — never treat it as "already expired".
    endsAt: raw.endsAt ?? null,
    drawStartedAt: raw.drawStartedAt ?? null,
    drawMs: raw.drawMs ?? null,
    // server time of the flip to reveal: every screen's replay runs from it
    revealAt: raw.revealAt ?? null,
    chat: raw.chat ?? {},
    correct: raw.correct ?? {},
    // letter hints the artist's phone published (see sketchLogic 'Letter hints')
    hints: normalizeHints(raw.hints, raw.wordPattern ?? ''),
    // hearts on this drawing, and the match's heart tally (sketchFavesLogic.js)
    likes: raw.likes ?? null,
    faves: raw.faves ?? null,
    // the drawing has something on it (hearts need one)
    hasDrawing: !!(raw.strokes || raw.fills),
    scored: !!raw.scored,
  }
}

// A raw round from inside a transaction with its lists read by key, so the
// pure helpers (nextRoundState's spreads, indexOf) always get real arrays.
function withLists(r) {
  const n = normalizeRound(r)
  return { ...r, order: n.order, used: n.used, options: n.options }
}

const TIER_LABELS = { 1: 'EASY', 2: 'MEDIUM', 3: 'HARD' }

// "×1.5" for tiers that pay extra, '' for ×1.
function multiplierLabel(tier) {
  const m = tierMultiplier(tier)
  return m === 1 ? '' : `×${m}`
}

// Touch devices: don't autofocus the guess box — the keyboard would cover the canvas.
function isCoarsePointer() {
  try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}

// The drawing column's size: as wide as the column, but short enough that the
// faces, the word and the dock (or the guess box) stay on one screen, also with
// the keyboard up. See canvasSide() in sketchStageLogic.js.
function useStageSide(role) {
  const stageRef = useRef(null)
  const baselineRef = useRef(0)
  const keyboardUpRef = useRef(false)
  const [side, setSide] = useState(null)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const measure = () => {
      const vv = window.visualViewport
      const viewportH = vv?.height ?? window.innerHeight
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')
      if (!typing || viewportH > baselineRef.current) baselineRef.current = viewportH
      const keyboardUp = isKeyboardUp(baselineRef.current, viewportH)
      // The moment the keyboard opens, bring the stage to the top of what is
      // left, so faces, blanks, drawing and the guess box share one screen.
      if (keyboardUp && !keyboardUpRef.current && typing) stage.scrollIntoView({ block: 'start' })
      keyboardUpRef.current = keyboardUp
      const next = canvasSide({
        availW: stage.clientWidth,
        viewportH,
        stageTop: stage.getBoundingClientRect().top + window.scrollY,
        keyboardUp,
        role,
      })
      setSide(s => (s === next ? s : next))
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(stage)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [role])
  return [stageRef, side]
}

const GALLERY_STORE_KEY = gameId => `sketch-gallery-${gameId}`

// The gallery stays on this phone (sessionStorage, so a reload keeps it):
// drawings are rebuilt from each round's strokes at its reveal, never sent.
function loadGallery(gameId) {
  try { return JSON.parse(sessionStorage.getItem(GALLERY_STORE_KEY(gameId)) || 'null') } catch { return null }
}
function saveGallery(gameId, store) {
  try { sessionStorage.setItem(GALLERY_STORE_KEY(gameId), JSON.stringify(store)) } catch { /* quota or private mode: keep it in memory */ }
}

export default function SketchGame({
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  // Server-corrected clock, ticking every 250ms so countdown UIs re-render;
  // `now()` is a fresh server-time reading for handlers and transactions.
  const { now: nowMs } = useServerClock(250)
  const now = getServerNow
  // Room timer scale (lobby option): choosing/drawing clocks stretch 2× when
  // relaxed and disappear at 0 (the coordinator then ends rounds by hand). The
  // reveal (word, replay, points) is a display pause, not a deadline on anyone,
  // so it stays fixed.
  const chooseMs = scaledMs(CHOOSE_MS, game.timerScale)
  const drawMs = scaledMs(DRAW_MS, game.timerScale)
  const noTimer = timersOff(game.timerScale)
  const deadlineAfter = (ms) => (ms == null ? null : now() + ms)

  const round = normalizeRound(game.round)
  const roundKey = round ? `${round.cycle}:${round.artist}` : null
  const isArtist = !!round && round.artist === mySeat
  const isPlayer = !!mySeat && !!players?.[mySeat]
  const participantGuesserIds = round ? participantGuessers(round.order, round.artist) : []
  const activeGuesserIds = round ? activeGuessers(players || {}, round.order, round.artist) : []
  const haveIGuessedCorrectly = !!round?.correct?.[mySeat]
  // Deterministic host-fallback: the coordinator is the first ONLINE seat in join order, not
  // the fixed `isHost` — so a host disconnect hands phase-advance duty off instead
  // of freezing the match. Every `isHost`-gated auto-advance/skip below now gates
  // on this; each write re-checks phase inside its transaction, so a coordinator
  // handover mid-transition stays single-writer/idempotent.
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)

  const [guessInput, setGuessInput] = useState('')
  const [derivedWord, setDerivedWord] = useState(null)
  // Last-seen drawing-phase endsAt, captured via effect (see below) — `round.endsAt`
  // gets overwritten to the reveal deadline the instant the phase flips, but the
  // reveal screen still needs the ORIGINAL drawing deadline to recompute the same
  // score-delta numbers the host's transaction used (display only — the
  // authoritative numbers already live in `scores`).
  const [drawEndsAt, setDrawEndsAt] = useState(null)
  // epoch-ms when THIS client first observed the artist go offline mid-drawing.
  const [artistOfflineSince, setArtistOfflineSince] = useState(null)
  const [pickingIdx, setPickingIdx] = useState(null)  // word option this client last clicked (busy-label only)
  // Private guess feedback ("CLOSE!"), keyed by round so a new round starts blank.
  const [guessFb, setGuessFb] = useState({ key: null, message: '', tone: 'info', id: 0 })
  const [coarsePointer] = useState(isCoarsePointer)
  // Stage screen state: hints, the artist menu, the guess list, the gallery.
  const hints = round?.hints ?? []
  const stageRole = isArtist ? 'artist' : isPlayer && !haveIGuessedCorrectly ? 'guesser' : 'watcher'
  const [stageRef, stageSide] = useStageSide(stageRole)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hintFlash, setHintFlash] = useState(null)       // n of the newest hint, shown for a moment
  const [showAllGuesses, setShowAllGuesses] = useState(false)
  const [replayDoneKey, setReplayDoneKey] = useState(null) // reveal (round + revealAt) whose replay finished here
  const [galleryStore, setGalleryStore] = useState(() => loadGallery(gameId))
  const [heartFloats, setHeartFloats] = useState([])     // others' hearts rising from the button: [{ id }]
  const [heartHint, setHeartHint] = useState(null)       // { seed, key }: the reveal that shows TAP ♥ this match
  const drawingRef = useRef({ strokes: {}, fills: {} })   // the canvas's latest content (gallery source)
  const galleryAddedRef = useRef(null)                    // round id already saved to the gallery
  const hintPublishRef = useRef(null)                     // `${roundKey}:${n}` this phone already sent
  const prevHintCountRef = useRef(hints.length)

  // House convention: every button firing an async Firebase write / navigator.share
  // goes through useBusy — synchronous re-entry guard + disabled/gerund UI state.
  const [starting, runStart] = useBusy()                 // START ROUND
  const [picking, runPick] = useBusy()                   // choosing: word pick
  const [guessing, runGuess] = useBusy()                 // drawing: guess submit
  const [skippingChoosing, runSkipChoosing] = useBusy()   // choosing: SKIP ROUND
  const [skippingDrawing, runSkipDrawing] = useBusy()     // drawing: SKIP ROUND (artist offline)
  const [endingRound, runEndRound] = useBusy()           // drawing, timers off: END ROUND
  const [hearting, runHeart] = useBusy()                 // drawing (solved) / reveal: the heart

  const pickedRef = useRef(false)                    // this client already picked/auto-picked this round
  const correctSentRef = useRef(false)                // this client already published its own correct guess
  const draftVersionRef = useRef(0)
  const optionsPublishAttemptRef = useRef(null)       // roundKey we last attempted to publish options for
  const hostActionInFlightRef = useRef(false)         // a host advance transaction is currently pending
  const prevPhaseRef = useRef(round?.phase)
  const prevCorrectKeysRef = useRef(new Set())
  const prevStatusRef = useRef(game.status)
  const prevRoundKeyRef = useRef(roundKey)
  const drawEndsAtStoredRef = useRef(null)            // last `drawEndsAt` value already pushed into state
  const artistOfflineSinceStoredRef = useRef(null)    // last `artistOfflineSince` value already pushed into state
  const chatRef = useRef(null)
  const lastGuessAtRef = useRef(0)                    // client-side guess throttle (see MIN_GUESS_INTERVAL_MS)
  const prevLikesRef = useRef(round?.likes ?? null)   // hearts last seen, to float only new ones
  const floatIdRef = useRef(0)
  const floatTimersRef = useRef(new Set())             // pending float clean-ups, cleared on unmount

  // Always-fresh ref mirror of `round` — updated post-render (in an effect, not
  // during render, so this stays clear of the "no ref access during render"
  // rule) so the callbacks below can read the LATEST round without needing the
  // whole (freshly-recreated-every-render) `round` object in their dependency
  // arrays, which the compiler can't otherwise verify is safe to memoize on.
  const roundRef = useRef(round)
  useEffect(() => { roundRef.current = round })

  // ---- Artist: publish 3 word options on entering choosing (once) ----------
  const publishOptions = useCallback(() => {
    const r = roundRef.current
    if (!r || r.phase !== 'choosing' || r.artist !== mySeat || r.options) return
    if (optionsPublishAttemptRef.current === roundKey) return
    optionsPublishAttemptRef.current = roundKey
    const seed = hashString(`${gameId}:${r.matchSeed || 'legacy'}:${roundKey}`)
    const publishEndsAt = deadlineAfter(chooseMs)
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      const cr = current.round
      if (cr.phase !== 'choosing' || cr.artist !== mySeat || cr.options) return // stale/already published
      // Options avoid this match's `used` AND the room's seen history (earlier
      // matches), computed from the live node so the pick and the history
      // update land together. The offered words join the room history.
      const roomSeen = normalizeSeen(current.seen?.[SKETCH_SEEN_KEY])
      const picks = pickRoundOptions(SKETCH_WORDS, seed, normalizeRound(cr).used, roomSeen)
      return {
        ...current,
        round: { ...cr, options: picks, endsAt: publishEndsAt },
        seen: { ...(current.seen || {}), [SKETCH_SEEN_KEY]: markSeen(roomSeen, picks) },
      }
    }).catch(() => { optionsPublishAttemptRef.current = null })
  }, [roundKey, mySeat, gameId, now, chooseMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Artist: pick a word (manual click OR auto-pick at 0) ---------------
  const handlePickWord = useCallback(async (deckIndex) => {
    const r = roundRef.current
    if (!r || r.phase !== 'choosing' || r.artist !== mySeat) return
    if (pickedRef.current) return
    const entry = SKETCH_WORDS[deckIndex]
    if (!entry) return
    pickedRef.current = true
    try {
      const { hash, salt } = await commit(normalize(entry.word))
      // One salted hash per accepted form (word + alts, plural/space-folded) so
      // guessers can be matched leniently without the word in the clear.
      const accept = await acceptHashes(entry, salt)
      const pattern = wordPattern(entry.word)
      const drawStartedAt = now()
      const drawPhaseEndsAt = drawMs == null ? null : drawStartedAt + drawMs
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const cr = current.round
        if (cr.phase !== 'choosing' || cr.artist !== mySeat) return // stale — a new artist has since taken over
        return {
          ...current,
          round: {
            ...cr, commitment: { hash, salt }, accept, wordPattern: pattern, phase: 'drawing', endsAt: drawPhaseEndsAt,
            // Speed-bonus window for scoring (see sketchLogic.scoringWindow):
            // the scaled clock, or the base DRAW_MS when timers are off.
            drawStartedAt, drawMs: drawMs ?? DRAW_MS,
          },
        }
      })
    } catch {
      pickedRef.current = false
      toast.error('PICK FAILED — CHECK CONNECTION')
    }
  }, [mySeat, gameId, now, drawMs])

  // ---- Guesser: submit a guess — correct locks in via hash match -----------
  // Throttled client-side (min 500ms between guesses) so a fast-tapping/scripted
  // client can't spam unthrottled writes into the shared chat feed. A near miss
  // gets a private CLOSE! hint and never reaches the public chat.
  const handleSubmitGuess = useCallback(async () => {
    const r = roundRef.current
    if (!r || r.phase !== 'drawing') return
    if (r.artist === mySeat || r.correct?.[mySeat] || correctSentRef.current) return
    const nowTs = Date.now()
    if (nowTs - lastGuessAtRef.current < MIN_GUESS_INTERVAL_MS) return
    const raw = guessInput.trim().slice(0, MAX_GUESS_LEN)
    if (!raw) return
    const submittedDraftVersion = draftVersionRef.current
    const clearDraft = () => setGuessInput(current => draftVersionRef.current === submittedDraftVersion ? '' : current)
    const say = (message, tone) => setGuessFb(f => ({ key: roundKey, message, tone, id: f.id + 1 }))
    lastGuessAtRef.current = nowTs
    if (isBannedGuess(raw)) {
      say('NOT ALLOWED IN CHAT — TRY ANOTHER GUESS', 'bad')
      clearDraft()
      return
    }
    try {
      let isCorrect = false
      if (r.commitment) {
        isCorrect = r.accept?.length
          ? await guessMatchesAccept(raw, r.accept, r.commitment.salt)
          // rounds picked before accept-hashes existed: exact normalized match
          : await verifyReveal(r.commitment.hash, normalize(raw), r.commitment.salt)
      }
      if (isCorrect) {
        correctSentRef.current = true
        await update(ref(db, `games/${gameId}/round/correct`), { [mySeat]: { at: serverTimestamp() } })
        sounds.win()
        clearDraft()
        return
      }
      const word = derivedWord ?? (r.commitment ? await deriveWord(SKETCH_WORDS, r.options, r.commitment) : null)
      const entry = entryForWord(SKETCH_WORDS, r.options, word)
      if (entry && isNearMiss(raw, entry)) {
        say(`CLOSE! "${raw.toUpperCase()}" IS NEARLY IT — ONLY YOU SEE THIS`, 'info')
        clearDraft()
        return
      }
      await push(ref(db, `games/${gameId}/round/chat`), { uid: mySeat, text: raw })
      say('', 'info')
      clearDraft()
    } catch {
      correctSentRef.current = false
      toast.error('GUESS FAILED — CHECK CONNECTION')
    }
  }, [mySeat, guessInput, gameId, roundKey, derivedWord])

  // ---- Host: void the round and rotate the artist (choosing stalled) ------
  const handleSkipChoosing = useCallback(async () => {
    const nextEndsAt = deadlineAfter(chooseMs)
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const r = current.round
        if (r.phase !== 'choosing') return // already resolved
        const result = nextRoundState(withLists(r))
        if (result.finished) return { ...current, status: 'finished', proposal: null }
        return { ...current, proposal: null, round: { ...result.round, endsAt: nextEndsAt } }
      })
    } catch {
      toast.error('SKIP FAILED — CHECK CONNECTION')
    }
  }, [gameId, now, chooseMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Host: drawing -> reveal, scoring atomically in the same transaction -
  const advanceDrawingToReveal = useCallback(async () => {
    if (hostActionInFlightRef.current) return
    hostActionInFlightRef.current = true
    // The reveal's replay clock: every screen draws the same frame from it.
    const revealAt = now()
    const revealEndsAt = revealAt + REVEAL_MS
    try {
      // The word's tier sets the score multiplier. Every client can derive the
      // word from the public options + commitment (see deriveWord), so the
      // coordinator does it here rather than publishing the tier.
      const snap = roundRef.current
      const commitHash = snap?.commitment?.hash ?? null
      const word = commitHash ? await deriveWord(SKETCH_WORDS, snap.options, snap.commitment) : null
      const multiplier = tierMultiplier(entryForWord(SKETCH_WORDS, snap?.options, word)?.tier)
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const r = current.round
        if (r.phase !== 'drawing') return // already advanced
        const liveGuesserIds = participantGuessers(normalizeRound(r).order, r.artist)
        const deltas = roundDeltas({
          guesserIds: liveGuesserIds,
          correct: r.correct || {},
          artistId: r.artist,
          ...scoringWindow(r),
          // only trust the derived tier for the word it was derived from
          multiplier: r.commitment?.hash === commitHash ? multiplier : 1,
        })
        const newScores = { ...(current.scores || {}) }
        for (const [id, pts] of Object.entries(deltas)) newScores[id] = (newScores[id] || 0) + pts
        return {
          ...current,
          scores: newScores,
          round: { ...r, scored: true, phase: 'reveal', revealAt, endsAt: revealEndsAt },
        }
      })
    } catch {
      toast.error('SKIP FAILED — CHECK CONNECTION')
    } finally {
      hostActionInFlightRef.current = false
    }
  }, [gameId, now])

  // ---- Host: reveal -> next round (or match finished) on timeout ----------
  const advanceRevealToNext = useCallback(async (expectedEndsAt) => {
    if (hostActionInFlightRef.current) return
    hostActionInFlightRef.current = true
    const nextEndsAt = deadlineAfter(chooseMs)
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const r = current.round
        if (r.phase !== 'reveal' || r.endsAt !== expectedEndsAt) return // already advanced / stale
        // This drawing's hearts join the match tally in the same write, so a
        // coordinator hand-off cannot count them twice (foldLikes replaces).
        const faves = foldLikes(r.faves, r)
        const result = nextRoundState(withLists({ ...r, faves }))
        if (result.finished) return { ...current, status: 'finished', proposal: null, round: { ...r, faves, likes: null } }
        return { ...current, proposal: null, round: { ...result.round, endsAt: nextEndsAt } }
      })
    } catch {
      /* ignore */
    } finally {
      hostActionInFlightRef.current = false
    }
  }, [gameId, now, chooseMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Player: heart the drawing, or take the heart back -------------------
  // One heart per player per drawing; it never touches the score. A tap that
  // lands after the round moved on is refused by the rules and dropped
  // silently; any other failure says so.
  const handleHeart = useCallback(async () => {
    const r = roundRef.current
    if (!r || !mySeat) return
    const mine = r.likes?.[mySeat] === true
    sounds.emote()
    haptic(10)
    try {
      await set(ref(db, `games/${gameId}/round/likes/${mySeat}`), mine ? null : true)
    } catch {
      const cur = roundRef.current
      const sameRound = cur && cur.cycle === r.cycle && cur.artist === r.artist && cur.phase !== 'choosing'
      if (sameRound) toast.error('HEART FAILED — CHECK CONNECTION')
    }
  }, [gameId, mySeat])

  // ---- Reset per-round local state when a NEW round begins ----------------
  useEffect(() => {
    if (roundKey !== prevRoundKeyRef.current) {
      setGuessInput('')
      setDerivedWord(null)
      setArtistOfflineSince(null)
      setPickingIdx(null)
      correctSentRef.current = false
      pickedRef.current = false
      prevCorrectKeysRef.current = new Set()
      artistOfflineSinceStoredRef.current = null
      hintPublishRef.current = null
      prevHintCountRef.current = 0
      setHintFlash(null)
      setShowAllGuesses(false)
      prevRoundKeyRef.current = roundKey
    }
  }, [roundKey])

  // ---- Derive the chosen word from public options + commitment ------------
  // (No synchronous "clear" branch here — commitment/options only ever go
  // missing on a genuinely NEW round, which the reset-per-round effect above
  // already handles; this effect only ever needs to SET a resolved word.)
  const optionsKey = round?.options ? round.options.join(',') : null
  useEffect(() => {
    if (!round?.commitment?.hash || !round?.options) return
    let cancelled = false
    deriveWord(SKETCH_WORDS, round.options, round.commitment).then(word => {
      if (!cancelled) setDerivedWord(word)
    })
    return () => { cancelled = true }
  }, [round?.commitment?.hash, optionsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sound cues: phase transitions -----------------------------------
  useEffect(() => {
    if (!round) return
    if (round.phase !== prevPhaseRef.current) {
      if (round.phase === 'drawing') sounds.go()
      if (round.phase === 'reveal' && Object.keys(round.correct || {}).length === 0) sounds.miss()
      prevPhaseRef.current = round.phase
    }
  }, [round?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sound cue: someone ELSE's correct guess lands -----------------------
  useEffect(() => {
    if (!round) return
    const keys = Object.keys(round.correct || {})
    const prev = prevCorrectKeysRef.current
    const isNewRound = keys.length < prev.size // a round boundary just reset correct — don't diff across it
    if (!isNewRound && keys.some(k => !prev.has(k) && k !== mySeat)) sounds.bell()
    prevCorrectKeysRef.current = new Set(keys)
  }, [round?.correct, mySeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sound cue: match finished -------------------------------------------
  useEffect(() => {
    if (game.status !== prevStatusRef.current) {
      if (game.status === 'finished' && isPlayer) {
        const scores = game.scores || {}
        const order = seatOrder(players || {})
        const maxScore = Math.max(0, ...order.map(id => scores[id] || 0))
        if ((scores[mySeat] || 0) === maxScore) sounds.matchWin()
        else sounds.lose()
      }
      prevStatusRef.current = game.status
    }
  }, [game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Artist: publish a letter hint when its moment comes -----------------
  // Only this phone knows the word for certain (the room holds a commitment),
  // so only it can write `round/hints/{n}`; the rules refuse anyone else. An
  // offline artist publishes nothing and the round simply has no hint. The
  // letters are deterministic from the commitment, so a reload republishes the
  // same ones.
  useEffect(() => {
    if (!isArtist || !round || round.phase !== 'drawing' || !derivedWord || !round.commitment?.hash) return
    const next = nextHintToPublish({
      word: derivedWord, seed: hashString(round.commitment.hash), round, published: round.hints, now: nowMs,
    })
    if (!next) return
    const tag = `${roundKey}:${next.n}`
    if (hintPublishRef.current === tag) return
    hintPublishRef.current = tag
    set(ref(db, `games/${gameId}/round/hints/${next.n}`), { i: next.i, c: next.c })
      .catch(() => { if (hintPublishRef.current === tag) hintPublishRef.current = null })
  }, [isArtist, round?.phase, round?.hints, round?.commitment?.hash, derivedWord, nowMs, roundKey, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- A new hint lands: a short cue for everyone who is guessing -----------
  useEffect(() => {
    if (hints.length > prevHintCountRef.current && round?.phase === 'drawing') {
      setHintFlash(hints[hints.length - 1].n)
      if (!isArtist) sounds.hint()
    }
    prevHintCountRef.current = hints.length
  }, [hints.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hintFlash == null) return undefined
    const t = setTimeout(() => setHintFlash(null), 3000)
    return () => clearTimeout(t)
  }, [hintFlash])

  // ---- Hearts from others float up from the button (not under reduced motion) --
  useEffect(() => {
    const likes = round?.likes ?? null
    const fresh = newHeartsFrom(prevLikesRef.current, likes, mySeat)
    prevLikesRef.current = likes
    if (fresh.length === 0 || isReducedMotion()) return undefined
    const added = fresh.map(() => ({ id: ++floatIdRef.current }))
    setHeartFloats(list => [...list, ...added].slice(-MAX_HEART_FLOATS))
    const ids = new Set(added.map(f => f.id))
    const t = setTimeout(() => {
      floatTimersRef.current.delete(t)
      setHeartFloats(list => list.filter(f => !ids.has(f.id)))
    }, 1300)
    floatTimersRef.current.add(t)
    return undefined
  }, [round?.likes, mySeat])
  useEffect(() => {
    const timers = floatTimersRef.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])

  // ---- The match's first reveal this phone can heart: TAP ♥ IF YOU LOVE IT --
  const canHeartReveal = round?.phase === 'reveal'
    && heartView({ round, uid: mySeat, isPlayer, hasDrawing: !!round?.hasDrawing }) === 'button'
  // (state adjusted during render: it changes once per match)
  if (canHeartReveal && round.revealAt != null && heartHint?.seed !== round.matchSeed) {
    setHeartHint({ seed: round.matchSeed, key: `${roundKey}:${round.revealAt}` })
  }

  // ---- Reveal: keep this round's drawing for the end-of-match gallery -------
  // Built locally from the strokes this phone already holds; nothing is sent.
  useEffect(() => {
    if (!round || round.phase !== 'reveal' || !derivedWord) return
    const id = `${roundKey}:${round.matchSeed}`
    if (galleryAddedRef.current === id) return
    const entry = galleryEntry({
      round,
      word: derivedWord,
      tier: entryForWord(SKETCH_WORDS, round.options, derivedWord)?.tier,
      artistName: players?.[round.artist]?.name,
      strokes: drawingRef.current.strokes,
      fills: drawingRef.current.fills,
    })
    if (!entry) return
    galleryAddedRef.current = id
    setGalleryStore(store => ({ seed: round.matchSeed, entries: addToGallery(galleryFor(store, round.matchSeed), entry) }))
  }, [round?.phase, derivedWord, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (galleryStore) saveGallery(gameId, galleryStore) }, [galleryStore, gameId])

  // ---- Artist: publish options as soon as we enter choosing ----------------
  useEffect(() => { publishOptions() }, [publishOptions])

  // ---- Artist: auto-pick options[0] once the choosing clock hits 0 --------
  useEffect(() => {
    if (!round || round.phase !== 'choosing' || round.artist !== mySeat) return
    if (!round.options || pickedRef.current) return
    if (round.endsAt == null || nowMs < round.endsAt) return
    handlePickWord(round.options[0])
  }, [round?.phase, round?.artist, optionsKey, round?.endsAt, mySeat, nowMs, handlePickWord]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Snapshot the drawing phase's own endsAt (see `drawEndsAt` above) ----
  // Gated on a ref comparison (not just the dependency list) so this reads as
  // "sync only on genuine change", matching the reset-per-round effect's shape.
  useEffect(() => {
    if (round?.phase === 'drawing' && round.endsAt !== drawEndsAtStoredRef.current) {
      drawEndsAtStoredRef.current = round.endsAt
      setDrawEndsAt(round.endsAt)
    }
  }, [round?.phase, round?.endsAt])

  // ---- Track how long THIS client has observed the artist as offline ------
  useEffect(() => {
    const artistOnline = !round || round.phase !== 'drawing' || players?.[round.artist]?.online !== false
    if (artistOnline) {
      if (artistOfflineSinceStoredRef.current !== null) {
        artistOfflineSinceStoredRef.current = null
        setArtistOfflineSince(null)
      }
      return
    }
    if (artistOfflineSinceStoredRef.current == null) {
      artistOfflineSinceStoredRef.current = nowMs
      setArtistOfflineSince(nowMs)
    }
  }, [round?.phase, round?.artist, players, nowMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Coordinator: drawing -> reveal, automatically, on timeout or all-correct --
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'drawing') return
    const allCorrect = activeGuesserIds.length > 0 && activeGuesserIds.every(id => round.correct?.[id])
    const timedOut = round.endsAt != null && nowMs >= round.endsAt
    if (allCorrect || timedOut) advanceDrawingToReveal()
  }, [amCoordinator, round?.phase, round?.endsAt, round?.correct, activeGuesserIds.join(','), nowMs, advanceDrawingToReveal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Coordinator: reveal -> next round, automatically, on timeout --------------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'reveal') return
    if (round.endsAt != null && nowMs < round.endsAt) return
    advanceRevealToNext(round.endsAt)
  }, [amCoordinator, round?.phase, round?.endsAt, nowMs, advanceRevealToNext]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chat auto-scroll. Rendered feed is capped (MAX_CHAT_FEED) — a spammy/scripted
  // guesser can still push many entries, but the DOM never has to render all of them.
  const allChatEntries = round ? Object.entries(round.chat || {}).sort(([a], [b]) => (a < b ? -1 : 1)) : []
  const chatEntries = allChatEntries.slice(-MAX_CHAT_FEED)
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chatEntries.length])

  // -------------------------------------------------------------------------
  // LOBBY / FINISHED (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const order = seatOrder(players || {})
    const playerCount = order.length
    const scores = game.scores || {}
    const maxScore = matchOver ? Math.max(0, ...order.map(id => scores[id] || 0)) : 0
    const winners = matchOver ? order.filter(id => (scores[id] || 0) === maxScore) : []
    const iWon = winners.includes(mySeat)
    const enough = playerCount >= MIN_PLAYERS
    const winnerNames = winners.map(id => (players[id]?.name || '???').toUpperCase())

    return (
      <div className="space-y-5 text-center">
        {matchOver && winners.length > 0 && (
          <div className="space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">
              {iWon ? 'YOU WIN!' : winners.length > 1 ? `${winners.length}-WAY TIE — ${winnerNames.join(' & ')}` : `${winnerNames[0]} WINS`}
            </p>
          </div>
        )}

        {!matchOver && (
          <>
          <div className="space-y-2">
            <p className="font-pixel text-sm text-retro-p1 text-glow-p1">SKETCH</p>
            <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
              One player draws the secret word.<br />Everyone else races to guess it.
            </p>
          </div>

          <div className="bg-retro-surface border border-retro-border rounded p-3 text-left space-y-1">
            <p className="font-pixel text-[8px] text-retro-dim tracking-widest">HOW SCORING WORKS</p>
            <p className="font-mono text-[10px] text-retro-text leading-relaxed">
              2 players: guesser earns 50–100 by speed; artist earns half.<br />
              3+ players: guessers earn 100, 90, 80… down to 50 by order; artist earns +25 per solve.<br />
              Harder words pay more: MEDIUM ×{tierMultiplier(2)}, HARD ×{tierMultiplier(3)} for guessers and artist.<br />
              Draw it, don&apos;t write it: no letters or numbers.<br />
              Stuck? The artist&apos;s phone shows a letter at half time and another at three quarters.
            </p>
          </div>
          </>
        )}

        {matchOver ? (
          <>
            <CrowdFavourite
              award={crowdFavourite(game.round?.faves, { order: normalizeList(game.round?.order) })}
              entries={galleryFor(galleryStore, game.round?.matchSeed)}
              players={players}
              order={normalizeList(game.round?.order)}
            />
            <Podium rows={podium(order, scores)} players={players} mySeat={mySeat} />
            <Gallery entries={galleryFor(galleryStore, game.round?.matchSeed)} />
          </>
        ) : (
          <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
            <p className="font-pixel text-[9px] text-retro-dim tracking-widest">PLAYERS ({playerCount})</p>
            {order.length === 0 && <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>}
            {order.map(id => (
              <div key={id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className={cn('flex items-center gap-1.5 truncate', id === mySeat ? 'text-retro-p1' : 'text-retro-text')}>
                  <Avatar id={players[id]?.avatar} size={24} />
                  {(players[id]?.name || '???').toUpperCase()}{id === mySeat ? ' (YOU)' : ''}
                  {players[id]?.online === false && <span className="text-retro-p2 text-[9px]"> ·OFFLINE</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {!enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink leading-relaxed">
            NEED {MIN_PLAYERS - playerCount} MORE PLAYER{MIN_PLAYERS - playerCount === 1 ? '' : 'S'}<br />TO START
          </p>
        )}

        {amCoordinator && enough && !matchOver && (
          <button
            onClick={() => runStart(onStart)}
            disabled={starting}
            className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press disabled:opacity-50"
          >
            {starting ? 'STARTING…' : 'START ROUND'}
          </button>
        )}
        {!amCoordinator && enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">WAITING TO START…</p>
        )}

        {matchOver && isPlayer && (
          <RoundEndPanel
            actions={[
              !proposal && onNewMatch && {
                key: 'new', label: 'NEW MATCH', busyLabel: 'RESETTING…', onClick: onNewMatch,
              },
            ]}
            share={{
              gameLabel: 'SKETCH',
              headline: iWon ? 'YOU WIN!' : winners.length > 1 ? `${winners.length}-WAY TIE` : `${winnerNames[0]} WINS`,
              sub: 'Sketch · Game Night',
            }}
          />
        )}

        {isPlayer && onSwitchGame && !proposal && <GameSwitcher currentType="sketch" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Starting up — round not seeded yet.
  // -------------------------------------------------------------------------
  if (!round || !round.artist) {
    return (
      <div className="text-center py-8 font-pixel text-[10px] text-retro-dim arcade-blink">
        STARTING ROUND…
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Active round — the stage.
  // -------------------------------------------------------------------------
  const artistName = (players[round.artist]?.name || '???').toUpperCase()
  const totalCycles = cyclesFor(round.order.length)
  // Timers off: no auto-pick will ever fire, so the coordinator may pass a
  // stalled artist on as soon as the options are up.
  const showChoosingSkip = amCoordinator && round.phase === 'choosing' && (
    round.endsAt != null
      ? nowMs >= round.endsAt + SKIP_CHOOSING_GRACE_MS
      : noTimer && !isArtist && !!round.options
  )
  const showEndRound = noTimer && amCoordinator && round.phase === 'drawing' && round.endsAt == null
  const artistOfflineMs = artistOfflineSince != null ? nowMs - artistOfflineSince : 0
  const showArtistOfflineSkip = amCoordinator && round.phase === 'drawing' && artistOfflineMs >= ARTIST_OFFLINE_DRAWING_MS

  const revealGuesserIds = participantGuessers(round.order, round.artist)
  const roundEntry = entryForWord(SKETCH_WORDS, round.options, derivedWord)
  const revealDeltas = round.phase === 'reveal'
    ? roundDeltas({
      guesserIds: revealGuesserIds,
      correct: round.correct,
      artistId: round.artist,
      ...scoringWindow(round, drawEndsAt),
      multiplier: tierMultiplier(roundEntry?.tier),
    })
    : null

  // The points fly once the replay has finished on this phone (or was skipped);
  // the room's clock is the backstop.
  const revealKey = `${roundKey}:${round.revealAt ?? ''}`
  const pointsReady = replayDoneKey === revealKey
    || (round.revealAt != null && replayOver({ elapsed: nowMs - round.revealAt }))

  const tiles = faceTiles({ players, order: round.order, scores: game.scores, round })
  const correctCount = participantGuesserIds.filter(id => round.correct?.[id]).length
  const gotIt = gotItLabel(correctCount, participantGuesserIds.length)
  const canReportArtist = !isArtist && (round.phase === 'drawing' || round.phase === 'reveal')
  const inPlay = round.phase === 'drawing' || round.phase === 'reveal'
  const newestHintN = hintFlash
  const heart = heartView({ round, uid: mySeat, isPlayer, hasDrawing: round.hasDrawing })
  const showHeartHint = heart === 'button' && round.phase === 'reveal' && round.revealAt != null
    && heartHint?.key === revealKey && nowMs - round.revealAt < HEART_HINT_MS

  return (
    <div className="space-y-2" ref={stageRef} data-testid="sketch-stage" data-phase={round.phase} data-role={stageRole}>
      <FaceStrip
        tiles={tiles}
        mySeat={mySeat}
        deltas={pointsReady ? revealDeltas : null}
        holdableId={canReportArtist ? round.artist : null}
        onHold={() => setMenuOpen(true)}
        onTap={() => toast('HOLD THE ARTIST’S FACE TO REPORT THE DRAWING', { id: 'sketch-hold-tip' })}
      />

      {/* ---- CHOOSING PHASE ---- */}
      {round.phase === 'choosing' && (
        <div className="space-y-3 rounded border border-retro-border bg-retro-card p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-left">
              <p className="font-pixel text-[9px] tracking-widest text-retro-dim">CYCLE {round.cycle}/{totalCycles}</p>
              <p className="font-pixel text-[11px] text-retro-text">
                {isArtist ? 'YOUR TURN TO DRAW' : `${artistName} IS CHOOSING…`}
              </p>
              {isArtist && (
                <p className="mt-0.5 font-mono text-[10px] text-retro-dim">Pick a word. Harder words are worth more for everyone.</p>
              )}
            </div>
            <TimerRing endsAt={round.endsAt} totalMs={chooseMs ?? CHOOSE_MS} now={nowMs} />
          </div>
          {isArtist ? (
            round.options ? (
              <div className="space-y-2">
                {round.options.map(idx => (
                  <button
                    key={idx}
                    onClick={() => { setPickingIdx(idx); runPick(() => handlePickWord(idx)) }}
                    disabled={picking}
                    className="w-full min-h-11 rounded border-2 border-retro-border px-3 py-2 font-mono text-[13px] text-retro-text transition press-card hover:border-retro-p1 disabled:opacity-50"
                  >
                    {picking && pickingIdx === idx ? 'LOCKING IN…' : (
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-left">{(SKETCH_WORDS[idx]?.word || '').toUpperCase()}</span>
                        <span className="shrink-0 text-right font-pixel text-[8px] text-retro-dim">
                          {TIER_LABELS[SKETCH_WORDS[idx]?.tier] || 'WORD'} · {wordPattern(SKETCH_WORDS[idx]?.word || '').split(' ').join(' + ')}
                          {multiplierLabel(SKETCH_WORDS[idx]?.tier) && ` ${multiplierLabel(SKETCH_WORDS[idx]?.tier)}`}
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center font-pixel text-[9px] text-retro-dim arcade-blink">PICKING WORDS…</p>
            )
          ) : (
            <div className="flex justify-center py-4">
              <PixelDots tone="p2" size="lg" glow />
            </div>
          )}
          {showChoosingSkip && (
            <div className="text-center">
              <button
                onClick={() => runSkipChoosing(handleSkipChoosing)}
                disabled={skippingChoosing}
                className="min-h-11 rounded border border-retro-p2 px-5 py-2 font-pixel text-[9px] text-retro-p2 transition press disabled:opacity-50"
              >
                {skippingChoosing ? 'SKIPPING…' : 'SKIP ROUND'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- DRAWING + REVEAL: the word above the drawing, one canvas for both ---- */}
      {inPlay && (
        <>
          <div className="flex items-center gap-2" data-testid="sketch-head">
            <div className="min-w-0 flex-1 space-y-1 text-left">
              {round.phase === 'drawing' ? (
                <>
                  <p className="truncate font-pixel text-[8px] tracking-wider text-retro-dim">
                    {haveIGuessedCorrectly
                      ? `✓ YOU GOT IT · ${gotIt}`
                      : isArtist
                        ? `YOU DRAW · ${gotIt}`
                        : `${artistName} IS DRAWING · CYCLE ${round.cycle}/${totalCycles}`}
                  </p>
                  {isArtist ? (
                    <p className="font-pixel text-sm tracking-widest text-retro-cta text-glow-cta" data-testid="sketch-word">
                      {derivedWord ? derivedWord.toUpperCase() : '…'}
                    </p>
                  ) : (
                    <Blanks
                      pattern={round.wordPattern}
                      hints={hints}
                      flashN={newestHintN}
                      solvedWord={haveIGuessedCorrectly ? (derivedWord || '…') : null}
                    />
                  )}
                </>
              ) : (
                <>
                  <p className="truncate font-pixel text-[8px] tracking-wider text-retro-dim">
                    {isArtist ? 'YOU DREW' : `${artistName} DREW`} · {gotIt}
                  </p>
                  <p className="font-pixel text-base tracking-widest text-retro-win text-glow-win" data-testid="sketch-word">
                    {derivedWord ? derivedWord.toUpperCase() : '…'}
                  </p>
                  {roundEntry && multiplierLabel(roundEntry.tier) && (
                    <p className="font-pixel text-[8px] tracking-wider text-retro-dim">
                      {TIER_LABELS[roundEntry.tier]} WORD · POINTS {multiplierLabel(roundEntry.tier)}
                    </p>
                  )}
                  {!round.scored && <p className="font-pixel text-[9px] text-retro-cta arcade-blink">TALLYING…</p>}
                </>
              )}
            </div>
            <TimerRing
              endsAt={round.endsAt}
              totalMs={round.phase === 'reveal' ? REVEAL_MS : (round.drawMs ?? DRAW_MS)}
              now={nowMs}
            />
          </div>

          <SketchCanvas
            gameId={gameId}
            isArtist={isArtist && round.phase === 'drawing'}
            side={stageSide}
            onContent={(strokes, fills) => { drawingRef.current = { strokes, fills } }}
            replay={round.phase === 'reveal' ? { startAt: round.revealAt, onDone: () => setReplayDoneKey(revealKey) } : null}
          >
            <GuessBubbles entries={chatEntries} players={players} mySeat={mySeat} reserveRight={!!heart} />
            <HeartButton
              view={heart}
              count={likeCount(round.likes)}
              mine={round.likes?.[mySeat] === true}
              onToggle={() => runHeart(handleHeart)}
              busy={hearting}
              floats={heartFloats}
              hint={showHeartHint}
            />
            {hintFlash != null && !isArtist && (
              <span
                role="status"
                className="sketch-bubble-in pointer-events-none absolute right-1.5 top-1.5 whitespace-nowrap rounded border border-retro-cta bg-retro-card px-2 py-0.5 font-pixel text-[9px] text-retro-cta"
              >
                HINT · NEW LETTER
              </span>
            )}
          </SketchCanvas>
        </>
      )}

      {/* ---- DRAWING: the guess box, kept just under the drawing ---- */}
      {round.phase === 'drawing' && (
        <div className="space-y-2">
          {isPlayer && !isArtist && !haveIGuessedCorrectly && (
            <div className="space-y-1">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={guessInput}
                  onChange={e => {
                    draftVersionRef.current += 1
                    setGuessInput(e.target.value)
                  }}
                  onKeyDown={e => e.key === 'Enter' && runGuess(handleSubmitGuess)}
                  autoFocus={!coarsePointer}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  aria-label="Your guess"
                  maxLength={MAX_GUESS_LEN}
                  placeholder="TYPE YOUR GUESS…"
                  className="min-h-11 min-w-0 flex-1 rounded border-2 border-retro-border bg-retro-surface px-3 py-2 font-mono text-[12px] text-retro-text focus:border-retro-p1 focus:outline-none"
                />
                <button
                  onClick={() => runGuess(handleSubmitGuess)}
                  disabled={guessing || !guessInput.trim()}
                  className="min-h-11 min-w-[4.5rem] rounded bg-retro-cta px-4 py-2 font-pixel text-[10px] text-retro-bg transition press disabled:opacity-40"
                >
                  {guessing ? 'GUESSING…' : 'GO'}
                </button>
              </div>
              <WordFeedback
                message={guessFb.key === roundKey ? guessFb.message : ''}
                tone={guessFb.tone}
                id={guessFb.id}
              />
            </div>
          )}
          {haveIGuessedCorrectly && (
            <p className="text-center font-pixel text-[9px] text-retro-win arcade-blink">SHH — OTHERS ARE STILL GUESSING</p>
          )}

          {allChatEntries.length > 0 && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setShowAllGuesses(v => !v)}
                aria-expanded={showAllGuesses}
                className="min-h-11 w-full rounded border border-retro-border font-pixel text-[8px] tracking-widest text-retro-dim transition press"
              >
                {showAllGuesses ? 'HIDE' : 'ALL'} GUESSES ({allChatEntries.length})
              </button>
              {showAllGuesses && (
                <div ref={chatRef} className="max-h-40 space-y-1 overflow-y-auto rounded border border-retro-border bg-retro-card p-2">
                  {chatEntries.map(([key, c]) => (
                    <p key={key} className="break-words font-mono text-[11px] text-retro-text">
                      <span className="text-retro-dim">{(players[c.uid]?.name || '???').toUpperCase()}:</span> {c.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {showEndRound && (
            <div className="text-center">
              <button
                onClick={() => runEndRound(() => advanceDrawingToReveal())}
                disabled={endingRound}
                className="min-h-11 rounded border border-retro-border px-5 py-2 font-pixel text-[9px] text-retro-dim transition press hover:border-retro-p2 hover:text-retro-p2 disabled:opacity-50"
              >
                {endingRound ? 'ENDING…' : 'END ROUND'}
              </button>
            </div>
          )}

          {showArtistOfflineSkip && (
            <div className="space-y-2 rounded border border-retro-p2/30 p-3 text-center">
              <p className="font-pixel text-[9px] text-retro-p2">ARTIST IS OFFLINE</p>
              <button
                onClick={() => runSkipDrawing(() => advanceDrawingToReveal())}
                disabled={skippingDrawing}
                className="min-h-11 rounded border border-retro-p2 px-5 py-2 font-pixel text-[9px] text-retro-p2 transition press disabled:opacity-50"
              >
                {skippingDrawing ? 'SKIPPING…' : 'SKIP ROUND'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* The artist's face menu (hold the face): REPORT lives here, not in the stage. */}
      {menuOpen && (
        <BottomSheet centered onClose={() => setMenuOpen(false)} ariaLabel="Artist menu">
          <div className="space-y-3 p-4 text-center">
            <p className="font-pixel text-[10px] tracking-widest text-retro-dim">{artistName}&apos;S DRAWING</p>
            <ReportButton
              context="drawing"
              gameId={gameId}
              targetUid={round.artist}
              targetName={players[round.artist]?.name}
              label="REPORT DRAWING"
              className="w-full"
              onDone={() => setMenuOpen(false)}
            />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="min-h-11 w-full rounded border border-retro-border font-pixel text-[9px] text-retro-dim transition press"
            >
              CLOSE
            </button>
          </div>
        </BottomSheet>
      )}

      {!proposal && onSwitchGame && <GameSwitcher currentType="sketch" onSwitch={onSwitchGame} />}
    </div>
  )
}
