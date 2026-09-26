import { useEffect, useMemo, useState } from 'react'
import MarkTile from '../components/MarkTile'
import WordKeyboard from '../components/WordKeyboard'
import WordFeedback from '../components/WordFeedback'
import MatchScoreRail from '../components/MatchScoreRail'
import RoundTimer from '../components/RoundTimer'
import { WordRaceBoard, WordRaceMeter } from '../components/WordRaceBoards'
import {
  applyGuessForPlayer, buildRaceRoundStart, buildNextRaceRound, getGraceEndsAt, getKeyboardState,
  guessProblem, normalizeGuesses, FINISH_GRACE_MS, DONE_GRACE_MS, MATCH_TARGET, MAX_GUESSES, WORD_LENGTH,
} from '../lib/wordraceLogic'
import { getAnswerList } from '../lib/dictionary'
import { playWordleBoard, advanceBotRace } from '../lib/wordBotsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo WORD RACE vs the CPU, fully local, on wordraceLogic's own rules: both
// race the same answer; a solve beats a fail, then fewer guesses, then the
// earlier finish. The first finished board starts the grace clock (30 s
// after a solve). The CPU solves on a human-ish clock (wordBotsLogic), and
// its board shows only rows used, best greens and SOLVED until the reveal —
// the same ghost the room game shows. First to 3. X = you, O = the CPU.

const TICK_MS = 200

const randSeed = () => Math.floor(Math.random() * 2_147_483_647)

function playerName() {
  try { return localStorage.getItem('playerName') || 'YOU' } catch { return 'YOU' }
}

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A round plus the CPU's precomputed board for it (landed on the round clock).
function withCpu(round, answers) {
  return { round, cpuRows: playWordleBoard({ answer: round.answer, pool: answers }) }
}

function ResultCopy({ result, doneX, doneO }) {
  if (!result) return null
  if (result.winner === 'draw') {
    return <p className="font-pixel text-sm text-retro-text">{result.reason === 'speed' ? 'DRAW — DEAD HEAT' : 'DRAW — BOTH MISSED'}</p>
  }
  const winnerDone = result.winner === 'X' ? doneX : doneO
  const loserDone = result.winner === 'X' ? doneO : doneX
  const why = result.reason === 'speed' ? 'FASTER'
    : loserDone?.timedOut ? `${winnerDone?.guesses || 0} GUESSES · TIME RAN OUT`
    : `${winnerDone?.guesses || 0} GUESSES`
  return result.winner === 'X'
    ? <p className="font-pixel text-sm text-retro-win text-glow-win">YOU WIN — {why}</p>
    : <p className="font-pixel text-sm text-retro-p2">THE CPU WINS — {why}</p>
}

