import { useEffect, useRef, useState } from 'react'
import AnagramTiles from '../components/AnagramTiles'
import WordFeedback from '../components/WordFeedback'
import RoundTimer from '../components/RoundTimer'
import useGameKeys from '../hooks/useGameKeys'
import {
  seededRack, applyFoundWord, canBuildWord, normalizeWord, scoreWord, scoreFound,
  rememberRack, missedWords,
  ROUND_MS, COUNTDOWN_MS, MIN_WORD_LENGTH, RACK_SIZE,
} from '../lib/anagramsLogic'
import { ANAGRAM_RACK_WORDS, ANAGRAM_VALID_WORDS } from '../lib/decks/anagrams'
import { RunOver } from '../components/memory/RunParts'
import { readSoloBest, recordSoloBest } from '../lib/soloBest'
import { sounds } from '../lib/sounds'

// Solo ANAGRAMS on anagramsLogic's own rules: a seeded rack from the deck (no
// repeats within a visit), a 3-2-1, then 90 seconds to find words. Words are
// validated as they go in; the score is the rack's points (3 letters = 1 up to
// 7 letters = 11, +5 for using all seven), and the best is kept on the device.

const TICK_MS = 200
const VALID_WORDS = new Set(ANAGRAM_VALID_WORDS)

const randSeed = () => `solo:${Math.floor(Math.random() * 2_147_483_647)}`

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

// A fresh rack (starting after the 3-2-1).
function dealRound(usedRacks, at) {
  const rack = seededRack({ rackWords: ANAGRAM_RACK_WORDS, validWords: ANAGRAM_VALID_WORDS, seed: randSeed(), used: usedRacks })
  const startedAt = at + COUNTDOWN_MS
  return {
    rack, startedAt, endsAt: startedAt + ROUND_MS, found: {}, over: false,
    usedRacks: rememberRack(usedRacks, rack),
  }
}

export default function AnagramsSolo() {
  const [round, setRound] = useState(null)
  const [best, setBest] = useState(() => readSoloBest('anagrams'))
  const [isNewBest, setIsNewBest] = useState(false)
  const [rack, setRack] = useState([]) // display order (shuffle)
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const selectedRef = useRef([])
  const [feedback, setFeedback] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const live = !!round && !round.over
  const counting = live && now < round.startedAt
  const playing = live && now >= round.startedAt && now < round.endsAt

  const roundRef = useRef(null)
  useEffect(() => { roundRef.current = round })

  const endRound = () => {
    const r = roundRef.current
    if (!r || r.over) return
    const points = scoreFound(r.found)
    const beat = recordSoloBest('anagrams', points)
    setIsNewBest(beat)
    if (beat) { setBest(points); sounds.win() } else sounds.lose()
    setRound({ ...r, over: true })
  }

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= round.endsAt) endRound()
    }, TICK_MS)
    return () => clearInterval(id)
  }, [live, round?.endsAt])

  const clearSelection = () => {
    selectedRef.current = []
    setSelectedIndexes([])
  }

  const start = () => {
    const at = Date.now()
    const next = dealRound(round?.usedRacks || [], at)
    setRound(next)
    setRack(next.rack)
    setIsNewBest(false)
    clearSelection()
    setFeedback(null)
    setNow(at)
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
    if (round.found[word]) { setMessage('duplicate', word); return }
    if (!canBuildWord(word, round.rack)) { sounds.miss(); setMessage('letters', word); return }
    if (word.length < MIN_WORD_LENGTH) { sounds.miss(); setMessage('short', word); return }
    const found = word.length <= RACK_SIZE && VALID_WORDS.has(word)
      ? applyFoundWord(round.found, word, round.rack, ANAGRAM_VALID_WORDS, Date.now())
      : null
    if (!found) { sounds.miss(); setMessage('notword', word); return }
    setRound(r => ({ ...r, found }))
    setMessage('valid', word, scoreWord(word))
    sounds.hit(Object.keys(found).length)
    clearSelection()
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

  if (!round) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
          <p>● MAKE WORDS FROM {RACK_SIZE} LETTERS · {MIN_WORD_LENGTH}+ LETTERS EACH</p>
          <p>✎ LONGER WORDS SCORE MORE · ALL {RACK_SIZE} = BONUS</p>
          <p>⏱ {ROUND_MS / 1000} SECONDS · BEAT YOUR BEST</p>
        </div>
        {best > 0 && <p className="font-pixel text-[9px] text-retro-dim">BEST {best}</p>}
        <button
          type="button"
          onClick={start}
          className="px-6 py-2 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta press"
        >
          START
        </button>
      </div>
    )
  }

  if (counting) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
        <p className="font-pixel text-7xl text-retro-win text-glow-win">{Math.ceil((round.startedAt - now) / 1000)}</p>
      </div>
    )
  }

  const myWords = wordsOf(round.found)
  const points = scoreFound(round.found)

  if (round.over) {
    const missed = missedWords(round.rack, ANAGRAM_VALID_WORDS, myWords)
    return (
      <div className="space-y-3">
        <RunOver
          type="anagrams"
          result="TIME'S UP"
          score={points}
          unit={points === 1 ? 'POINT' : 'POINTS'}
          isNewBest={isNewBest}
          onRestart={start}
        />
        <p className="text-center font-mono text-[10px] text-retro-dim">
          {myWords.length} WORD{myWords.length === 1 ? '' : 'S'} · BEST {best} · Rack: {round.rack.join('')}
        </p>
        <FoundWords words={myWords} title={`YOUR WORDS · ${points}`} />
        <section className="rounded border border-retro-cta/50 bg-retro-tint-cta/30 p-3">
          <h3 className="font-pixel text-[9px] tracking-widest text-retro-cta">WORDS YOU MISSED</h3>
          <p className="mt-1 font-mono text-[10px] text-retro-dim">Everyday words from this rack you didn’t find.</p>
          <p className="mt-2 font-pixel text-xs uppercase tracking-wider text-retro-text">
            {missed.length ? missed.map((word, i) => (
              <span key={word} className="mr-2 inline-block">{i + 1}. {word} <span className="text-retro-win">+{scoreWord(word)}</span></span>
            )) : 'NONE — EVERY WORD WAS FOUND'}
          </p>
        </section>
      </div>
    )
  }

  const shown = feedbackFor(feedback)
  const currentWord = selectedIndexes.map(i => rack[i]).join('')

  return (
    <div className="space-y-3">
      <RoundTimer endsAt={round.endsAt} now={now} totalMs={ROUND_MS} label="TIME LEFT" />
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
            className="min-h-11 flex-1 rounded bg-retro-cta px-4 py-3 font-pixel text-[10px] text-retro-bg shadow-neon-cta transition press disabled:opacity-50"
          >
            ENTER WORD
          </button>
          <button
            type="button"
            onClick={endRound}
            disabled={!playing}
            className="min-h-11 rounded border-2 border-retro-border px-4 py-3 font-pixel text-[10px] text-retro-dim transition-colors hover:border-retro-p2 hover:text-retro-p2 disabled:opacity-50"
          >
            FINISH EARLY
          </button>
        </div>
        <WordFeedback className="mt-3" message={shown.message} tone={shown.tone} id={feedback?.id} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-retro-border bg-retro-deep/50 px-3 py-2 font-pixel text-[9px]">
        <span className="text-retro-dim">POINTS</span>
        <span className="text-retro-p1">{points} · {myWords.length} WORD{myWords.length === 1 ? '' : 'S'}</span>
        <span className="text-retro-dim">BEST {best}</span>
      </div>
      <FoundWords words={myWords} title="YOUR WORDS" />
    </div>
  )
}
