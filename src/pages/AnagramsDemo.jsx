import { useEffect, useRef, useState } from 'react'
import AnagramTiles from '../components/AnagramTiles'
import WordFeedback from '../components/WordFeedback'
import MatchScoreRail from '../components/MatchScoreRail'
import RoundTimer from '../components/RoundTimer'
import useGameKeys from '../hooks/useGameKeys'
import {
  seededRack, getSolutions, applyFoundWord, canBuildWord, normalizeWord, scoreWord, scoreFound,
  resolveRound, rememberRack, missedWords,
  ROUND_MS, COUNTDOWN_MS, MATCH_TARGET, MIN_WORD_LENGTH, RACK_SIZE,
} from '../lib/anagramsLogic'
import { ANAGRAM_RACK_WORDS, ANAGRAM_VALID_WORDS } from '../lib/decks/anagrams'
import { planBotFinds, botFindsBy, botFoundMap, ANAGRAMS_FIND_GAP_MS } from '../lib/wordBotsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo ANAGRAMS vs the CPU, fully local, on anagramsLogic's own rules: a
// seeded rack from the deck (no repeats within a visit), a 3-2-1 then 90 s,
// words re-validated and ranked by resolveRound (points, then words), first
// to 2. The CPU finds real rack solutions at a human pace (wordBotsLogic).
// X = you, O = the CPU.

const TICK_MS = 200
const VALID_WORDS = new Set(ANAGRAM_VALID_WORDS)

const randSeed = () => `demo:${Math.floor(Math.random() * 2_147_483_647)}`

function playerName() {
  try { return localStorage.getItem('playerName') || 'YOU' } catch { return 'YOU' }
}

function shuffled(values) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function feedbackFor(feedback) {
  if (!feedback) return { message: '', tone: 'info' }
  const word = String(feedback.word ?? '').toUpperCase()
  const withWord = (reason) => (word ? `${word} — ${reason}` : reason)
  switch (feedback.kind) {
    case 'valid': return { message: `${word} · +${feedback.points} POINT${feedback.points === 1 ? '' : 'S'}`, tone: 'ok' }
    case 'duplicate': return { message: withWord('ALREADY FOUND'), tone: 'info' }
    case 'letters': return { message: withWord('USE ONLY RACK LETTERS'), tone: 'bad' }
    case 'short': return { message: withWord(`TOO SHORT — ${MIN_WORD_LENGTH}+ LETTERS`), tone: 'bad' }
    default: return { message: withWord('NOT A WORD'), tone: 'bad' }
  }
}

const wordsOf = (found) => Object.entries(found || {})
  .sort(([, a], [, b]) => (a.at || 0) - (b.at || 0))
  .map(([word]) => word)

