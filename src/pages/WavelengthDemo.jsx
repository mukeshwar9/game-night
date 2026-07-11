import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import PartyBotSetup from '../components/PartyBotSetup'
import Avatar from '../components/Avatar'
import PixelDots from '../components/loading/PixelDots'
import { generateBotRoster, pickBotClue, pickBotGuess } from '../lib/partyBots'
import {
  getSpectrumPair,
  randomSpectrumIndex,
  randomTarget,
  clampGuess,
  scoreGuess,
  seatOrder,
  nextClueGiver,
} from '../lib/wavelengthLogic'
import { sounds } from '../lib/sounds'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { cn } from '@/lib/utils'

// Solo/bot WAVELENGTH — human + 2-7 bots, fully local (useReducer), no Firebase,
// no commit-reveal (there's no other real player to cheat against, so the
// hidden target just lives in reducer state until the reveal phase renders it).

const MIN_BOTS = 2
const MAX_BOTS = 7
const DEFAULT_BOTS = 3
const WIN_SCORE = 200 // kept in sync with WavelengthGame.jsx

// -----------------------------------------------------------------------------
// Local helpers
// -----------------------------------------------------------------------------

// Mirrors PartyBotSetup.jsx's own private readOwnAvatar — duplicated here (not
// exported there) so the scoreboard/reveal markers can show the human's real
// avatar instead of a placeholder.
function readOwnAvatar() {
  try {
    return localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  } catch {
    return defaultAvatarForId(getPlayerId())
  }
}

// Synthetic players map shaped like the multiplayer `players` node, so
// seatOrder()/nextClueGiver() (which key off joinedAt) work unchanged. Human
// always has the smallest joinedAt, so they're always first in the rotation.
function buildPlayers(roster) {
  const players = { human: { playerId: 'human', joinedAt: 0, name: 'YOU', avatar: readOwnAvatar() } }
  roster.forEach((bot, i) => {
    players[bot.id] = { playerId: bot.id, joinedAt: i + 1, name: bot.name, avatar: bot.avatar }
  })
  return players
}

// Sorts guess markers ascending and stacks any that land within `thresholdPct`
// of the previous one — up to 7 guessers can share a dial (8-player match), so
// a tight cluster around the target is common and would otherwise overlap.
function layoutMarkers(entries, thresholdPct = 8) {
  const sorted = [...entries].sort((a, b) => a.guess - b.guess)
  let lastGuess = null
  let level = 0
  return sorted.map(entry => {
    if (lastGuess != null && Math.abs(entry.guess - lastGuess) < thresholdPct) level += 1
    else level = 0
    lastGuess = entry.guess
    return { ...entry, level }
  })
}

// -----------------------------------------------------------------------------
// Reducer
// -----------------------------------------------------------------------------