export default function WordRaceDemo() {
  const answers = useMemo(() => getAnswerList(), [])
  const [names] = useState(() => ({ X: { name: playerName() }, O: { name: 'CPU' } }))
  const [race, setRace] = useState(null) // { game, cpuRows }
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const game = race?.game
  const round = game?.round
  const playing = round?.phase === 'playing' && game.status === 'playing'

  // One clock drives the CPU and the grace timer.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      setRace(r => {
        const next = advanceBotRace(r.game, { rows: r.cpuRows, now: t, matchTarget: MATCH_TARGET })
        return next === r.game ? r : { ...r, game: next }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [playing])

  const result = round?.phase === 'reveal' ? round.result : null
  const matchOver = game?.status === 'finished'
  useEffect(() => {
    if (!result) return
    if (matchOver) { if (game.winner === 'X') sounds.matchWin(); else sounds.lose() }
    else if (result.winner === 'X') sounds.win()
    else if (result.winner === 'O') sounds.lose()
    else sounds.draw()
    // one sound per revealed round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const startMatch = () => {
    const at = Date.now()
    const used = normalizeGuesses(round?.used).map(Number)
    const first = buildRaceRoundStart({ stub: { used, roundNum: 1 }, seed: randSeed(), answerList: answers, at })
    setRace({ game: { status: 'playing', scores: { X: 0, O: 0 }, round: first }, ...withCpu(first, answers) })
    setNow(at)
    setTyped('')
    setFeedback(null)
  }

  const nextRound = () => {
    const at = Date.now()
    const next = buildNextRaceRound({ round, seed: randSeed(), answerList: answers, at })
    setRace({ game: { ...game, round: next }, ...withCpu(next, answers) })
    setNow(at)
    setTyped('')
    setFeedback(null)
  }

  const submitGuess = () => {
    const word = typed.toLowerCase()
    const problem = guessProblem(word)
    if (problem) {
      sounds.miss()
      setFeedback(f => ({ message: problem, id: (f?.id || 0) + 1 }))
      return
    }
    const at = Date.now()
    setRace(r => {
      // Catch the CPU and the grace clock up first, so a guess after time is
      // up never counts.
      const caught = advanceBotRace(r.game, { rows: r.cpuRows, now: at, matchTarget: MATCH_TARGET })
      const applied = applyGuessForPlayer(caught.round, 'X', word, caught.round.answer, at)
      const g = applied ? { ...caught, round: applied } : caught
      const resolved = advanceBotRace(g, { rows: r.cpuRows, now: at, matchTarget: MATCH_TARGET })
      return { ...r, game: resolved }
    })
    setNow(at)
    setTyped('')
    setFeedback(null)
    sounds.move('X')
  }

  // Skip the wait once you're done: run the CPU's clock to the end of the
  // grace (its rows keep their own times).
  const skipAhead = () => {
    const endsAt = getGraceEndsAt(round)
    if (!endsAt) return
    setRace(r => ({ ...r, game: advanceBotRace(r.game, { rows: r.cpuRows, now: endsAt, matchTarget: MATCH_TARGET }) }))
  }

  const myGuesses = normalizeGuesses(round?.guessesX)
  const cpuGuesses = normalizeGuesses(round?.guessesO)
  const myDone = round?.doneX || null
  const cpuDone = round?.doneO || null

  const onKey = (key) => {
    if (!playing || myDone) return
    if (key === 'ENTER') submitGuess()
    else if (key === 'BACK') setTyped(t => t.slice(0, -1))
    else if (typed.length < WORD_LENGTH) setTyped(t => t + key)
  }

  if (!race) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
          <p>● SAME SECRET WORD FOR YOU AND THE CPU</p>
          <p>✓ SOLVE BEATS FAIL · FEWER GUESSES · THEN FASTER</p>
          <p>⏱ FIRST SOLVE STARTS A 30 S CLOCK · FIRST TO {MATCH_TARGET}</p>
        </div>
        <button
          type="button"
          onClick={startMatch}
          className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          START RACE
        </button>
      </div>
    )
  }

  const reveal = round.phase === 'reveal'
  const graceEndsAt = playing ? getGraceEndsAt(round) : null
  const graceTotal = (myDone || cpuDone)?.solved ? FINISH_GRACE_MS : DONE_GRACE_MS

  return (
    <div className="space-y-3">
      <MatchScoreRail
        game={{ scores: game.scores, players: names }}
        mySymbol="X"
        matchTarget={MATCH_TARGET}
        roundLabel={`ROUND ${round.roundNum || 1}`}
      />

      {playing && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="font-pixel text-[9px] text-retro-dim">SAME WORD · {MAX_GUESSES} GUESSES</span>
          <span className="font-mono text-xs tabular-nums text-retro-cta" aria-hidden="true">{fmtClock(now - round.startedAt)}</span>
        </div>
      )}

      <WordRaceMeter myGuesses={myGuesses} opponentGuesses={cpuGuesses} mySymbol="X" opponentLabel="CPU" />

      <div className="space-y-3">
        <div className="rounded border p-3 border-retro-p1/30 bg-retro-tint-p1/10">
          <WordRaceBoard
            guesses={myGuesses}
            currentGuess={playing && !myDone ? typed : ''}
            reveal={reveal}
            label={names.X.name === 'YOU' ? 'YOU' : `YOU · ${names.X.name}`}
            solved={myDone?.solved}
          />
        </div>
        <div className="rounded border p-3 border-retro-p2/30 bg-retro-tint-p2/10">
          <WordRaceBoard guesses={cpuGuesses} ghost reveal={reveal} compact={!reveal} label="CPU" solved={cpuDone?.solved} />
          {playing && !cpuDone && (
            <p className="font-pixel text-[7px] text-retro-dim mt-1 arcade-blink">CPU IS THINKING…</p>
          )}
        </div>
      </div>

      {playing && (
        <div className="space-y-2">
          {graceEndsAt && (
            <div className="space-y-1">
              <p className={cn('text-center font-pixel text-[10px]', cpuDone && !myDone ? 'text-retro-p2' : 'text-retro-win')} aria-live="polite">
                {myDone ? (myDone.solved ? 'YOU SOLVED — THE CPU IS ON THE CLOCK' : "YOU'RE OUT — THE CPU IS ON THE CLOCK")
                  : (cpuDone.solved ? 'THE CPU SOLVED — KEEP GOING' : 'THE CPU IS OUT — SOLVE IT TO WIN')}
              </p>
              <RoundTimer endsAt={graceEndsAt} now={now} totalMs={graceTotal} label={myDone ? 'CPU HAS' : 'TIME LEFT'} />
            </div>
          )}
          {myDone && (
            <div className="text-center">
              <button
                type="button"
                onClick={skipAhead}
                className="px-4 py-1.5 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:text-retro-text active:scale-95"
              >
                SKIP AHEAD ▸▸
              </button>
            </div>
          )}
          {!myDone && (
            <>
              <div className="flex items-center justify-center gap-2">
                <div className="flex gap-1" aria-label={`Current guess: ${typed || 'empty'}`}>
                  {Array.from({ length: WORD_LENGTH }, (_, i) => (
                    <MarkTile key={i} size="sm" letter={typed[i] || ''} pending={!!typed[i]} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={submitGuess}
                  disabled={typed.length !== WORD_LENGTH}
                  className="min-h-11 px-4 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] disabled:opacity-40"
                >
                  GUESS
                </button>
              </div>
              <WordFeedback message={feedback?.message} tone="bad" id={feedback?.id} />
              <WordKeyboard keyState={getKeyboardState(myGuesses)} onKey={onKey} />
            </>
          )}
        </div>
      )}

      {reveal && (
        <div className="space-y-3 rounded border-2 border-retro-cta/50 bg-retro-card p-4 text-center" aria-live="polite">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">ANSWER</p>
          <p className="font-pixel text-2xl tracking-[0.35em] text-retro-cta text-glow-cta">{round.answer.toUpperCase()}</p>
          <ResultCopy result={round.result} doneX={round.doneX} doneO={round.doneO} />
          <p className="font-mono text-[11px] text-retro-dim">
            YOU {myDone?.solved ? `${myDone.guesses}/${MAX_GUESSES}` : 'MISSED'} · CPU {cpuDone?.solved ? `${cpuDone.guesses}/${MAX_GUESSES}` : 'MISSED'}
          </p>
          {matchOver ? (
            <div className="space-y-2">
              <p className={cn('font-pixel text-sm', game.winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-p2')}>
                {game.winner === 'X' ? 'YOU WIN THE MATCH!' : 'THE CPU WINS THE MATCH'}
              </p>
              <button
                type="button"
                onClick={startMatch}
                className="min-h-11 px-5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] hover:shadow-neon-cta active:scale-95"
              >
                NEW MATCH
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={nextRound}
              className="min-h-11 px-5 rounded border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] hover:shadow-neon-p1 active:scale-95"
            >
              NEXT ROUND
            </button>
          )}
        </div>
      )}
    </div>
  )
}
