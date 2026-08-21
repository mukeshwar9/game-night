import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  HERD_TARGET, ANSWER_MS,
  normalizeAnswer, groupAnswers, scoreGroups, nextCow, getMatchWinner,
  seededShuffle, allAnswered,
} from '../lib/herdLogic'
import { HERD_PROMPTS } from '../lib/decks/herd'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo HERD MIND vs four crowd-pleasing bots. Fully local — no Firebase.

const BOTS = [
  { id: 'b1', name: 'RUSTY' },
  { id: 'b2', name: 'PIXEL' },
  { id: 'b3', name: 'BYTE' },
  { id: 'b4', name: 'GLITCH' },
]
const ME = 'me'
const SEATS = [{ id: ME, name: 'YOU' }, ...BOTS]
const ELIGIBLE = SEATS.map(s => s.id)
const NAME = Object.fromEntries(SEATS.map(s => [s.id, s.name]))

// Fixed generic pool — bots converge on 3 round-favored entries so herds form.
const BOT_POOL = [
  'pizza', 'coffee', 'dog', 'cat', 'sleep', 'phone', 'money', 'music',
  'chocolate', 'beach', 'netflix', 'gym', 'beer', 'chess', 'travel', 'napping',
]

const randSeed = () => Math.floor(Math.random() * 2147483647)
const zeroScores = () => Object.fromEntries(ELIGIBLE.map(id => [id, 0]))