const initialGameState = {
  phase: 'setup', // setup | clue | guessing | reveal | matchover
  players: {},
  order: [],
  scores: {},
  clueGiver: null,
  spectrumIndex: 0,
  target: null,
  clueWord: '',
  guesses: {},
  usedClueWords: {}, // { [spectrumIndex]: string[] } — reset per match, kept across its rounds
  lastDelta: null, // { [playerId]: pointsGained } — this round's earned points, for the reveal highlight
  winner: null,
  round: 0,
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_MATCH': {
      const { players, order } = action
      const scores = {}
      order.forEach(id => { scores[id] = 0 })
      const clueGiver = order[0]
      return {
        ...initialGameState,
        phase: 'clue',
        players,
        order,
        scores,
        clueGiver,
        spectrumIndex: randomSpectrumIndex(),
        // The human clue-giver sees the target immediately (mirrors the
        // multiplayer clue-giver view of the dial); a bot clue-giver's target
        // isn't known until its BOT_CLUE_READY dispatch.
        target: clueGiver === 'human' ? randomTarget() : null,
        round: 1,
      }
    }

    case 'SUBMIT_HUMAN_CLUE': {
      if (state.phase !== 'clue' || state.clueGiver !== 'human') return state
      return { ...state, clueWord: action.clueWord, phase: 'guessing' }
    }

    case 'BOT_CLUE_READY': {
      if (state.phase !== 'clue' || state.clueGiver === 'human') return state
      const used = state.usedClueWords[state.spectrumIndex] || []
      return {
        ...state,
        target: action.target,
        clueWord: action.clueWord,
        phase: 'guessing',
        usedClueWords: { ...state.usedClueWords, [state.spectrumIndex]: [...used, action.clueWord] },
      }
    }

    case 'SUBMIT_GUESS': {
      if (state.phase !== 'guessing') return state
      const { playerId, guess } = action
      if (playerId === state.clueGiver) return state
      if (state.guesses[playerId] != null) return state
      const guesses = { ...state.guesses, [playerId]: clampGuess(guess) }
      const guesserIds = state.order.filter(id => id !== state.clueGiver)
      const allGuessed = guesserIds.every(id => guesses[id] != null)
      if (!allGuessed) return { ...state, guesses }
      const lastDelta = {}
      guesserIds.forEach(id => { lastDelta[id] = scoreGuess(guesses[id], state.target) })
      return { ...state, guesses, phase: 'reveal', lastDelta }
    }

    // Mirrors WavelengthGame.jsx's handleNextRound exactly: the clue-giver earns
    // nothing from their own round (only guessers are folded into `scores`
    // here), and the win check happens on advance, not at reveal time.
    case 'NEXT_ROUND': {
      if (state.phase !== 'reveal') return state
      const scores = { ...state.scores }
      Object.entries(state.lastDelta || {}).forEach(([id, pts]) => {
        scores[id] = (scores[id] || 0) + pts
      })
      const winner = state.order.find(id => (scores[id] || 0) >= WIN_SCORE)
      if (winner) {
        return { ...state, scores, phase: 'matchover', winner }
      }
      const clueGiver = nextClueGiver(state.players, state.clueGiver)
      return {
        ...state,
        scores,
        clueGiver,
        spectrumIndex: randomSpectrumIndex(state.spectrumIndex),
        target: clueGiver === 'human' ? randomTarget() : null,
        clueWord: '',
        guesses: {},
        lastDelta: null,
        round: state.round + 1,
      }
    }

    case 'RESET_TO_SETUP':
      return { ...initialGameState }

    default:
      return state
  }
}