function FoundWords({ words, title }) {
  return (
    <section className="rounded border border-retro-border bg-retro-card p-3" aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-pixel text-[9px] tracking-widest text-retro-text">{title}</h3>
        <span className="font-mono text-[10px] text-retro-dim">{words.length}</span>
      </div>
      {words.length === 0 ? (
        <p className="py-3 text-center font-pixel text-[9px] text-retro-dim">NO WORDS YET</p>
      ) : (
        <ul className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto">
          {words.map(word => (
            <li key={word} className="flex items-center justify-between rounded border border-retro-structure/70 bg-retro-deep/60 px-2 py-1.5 font-mono text-xs uppercase text-retro-text">
              <span>{word}</span>
              <span className="ml-1 font-pixel text-[9px] text-retro-win">+{scoreWord(word)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// A fresh rack round (starting after the 3-2-1) plus the CPU's plan for it.
function dealRound(prevRound, at) {
  const used = prevRound?.usedRacks || []
  const rack = seededRack({ rackWords: ANAGRAM_RACK_WORDS, validWords: ANAGRAM_VALID_WORDS, seed: randSeed(), used })
  const solutions = getSolutions(rack, ANAGRAM_VALID_WORDS)
  const startedAt = at + COUNTDOWN_MS
  return {
    round: {
      phase: 'playing', roundNum: (prevRound?.roundNum || 0) + 1, rack,
      startedAt, endsAt: startedAt + ROUND_MS,
      foundX: {}, foundO: {}, doneX: false, doneO: false, result: null,
      usedRacks: rememberRack(used, rack),
    },
    plan: planBotFinds(solutions, { durationMs: ROUND_MS, gapMs: ANAGRAMS_FIND_GAP_MS }),
  }
}

// Close the round once due: the CPU's finds up to `now` (all of them when the
// round is forced over early) go in as foundO, then resolveRound scores it.
function settle(state, now, { early = false } = {}) {
  const { game, plan } = state
  const round = game.round
  if (game.status !== 'playing' || round?.phase !== 'playing') return state
  const elapsedMs = early ? ROUND_MS : Math.min(now, round.endsAt) - round.startedAt
  const foundO = botFoundMap(plan, { startedAt: round.startedAt, elapsedMs, score: scoreWord })
  const next = { ...game, round: { ...round, foundO, ...(early ? { doneX: true, doneO: true } : {}) } }
  const resolved = resolveRound(next, now, VALID_WORDS)
  return resolved ? { ...state, game: resolved } : state
}

export default function AnagramsDemo() {
  const [names] = useState(() => ({ X: { name: playerName() }, O: { name: 'CPU' } }))
  const [state, setState] = useState(null) // { game, plan }
  const [rack, setRack] = useState([]) // display order (shuffle)
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const selectedRef = useRef([])
  const [feedback, setFeedback] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const game = state?.game
  const round = game?.round
  const live = round?.phase === 'playing' && game.status === 'playing'
  const counting = live && now < round.startedAt
  const playing = live && now >= round.startedAt && now < round.endsAt

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      setState(s => settle(s, t))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [live])

  const result = round?.phase === 'reveal' ? round.result : null
  useEffect(() => {
    if (!result) return
    if (game.status === 'finished') { if (game.winner === 'X') sounds.matchWin(); else sounds.lose() }
    else if (result.winner === 'X') sounds.win()
    else if (result.winner === 'O') sounds.lose()
    else sounds.draw()
    // one sound per revealed rack
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const clearSelection = () => {
    selectedRef.current = []
    setSelectedIndexes([])
  }

  const begin = (nextGame, dealt) => {
    const at = Date.now()
    setState({ game: { ...nextGame, round: dealt.round }, plan: dealt.plan })
    setRack(dealt.round.rack)
    clearSelection()
    setFeedback(null)
    setNow(at)
  }

  const startMatch = () => {
    const at = Date.now()
    // A new match restarts the rack count but keeps the no-repeat history.
    begin({ status: 'playing', scores: { X: 0, O: 0 }, winner: null }, dealRound({ usedRacks: round?.usedRacks, roundNum: 0 }, at))
  }

  const nextRack = () => {
    begin(game, dealRound(round, Date.now()))
  }

  const pickLetter = (index) => {
    if (!playing || selectedRef.current.includes(index)) return
    const next = [...selectedRef.current, index]
    selectedRef.current = next
    setSelectedIndexes(next)
  }

  const removeLetter = (position) => {
    const next = position === 'all' ? [] : selectedRef.current.filter((_, i) => i !== position)
    selectedRef.current = next
    setSelectedIndexes(next)
  }

  const setMessage = (kind, word, points = 0) => setFeedback(f => ({ kind, word, points, id: (f?.id || 0) + 1 }))

  const submitWord = (raw) => {
    const word = normalizeWord(raw ?? selectedRef.current.map(i => rack[i]).join(''))
    if (!playing || !word) return
    if (round.foundX[word]) { setMessage('duplicate', word); return }
    if (!canBuildWord(word, round.rack)) { sounds.miss(); setMessage('letters', word); return }
    if (word.length < MIN_WORD_LENGTH) { sounds.miss(); setMessage('short', word); return }
    const at = Date.now()
    const foundX = word.length <= RACK_SIZE && VALID_WORDS.has(word)
      ? applyFoundWord(round.foundX, word, round.rack, ANAGRAM_VALID_WORDS, at)
      : null
    if (!foundX) { sounds.miss(); setMessage('notword', word); return }
    setState(s => ({ ...s, game: { ...s.game, round: { ...s.game.round, foundX } } }))
    setMessage('valid', word, scoreWord(word))
    sounds.hit(Object.keys(foundX).length)
    clearSelection()
  }

  // The CPU's whole 90 seconds still count when you finish early.
  const finishEarly = () => {
    if (!playing) return
    const t = Date.now()
    setState(s => settle(s, t, { early: true }))
    setNow(t)
  }

  // Physical keyboard: letters pick rack tiles; useGameKeys skips text fields
  // and Cmd/Ctrl/Alt chords.
  useGameKeys((event) => {
    if (event.key === 'Enter') {
      if (!selectedRef.current.length) return false
      submitWord()
      return true
    }
    if (event.key === 'Backspace') {
      if (!selectedRef.current.length) return false
      removeLetter(selectedRef.current.length - 1)
      return true
    }
    if (!/^[a-zA-Z]$/.test(event.key)) return false
    const letter = event.key.toUpperCase()
    const used = new Set(selectedRef.current)
    const index = rack.findIndex((value, i) => value === letter && !used.has(i))
    if (index < 0) {
      setMessage('letters', selectedRef.current.map(i => rack[i]).join('') + letter)
      return true
    }
    pickLetter(index)
    return true
  }, { enabled: playing })

  const rail = game && (
    <MatchScoreRail
      game={{ scores: game.scores, players: names }}
      mySymbol="X"
      matchTarget={MATCH_TARGET}
      roundLabel={`RACK ${round.roundNum}`}
    />
  )

  if (!state) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
          <p>● MAKE WORDS FROM {RACK_SIZE} LETTERS · {MIN_WORD_LENGTH}+ LETTERS EACH</p>
          <p>✎ LONGER WORDS SCORE MORE · ALL {RACK_SIZE} = BONUS</p>
          <p>⏱ {ROUND_MS / 1000} S PER RACK · MOST POINTS WINS · FIRST TO {MATCH_TARGET}</p>
        </div>
        <button
          type="button"
          onClick={startMatch}
          className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          START
        </button>
      </div>
    )
  }

  if (counting) {
    return (
      <div className="space-y-3">
        {rail}
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
          <p className="font-pixel text-7xl text-retro-win text-glow-win">{Math.ceil((round.startedAt - now) / 1000)}</p>
        </div>
      </div>
    )
  }

  if (round.phase === 'reveal') {
    const r = round.result
    const myWords = wordsOf(round.foundX)
    const botWords = wordsOf(round.foundO)
    const missed = missedWords(round.rack, ANAGRAM_VALID_WORDS, myWords)
    const headline = r.winner === 'draw' ? 'RACK DRAWN' : r.winner === 'X' ? 'YOU WIN THE RACK' : 'THE CPU WINS THE RACK'
    return (
      <div className="space-y-3">
        {rail}
        <section className="rounded border-2 border-retro-cta bg-retro-card p-4 text-center shadow-neon-cta" role="status" aria-live="polite">
          <p className="font-pixel text-[9px] tracking-[0.25em] text-retro-dim">RACK {round.roundNum} RESULT</p>
          <h2 className={cn('mt-2 font-pixel text-base tracking-widest', r.winner === 'X' ? 'text-retro-win text-glow-win' : r.winner === 'draw' ? 'text-retro-text' : 'text-retro-p2 text-glow-p2')}>
            {headline}
          </h2>
          <p className="mt-3 font-mono text-sm text-retro-p1">YOU: {r.scoreX} POINT{r.scoreX === 1 ? '' : 'S'} · {r.wordsX} WORD{r.wordsX === 1 ? '' : 'S'}</p>
          <p className="font-mono text-sm text-retro-p2">CPU: {r.scoreO} POINT{r.scoreO === 1 ? '' : 'S'} · {r.wordsO} WORD{r.wordsO === 1 ? '' : 'S'}</p>
          {r.decidedBy === 'words' && <p className="mt-2 font-pixel text-[9px] text-retro-cta">TIED ON POINTS — MORE WORDS WINS</p>}
          {r.decidedBy === 'draw' && <p className="mt-2 font-pixel text-[9px] text-retro-dim">SAME POINTS AND SAME WORD COUNT</p>}
          <p className="mt-2 font-mono text-[10px] text-retro-dim">Rack: {round.rack.join('')}</p>
        </section>
        <div className="grid grid-cols-2 gap-2">
          <FoundWords words={myWords} title={`YOU · ${scoreFound(round.foundX)}`} />
          <FoundWords words={botWords} title={`CPU · ${scoreFound(round.foundO)}`} />
        </div>
        <section className="rounded border border-retro-cta/50 bg-retro-tint-cta/30 p-3">
          <h3 className="font-pixel text-[9px] tracking-widest text-retro-cta">WORDS YOU MISSED</h3>
          <p className="mt-1 font-mono text-[10px] text-retro-dim">Everyday words from this rack you didn’t find.</p>
          <p className="mt-2 font-pixel text-xs uppercase tracking-wider text-retro-text">
            {missed.length ? missed.map((word, i) => (
              <span key={word} className="mr-2 inline-block">{i + 1}. {word} <span className="text-retro-win">+{scoreWord(word)}</span></span>
            )) : 'NONE — EVERY WORD WAS FOUND'}
          </p>
        </section>
        {game.status === 'finished' ? (
          <div className="text-center space-y-2">
            <p className={cn('font-pixel text-sm', game.winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-p2')}>
              {game.winner === 'X' ? 'YOU WIN THE MATCH!' : 'THE CPU WINS THE MATCH'}
            </p>
            <button
              type="button"
              onClick={startMatch}
              className="px-5 py-2 font-pixel text-[10px] bg-retro-cta text-retro-bg rounded hover:shadow-neon-cta active:scale-95"
            >
              NEW MATCH
            </button>
          </div>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={nextRack}
              className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
            >
              NEXT RACK
            </button>
          </div>
        )}
      </div>
    )
  }

  const myWords = wordsOf(round.foundX)
  const botWords = botFindsBy(state.plan, now - round.startedAt)
  const botPoints = botWords.reduce((sum, w) => sum + scoreWord(w), 0)
  const shown = feedbackFor(feedback)
  const currentWord = selectedIndexes.map(i => rack[i]).join('')

  return (
    <div className="space-y-3">
      {rail}
      <RoundTimer endsAt={round.endsAt} now={now} totalMs={ROUND_MS} label={`RACK ${round.roundNum}`} />
      <div className="rounded border-2 border-retro-cta/60 bg-retro-card p-3">
        <AnagramTiles
          rack={rack}
          selectedIndexes={selectedIndexes}
          onPick={pickLetter}
          onRemove={removeLetter}
          onShuffle={() => { clearSelection(); setRack(current => shuffled(current)) }}
          disabled={!playing}
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => submitWord()}
            disabled={!playing || !currentWord}
            className="min-h-11 flex-1 rounded bg-retro-cta px-4 py-3 font-pixel text-[10px] text-retro-bg shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            ENTER WORD
          </button>
          <button
            type="button"
            onClick={finishEarly}
            disabled={!playing}
            className="min-h-11 rounded border-2 border-retro-border px-4 py-3 font-pixel text-[10px] text-retro-dim transition-colors hover:border-retro-p2 hover:text-retro-p2 disabled:opacity-50"
          >
            FINISH EARLY
          </button>
        </div>
        <WordFeedback className="mt-3" message={shown.message} tone={shown.tone} id={feedback?.id} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-retro-border bg-retro-deep/50 px-3 py-2 font-pixel text-[9px]">
        <span className="text-retro-dim">RACK POINTS</span>
        <span className="text-retro-p1">YOU {scoreFound(round.foundX)} · {myWords.length} WORD{myWords.length === 1 ? '' : 'S'}</span>
        <span className="text-retro-p2">CPU {botPoints} · {botWords.length} WORD{botWords.length === 1 ? '' : 'S'}</span>
      </div>
      <FoundWords words={myWords} title="YOUR WORDS" />
    </div>
  )
}