export default function HerdDemo() {
  const [deckSeed, setDeckSeed] = useState(randSeed)
  const deck = useMemo(() => seededShuffle(HERD_PROMPTS, deckSeed), [deckSeed])
  const [promptIndex, setPromptIndex] = useState(0)
  const [phase, setPhase] = useState('answering') // 'answering' | 'reveal' | 'winner'
  const [answers, setAnswers] = useState({})
  const [input, setInput] = useState('')
  const [scores, setScores] = useState(zeroScores)
  const [cow, setCow] = useState(null)
  const [reveal, setReveal] = useState(null) // { groups, pointUids, transferred }
  const [matchWinner, setMatchWinner] = useState(null)
  const [remaining, setRemaining] = useState(ANSWER_MS)

  const answersRef = useRef({})
  const cowRef = useRef(null)
  const scoresRef = useRef(zeroScores())
  const resolvedRef = useRef(false)
  const timersRef = useRef([])

  const clearBotTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const resolve = useCallback(() => {
    if (resolvedRef.current) return
    resolvedRef.current = true
    clearBotTimers()
    const all = answersRef.current
    const groups = groupAnswers(all)
    const { pointUids } = scoreGroups(groups)
    const answeredUids = ELIGIBLE.filter(id => normalizeAnswer(all[id] ?? ''))
    const { cow: nextCowUid, transferred } = nextCow(groups, cowRef.current, answeredUids)
    const nextScores = { ...scoresRef.current }
    for (const uid of pointUids) nextScores[uid] = (nextScores[uid] || 0) + 1
    scoresRef.current = nextScores
    cowRef.current = nextCowUid
    setScores(nextScores)
    setCow(nextCowUid)
    setReveal({ groups, pointUids, transferred })
    setRemaining(0)
    setPhase('reveal')
    if (pointUids.includes(ME)) sounds.win()
    else sounds.miss()
    if (transferred && nextCowUid === ME) sounds.bust()
    setMatchWinner(getMatchWinner(nextScores, nextCowUid, HERD_TARGET))
  }, [])

  const maybeResolve = useCallback(() => {
    if (!resolvedRef.current && allAnswered(ELIGIBLE, answersRef.current)) resolve()
  }, [resolve])

  // Bots converge: 60% one of the 3 round-favored pool entries (rotated by
  // promptIndex), else uniform — staggered 1–6s submissions.
  const scheduleBots = useCallback((roundIdx) => {
    clearBotTimers()
    const off = ((roundIdx % BOT_POOL.length) + BOT_POOL.length) % BOT_POOL.length
    const top3 = [
      BOT_POOL[off],
      BOT_POOL[(off + 1) % BOT_POOL.length],
      BOT_POOL[(off + 2) % BOT_POOL.length],
    ]
    for (const bot of BOTS) {
      const answer = Math.random() < 0.6
        ? top3[Math.floor(Math.random() * top3.length)]
        : BOT_POOL[Math.floor(Math.random() * BOT_POOL.length)]
      const t = setTimeout(() => {
        if (resolvedRef.current) return
        answersRef.current = { ...answersRef.current, [bot.id]: answer }
        setAnswers(answersRef.current)
        maybeResolve()
      }, 1000 + Math.random() * 5000)
      timersRef.current.push(t)
    }
  }, [maybeResolve])

  // Per-round clock + bot submissions. Auto-resolves early once everyone is in.
  useEffect(() => {
    if (phase !== 'answering') return undefined
    scheduleBots(promptIndex)
    const startedAt = Date.now()
    const id = setInterval(() => {
      const left = Math.max(0, ANSWER_MS - (Date.now() - startedAt))
      setRemaining(left)
      if (left <= 0) resolve()
    }, 200)
    return () => {
      clearInterval(id)
      clearBotTimers()
    }
  }, [phase, promptIndex, scheduleBots, resolve])

  useEffect(() => () => clearBotTimers(), [])

  const myAnswered = Boolean(normalizeAnswer(answers[ME] ?? ''))

  const submit = () => {
    const text = input.trim()
    if (!text || resolvedRef.current || myAnswered) return
    answersRef.current = { ...answersRef.current, [ME]: text }
    setAnswers(answersRef.current)
    sounds.move('X')
    setInput('')
    maybeResolve()
  }

  const startRound = (idx) => {
    answersRef.current = {}
    resolvedRef.current = false
    setAnswers({})
    setInput('')
    setReveal(null)
    setRemaining(ANSWER_MS)
    setPromptIndex(idx)
    setPhase('answering')
  }

  const nextRound = () => startRound(promptIndex + 1)

  const playAgain = () => {
    scoresRef.current = zeroScores()
    cowRef.current = null
    setScores(zeroScores())
    setCow(null)
    setMatchWinner(null)
    setDeckSeed(randSeed())
    startRound(0)
  }

  const prompt = deck[promptIndex % deck.length]
  const secs = Math.ceil(remaining / 1000)
  const pct = Math.max(0, Math.min(100, (remaining / ANSWER_MS) * 100))
  const urgent = remaining <= 10000

  const seatChip = (id) => (
    <div
      key={id}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded border font-pixel text-[9px]',
        cow === id
          ? 'border-retro-p2 text-retro-p2 shadow-neon-p2 bg-retro-tint-p2'
          : id === ME
            ? 'border-retro-p1 text-retro-p1'
            : 'border-retro-border text-retro-dim',
      )}
    >
      {cow === id && <span>🐄</span>}
      <span>{NAME[id]}</span>
      <span className="text-retro-text">{scores[id] ?? 0}</span>
      {phase === 'answering' && normalizeAnswer(answers[id] ?? '') && (
        <span className="text-retro-win">✓</span>
      )}
    </div>
  )

  const rail = (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-pixel text-[8px] text-retro-dim">
        <span>SCOREBOARD</span>
        <span>FIRST TO {HERD_TARGET}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{SEATS.map(s => seatChip(s.id))}</div>
    </div>
  )

  if (phase === 'winner') {
    const iWon = matchWinner === ME
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2 py-6">
          <p className={cn('font-pixel text-lg', iWon ? 'text-retro-win text-glow-win' : 'text-retro-p2')}>
            {iWon ? '🎉 YOU WIN!' : `🐄 ${NAME[matchWinner]} WINS!`}
          </p>
          <p className="font-mono text-[10px] text-retro-dim">
            {iWon ? 'THE HERD SPOKE WITH YOUR VOICE' : 'THE HERD MIND WAS NOT WITH YOU'}
          </p>
        </div>
        {rail}
        <div className="flex justify-center">
          <button
            onClick={playAgain}
            className="px-5 py-2 font-pixel text-[10px] border border-retro-cta text-retro-cta rounded hover:shadow-neon-cta active:scale-95"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim">
        <span>🐄 HERD MIND · SOLO VS BOTS</span>
        <span>RND {promptIndex + 1}</span>
      </div>
      {rail}

      <div className="bg-retro-card border border-retro-border rounded p-3 space-y-3">
        <p className="font-pixel text-[13px] text-retro-text leading-relaxed text-center">
          {prompt?.toUpperCase()}
        </p>

        {phase === 'answering' && (
          <>
            <div>
              <div className="h-2 rounded bg-retro-deep overflow-hidden">
                <div
                  className={cn('h-full transition-colors', urgent ? 'bg-retro-danger' : 'bg-retro-cta')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className={cn('font-pixel text-[8px] mt-1 text-right', urgent ? 'text-retro-danger' : 'text-retro-dim')}>
                {secs}s
              </p>
            </div>

            {!myAnswered ? (
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit() }}
                  maxLength={40}
                  placeholder="TYPE YOUR ANSWER…"
                  className="flex-1 min-w-0 bg-retro-deep border border-retro-border rounded px-2 py-1.5 font-mono text-[12px] text-retro-text placeholder:text-retro-dim focus:border-retro-cta focus:outline-none"
                />
                <button
                  onClick={submit}
                  disabled={!input.trim()}
                  className="px-3 py-1.5 font-pixel text-[9px] border border-retro-cta text-retro-cta rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                >
                  LOCK IT IN
                </button>
              </div>
            ) : (
              <p className="font-pixel text-[9px] text-retro-win text-center">
                LOCKED IN — WAITING FOR THE HERD…
              </p>
            )}

            <p className="font-mono text-[9px] text-retro-dim text-center leading-relaxed">
              {myAnswered
                ? `${ELIGIBLE.filter(id => normalizeAnswer(answers[id] ?? '')).length}/${ELIGIBLE.length} SUBMITTED`
                : 'MATCH THE HERD · BIGGEST GROUP SCORES · LONE SINGLETON TAKES THE COW'}
            </p>
          </>
        )}

        {phase === 'reveal' && reveal && (() => {
          const cowStuck = cow != null && (scores[cow] ?? 0) >= HERD_TARGET
          return (
            <div className="space-y-2">
              {reveal.groups.map(g => {
                const isWinner = g.members.length >= 2 && g.members.every(m => reveal.pointUids.includes(m))
                return (
                  <div
                    key={g.norm}
                    className={cn(
                      'rounded border p-2 space-y-1',
                      isWinner
                        ? 'border-retro-win shadow-neon-win bg-retro-tint-cta'
                        : 'border-retro-border bg-retro-surface',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-pixel text-[11px] text-retro-text truncate">{g.norm.toUpperCase()}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {isWinner && (
                          <span className="font-pixel text-[8px] text-retro-win">+1 EACH</span>
                        )}
                        <span className="font-pixel text-[10px] text-retro-dim">×{g.members.length}</span>
                      </span>
                    </div>
                    <p className="font-mono text-[9px] text-retro-dim truncate">
                      {g.members.map(m => NAME[m]).join(' · ')}
                    </p>
                  </div>
                )
              })}

              {!normalizeAnswer(answers[ME] ?? '') && (
                <p className="font-mono text-[9px] text-retro-dim text-center">
                  YOU SAT THIS ONE OUT — SPECTATORS GET NO POINTS
                </p>
              )}

              {reveal.transferred && (
                <div className="rounded border border-retro-p2 bg-retro-tint-p2 p-2 text-center">
                  <p className="font-pixel text-[10px] text-retro-p2">
                    🐄 {NAME[cow]} MATCHED NOBODY — PINK COW!
                  </p>
                </div>
              )}

              {cowStuck && (
                <div className="rounded border border-retro-danger bg-retro-danger/15 p-2 text-center">
                  <p className="font-pixel text-[9px] text-retro-danger">
                    {NAME[cow]} HIT {HERD_TARGET} — CAN&apos;T WIN WITH THE COW
                  </p>
                </div>
              )}

              <div className="flex justify-center pt-1">
                <button
                  onClick={matchWinner != null ? () => setPhase('winner') : nextRound}
                  className={cn(
                    'px-5 py-2 font-pixel text-[10px] border rounded hover:shadow-neon-win active:scale-95',
                    matchWinner != null
                      ? 'border-retro-cta text-retro-cta hover:shadow-neon-cta'
                      : 'border-retro-win text-retro-win',
                  )}
                >
                  {matchWinner != null ? 'FINAL RESULTS' : 'NEXT PROMPT'}
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      <p className="font-mono text-[9px] text-retro-dim text-center leading-relaxed">
        TYPE WHAT THE HERD TYPES · TIES AT THE TOP ALL SCORE · THE COW HOLDER CAN NEVER WIN
      </p>
    </div>
  )
}