// -----------------------------------------------------------------------------
// Dial — re-authored locally from WavelengthGame.jsx's Dial (not imported —
// the multiplayer page is off limits to edits and this keeps the demo
// self-contained). Same visual language: spectrum track, revealed target
// marker, draggable guess thumb.
// -----------------------------------------------------------------------------
function Dial({ value, onChange, disabled, pair, target = null }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between font-pixel text-[9px]">
        <span className="text-retro-p1 text-glow-p1">{pair.left}</span>
        <span className="text-retro-p2 text-glow-p2">{pair.right}</span>
      </div>
      <div className="relative h-8">
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full border border-retro-border"
          style={{
            background:
              'linear-gradient(90deg, rgb(var(--c-p1)) 0%, rgb(var(--c-surface)) 50%, rgb(var(--c-p2)) 100%)',
          }}
        />
        {target != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-retro-win shadow-neon-win"
            style={{ left: `${clampGuess(target)}%` }}
          >
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-pixel text-[8px] text-retro-win whitespace-nowrap">
              ★ {clampGuess(target)}
            </span>
          </div>
        )}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-retro-cta bg-retro-bg',
            !disabled && 'shadow-neon-cta',
          )}
          style={{ left: `${clampGuess(value)}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          aria-label="Your guess on the spectrum"
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-11 opacity-0 cursor-pointer disabled:cursor-default"
        />
      </div>
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">{clampGuess(value)}</p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Scoreboard — every seated player (human + bots), sorted by score desc.
// -----------------------------------------------------------------------------
function Scoreboard({ players, scores, mySeat, clueGiver, highlight }) {
  const rows = Object.values(players || {})
    .filter(p => p && p.playerId)
    .map(p => ({ ...p, score: scores?.[p.playerId] || 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">SCORES</p>
      {rows.map(p => (
        <div key={p.playerId} className="flex items-center justify-between gap-2 font-pixel text-[9px]">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar id={p.avatar} size={16} />
            <span className={cn('truncate', p.playerId === mySeat ? 'text-retro-cta' : 'text-retro-text')}>
              {p.playerId === clueGiver && <span className="text-retro-p2">◆ </span>}
              {(p.name || '???').toUpperCase()}
              {p.playerId === mySeat && <span className="text-retro-dim"> (YOU)</span>}
            </span>
          </span>
          <span className={cn(
            'shrink-0 tabular-nums',
            highlight?.[p.playerId] != null ? 'text-retro-win text-glow-win' : 'text-retro-dim',
          )}>
            {p.score}{highlight?.[p.playerId] != null ? ` +${highlight[p.playerId]}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
export default function WavelengthDemo() {
  const [botCount, setBotCount] = useState(DEFAULT_BOTS)
  const [roster, setRoster] = useState(() => generateBotRoster(DEFAULT_BOTS, Date.now()))
  const rosterById = useMemo(() => Object.fromEntries(roster.map(b => [b.id, b])), [roster])

  const [gameState, dispatch] = useReducer(gameReducer, initialGameState)

  const [clueInput, setClueInput] = useState('')
  const [clueError, setClueError] = useState('')
  const [dialValue, setDialValue] = useState(50)

  const prevPhase = useRef(gameState.phase)
  const prevRound = useRef(gameState.round)

  const handleBotCountChange = (n) => {
    const clamped = Math.max(MIN_BOTS, Math.min(MAX_BOTS, n))
    setBotCount(clamped)
    setRoster(generateBotRoster(clamped, Date.now()))
  }

  // Fresh local input state at the top of every round (mirrors
  // WavelengthGame.jsx's own spectrum-change reset, guarded the same way).
  useEffect(() => {
    if (gameState.round !== prevRound.current) {
      setClueInput('')
      setClueError('')
      setDialValue(50)
      prevRound.current = gameState.round
    }
  }, [gameState.round])

  // Sound cue: clue locked in → guessing opens (mirrors WavelengthGame.jsx).
  useEffect(() => {
    if (gameState.phase === 'guessing' && prevPhase.current !== 'guessing') sounds.go()
    prevPhase.current = gameState.phase
  }, [gameState.phase])

  // Sound cue: the human's own round result on reveal (silent when the human
  // was the clue-giver — they don't earn round points, same as multiplayer).
  useEffect(() => {
    if (gameState.phase !== 'reveal') return
    const mine = gameState.lastDelta?.human
    if (mine == null) return
    if (mine >= 40) sounds.win()
    else if (mine > 0) sounds.hit(0)
    else sounds.miss()
  }, [gameState.phase, gameState.lastDelta])

  // Sound cue: match clinched.
  useEffect(() => {
    if (gameState.phase === 'matchover') sounds.matchWin()
  }, [gameState.phase])

  // Bot clue-giver: a brief "thinking" beat, then produce {word, target} and
  // dispatch it. Cleared on unmount/round/phase change so a stale timer from
  // an abandoned round can never fire into a later one.
  useEffect(() => {
    if (gameState.phase !== 'clue' || !gameState.clueGiver || gameState.clueGiver === 'human') return
    const bot = rosterById[gameState.clueGiver]
    const pair = getSpectrumPair(gameState.spectrumIndex)
    const usedWords = gameState.usedClueWords[gameState.spectrumIndex] || []
    const timer = setTimeout(() => {
      const picked = pickBotClue(pair, usedWords, bot?.persona) || { word: '???', target: randomTarget() }
      dispatch({ type: 'BOT_CLUE_READY', clueWord: picked.word, target: picked.target })
    }, 900 + Math.random() * 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosterById/usedClueWords are read once when the timer is armed; re-arming only on phase/clueGiver/spectrumIndex change is intentional
  }, [gameState.phase, gameState.clueGiver, gameState.spectrumIndex])

  // Bot guessers: staggered dispatches. A stale timer that fires after the
  // round has already moved on is a harmless no-op — SUBMIT_GUESS's phase
  // guard rejects it.
  useEffect(() => {
    if (gameState.phase !== 'guessing') return
    const botGuesserIds = gameState.order.filter(id => id !== gameState.clueGiver && id !== 'human')
    const timers = botGuesserIds.map((id, i) => setTimeout(() => {
      const persona = rosterById[id]?.persona
      dispatch({ type: 'SUBMIT_GUESS', playerId: id, guess: pickBotGuess(gameState.target, persona) })
    }, 600 + i * 450 + Math.random() * 300))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target/clueGiver/order are the values current when guessing opened; re-arming only on phase/round change is intentional
  }, [gameState.phase, gameState.round])

  const handleStart = () => {
    const players = buildPlayers(roster)
    const order = seatOrder(players)
    dispatch({ type: 'START_MATCH', players, order })
  }

  const handleSubmitClue = () => {
    if (gameState.phase !== 'clue' || gameState.clueGiver !== 'human') return
    const clue = clueInput.trim()
    if (!clue) { setClueError('TYPE A CLUE'); return }
    if (/\s/.test(clue)) { setClueError('ONE WORD ONLY'); return }
    if (clue.length > 24) { setClueError('TOO LONG'); return }
    sounds.move('X')
    dispatch({ type: 'SUBMIT_HUMAN_CLUE', clueWord: clue.toUpperCase() })
  }

  const handleSubmitGuess = () => {
    if (gameState.phase !== 'guessing' || gameState.clueGiver === 'human') return
    if (gameState.guesses.human != null) return
    sounds.move('O')
    dispatch({ type: 'SUBMIT_GUESS', playerId: 'human', guess: dialValue })
  }

  const handleNextRound = () => {
    if (gameState.phase !== 'reveal') return
    dispatch({ type: 'NEXT_ROUND' })
  }

  const handlePlayAgain = () => {
    setRoster(generateBotRoster(botCount, Date.now()))
    dispatch({ type: 'RESET_TO_SETUP' })
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------
  if (gameState.phase === 'setup') {
    return (
      <PartyBotSetup
        title="WAVELENGTH"
        blurb="One clue-giver, everyone else guesses where on the dial it lands."
        botCount={botCount}
        onBotCount={handleBotCountChange}
        roster={roster}
        onStart={handleStart}
        minBots={MIN_BOTS}
        maxBots={MAX_BOTS}
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Match over
  // ---------------------------------------------------------------------------
  if (gameState.phase === 'matchover') {
    const iWon = gameState.winner === 'human'
    const winnerName = (gameState.players[gameState.winner]?.name || '???').toUpperCase()
    return (
      <div className="space-y-4 text-center">
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
        <p className={cn('font-pixel text-base', iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
          {iWon ? 'YOU WIN!' : `${winnerName} WINS`}
        </p>
        <Scoreboard players={gameState.players} scores={gameState.scores} mySeat="human" clueGiver={null} />
        <button
          onClick={handlePlayAgain}
          className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
        >
          PLAY AGAIN
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Active round
  // ---------------------------------------------------------------------------
  const pair = getSpectrumPair(gameState.spectrumIndex)
  const isClueGiver = gameState.clueGiver === 'human'
  const clueGiverName = (gameState.players[gameState.clueGiver]?.name || '???').toUpperCase()
  const guesserIds = gameState.order.filter(id => id !== gameState.clueGiver)
  const isReveal = gameState.phase === 'reveal'
  const hasGuessed = gameState.guesses.human != null
  // Shown to the human whenever they're the clue-giver (they set it, so there's
  // nothing to hide from themselves) or once the round reveals to everyone.
  const visibleTarget = (isReveal || isClueGiver) ? gameState.target : null
  // Up to 7 guessers can share a dial (8-player match) — stack markers that
  // land close together and reserve enough headroom for however deep the
  // tallest stack goes, so a clustered reveal never overlaps the text above it.
  const revealMarkers = isReveal
    ? layoutMarkers(guesserIds.map(id => ({ id, guess: gameState.guesses[id] })).filter(m => m.guess != null))
    : []
  const revealMaxLevel = revealMarkers.reduce((m, entry) => Math.max(m, entry.level), 0)

  return (
    <div className="space-y-4">
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">WAVELENGTH · SOLO</p>

      <Scoreboard
        players={gameState.players}
        scores={gameState.scores}
        mySeat="human"
        clueGiver={gameState.clueGiver}
        highlight={isReveal ? gameState.lastDelta : null}
      />

      <div className="text-center space-y-1">
        <p className="font-pixel text-[8px] text-retro-dim">
          {isClueGiver ? 'YOU ARE THE CLUE-GIVER' : `${clueGiverName}'S CLUE`}
        </p>
        {gameState.phase !== 'clue' && (
          <p className="font-pixel text-base text-retro-cta text-glow-cta tracking-widest break-words">
            {gameState.clueWord || '…'}
          </p>
        )}
      </div>

      {/* CLUE PHASE --------------------------------------------------------- */}
      {gameState.phase === 'clue' && (
        isClueGiver ? (
          <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
            <p className="font-pixel text-[9px] text-retro-cta text-center">THE TARGET IS SET — GIVE A CLUE</p>
            <Dial value={50} onChange={() => {}} disabled pair={pair} target={visibleTarget} />
            <p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
              GIVE A ONE-WORD CLUE THAT POINTS{'\n'}WHERE YOU WANT THEM TO GUESS
            </p>
            <input
              type="text"
              value={clueInput}
              maxLength={24}
              onChange={e => { setClueInput(e.target.value); setClueError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitClue()}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="ONE WORD…"
              className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1 uppercase"
            />
            {clueError && <p className="font-pixel text-[8px] text-retro-p2 text-center">{clueError}</p>}
            <button
              onClick={handleSubmitClue}
              className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              LOCK CLUE
            </button>
          </div>
        ) : (
          <div className="text-center space-y-3 py-6">
            <div className="flex justify-center"><PixelDots tone="p2" size="lg" glow /></div>
            <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 leading-relaxed">
              {clueGiverName} IS THINKING…
            </p>
          </div>
        )
      )}

      {/* GUESSING PHASE ------------------------------------------------------ */}
      {gameState.phase === 'guessing' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
          <Dial
            value={isClueGiver ? 50 : dialValue}
            onChange={setDialValue}
            disabled={isClueGiver || hasGuessed}
            pair={pair}
            target={visibleTarget}
          />
          {isClueGiver ? (
            <p className="font-pixel text-[9px] text-retro-dim text-center leading-relaxed">
              WAITING FOR GUESSES…{'\n'}{guesserIds.filter(id => gameState.guesses[id] != null).length}/{guesserIds.length} IN
            </p>
          ) : hasGuessed ? (
            <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center arcade-blink">
              GUESS LOCKED ✓ — WAITING…
            </p>
          ) : (
            <button
              onClick={handleSubmitGuess}
              className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              LOCK IN
            </button>
          )}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 font-pixel text-[8px]">
            {guesserIds.map(id => {
              const locked = gameState.guesses[id] != null
              return (
                <span key={id} className={locked ? 'text-retro-win' : 'text-retro-dim'}>
                  {(gameState.players[id]?.name || '???').toUpperCase()} {locked ? '✓' : '…'}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* REVEAL PHASE ---------------------------------------------------------- */}
      {isReveal && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
          <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center">
            TARGET WAS {clampGuess(visibleTarget)}
          </p>
          <div className="relative" style={{ marginTop: `${revealMaxLevel * 15}px` }}>
            <Dial value={50} onChange={() => {}} disabled pair={pair} target={visibleTarget} />
            <div className="relative h-0">
              {revealMarkers.map(({ id, guess, level }) => {
                const mine = id === 'human'
                const p = gameState.players[id]
                return (
                  <div
                    key={id}
                    className="absolute -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${clampGuess(guess)}%`, top: `-${36 + level * 15}px` }}
                  >
                    <span className={cn('font-pixel text-[7px] whitespace-nowrap', mine ? 'text-retro-cta' : 'text-retro-dim')}>
                      {(p?.name || '?').toUpperCase().slice(0, 4)}
                    </span>
                    <span className={cn('text-[10px]', mine ? 'text-retro-cta' : 'text-retro-p1')}>▾</span>
                  </div>
                )
              })}
            </div>
          </div>
          <button
            onClick={handleNextRound}
            className="w-full py-2 mt-2 border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
          >
            NEXT ROUND
          </button>
        </div>
      )}
    </div>
  )
}
