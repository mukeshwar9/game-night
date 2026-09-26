import { useEffect, useMemo, useState } from 'react'
import MarkTile from '../components/MarkTile'
import WordKeyboard from '../components/WordKeyboard'
import WordFeedback from '../components/WordFeedback'
import MatchScoreRail from '../components/MatchScoreRail'
import RoundTimer from '../components/RoundTimer'
import {
  markGuess, compareResults, getKeyboardState, guessProblem, secretWordProblem,
  MAX_GUESSES, WORD_LENGTH, MATCH_WINS, DUEL_FINISH_GRACE_MS,
} from '../lib/wordduelLogic'
import { getAnswerList, has } from '../lib/dictionary'
import {
  pickCpuSecret, playWordleBoard, botRowTimes, botRowsShown, botDoneState, playerDoneState,
  tallyWins, matchWinner,
} from '../lib/wordBotsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo WORD DUEL vs the CPU, fully local. Like the room game, each side sets
// a secret 5-letter word and cracks the other's: fewer guesses wins, equal
// guesses go to the faster solve, both failing is a draw. The CPU really
// plays Wordle against your word (wordBotsLogic's handicapped solver) on its
// own clock; its board shows marks only until the reveal. First to 3.
// X = you, O = the CPU.

const TICK_MS = 200

function playerName() {
  try { return localStorage.getItem('playerName') || 'YOU' } catch { return 'YOU' }
}

function fmtSecs(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// One board. `ghost` = marks only (the CPU's board while it plays).
function Board({ guesses, current = '', ghost = false, size = 'md', label }) {
  return (
    <div className={cn('flex flex-col', ghost ? 'gap-0.5' : 'gap-1')} role="group" aria-label={label}>
      {Array.from({ length: MAX_GUESSES }, (_, r) => {
        const g = guesses[r]
        const typing = !g && r === guesses.length && current
        return (
          <div key={r} className={cn('flex', ghost ? 'gap-0.5' : 'gap-1')}>
            {Array.from({ length: WORD_LENGTH }, (_, c) => {
              const mark = g?.marks?.[c] || null
              return ghost
                ? <MarkTile key={c} size="xs" mark={mark} />
                : <MarkTile key={c} size={size} letter={g ? g.word[c] : typing ? current[c] || '' : ''} mark={mark} pending={!!typing} />
            })}
          </div>
        )
      })}
    </div>
  )
}

function WordReveal({ word, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="font-pixel text-[8px] text-retro-dim tracking-wider">{label}</p>
      <div role="img" aria-label={`${label}: ${word}`}>
        <div className="flex gap-1" aria-hidden="true">
          {word.split('').map((ch, i) => <MarkTile key={i} size="sm" letter={ch} mark="G" />)}
        </div>
      </div>
    </div>
  )
}

function explain(result, me, cpu) {
  if (me.timedOut) return 'You ran out of time after the CPU finished.'
  if (result === 'draw') return me.solved ? 'Same guesses, same time.' : 'Neither word was cracked.'
  if (me.solved && cpu.solved && me.guesses === cpu.guesses) {
    return `Same number of guesses — ${result === 'X' ? 'you were' : 'the CPU was'} faster (${fmtSecs(me.at)} vs ${fmtSecs(cpu.at)}).`
  }
  if (me.solved && cpu.solved) return `${me.guesses} guesses vs ${cpu.guesses} — fewer guesses wins.`
  return result === 'X' ? 'Only you cracked the word.' : 'Only the CPU cracked the word.'
}

function newRound(usedSecrets) {
  return {
    phase: 'setting',
    cpuSecret: pickCpuSecret(getAnswerList(), { used: usedSecrets }),
    mySecret: '',
    startedAt: null,
    cpuRows: [],
    skipped: false,
    guesses: [],
  }
}

export default function WordDuelDemo() {
  const answers = useMemo(() => getAnswerList(), [])
  const [names] = useState(() => ({ X: { name: playerName() }, O: { name: 'CPU' } }))
  const [winners, setWinners] = useState([]) // finished rounds' winners
  const [usedSecrets, setUsedSecrets] = useState([])
  const [round, setRound] = useState(() => newRound([]))
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const playing = round.phase === 'playing'
  const elapsed = playing ? now - round.startedAt : 0
  const cpuTimes = botRowTimes(round.cpuRows)
  const cpuShown = round.skipped ? round.cpuRows.length : botRowsShown(round.cpuRows, elapsed)
  const cpuDone = playing && cpuShown === round.cpuRows.length ? botDoneState(round.cpuRows) : null
  // Once the CPU finishes you get the room game's grace to finish yours.
  const graceEndsAt = cpuDone && !playerDoneState(round.guesses) ? round.startedAt + cpuDone.at + DUEL_FINISH_GRACE_MS : null
  const timedOut = !!graceEndsAt && now >= graceEndsAt
  const myDone = playerDoneState(round.guesses)
    || (timedOut ? { solved: false, guesses: round.guesses.length, at: graceEndsAt - round.startedAt, timedOut: true } : null)
  const revealed = !!(myDone && cpuDone)
  const result = revealed ? compareResults(myDone, cpuDone) : null

  const scores = tallyWins(revealed ? [...winners, result] : winners)
  const champion = matchWinner(scores, MATCH_WINS)

  useEffect(() => {
    if (!playing || revealed) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [playing, revealed])

  useEffect(() => {
    if (!result) return
    if (champion) { if (champion === 'X') sounds.matchWin(); else sounds.lose() }
    else if (result === 'X') sounds.win()
    else if (result === 'O') sounds.lose()
    else sounds.draw()
  }, [result, champion])

  const fail = (message) => {
    sounds.miss()
    setFeedback(f => ({ message, id: (f?.id || 0) + 1 }))
  }

  const lockSecret = () => {
    const word = typed.toUpperCase()
    const problem = secretWordProblem(word)
    if (problem) { fail(problem); return }
    // The CPU plays its whole board now; the page reveals it on the CPU's clock.
    const cpuRows = playWordleBoard({ answer: word, pool: answers, isWord: has })
    const at = Date.now()
    setRound(r => ({ ...r, phase: 'playing', mySecret: word, startedAt: at, cpuRows }))
    setNow(at)
    setTyped('')
    setFeedback(null)
  }

  const submitGuess = () => {
    const word = typed.toUpperCase()
    const problem = guessProblem(word)
    if (problem) { fail(problem); return }
    const marks = markGuess(word, round.cpuSecret)
    const at = Date.now() - round.startedAt
    setRound(r => ({ ...r, guesses: [...r.guesses, { word, marks, at }] }))
    setTyped('')
    setFeedback(null)
    sounds.move('X')
  }

  const onKey = (key) => {
    if (round.phase === 'setting') {
      if (key === 'ENTER') lockSecret()
      else if (key === 'BACK') setTyped(t => t.slice(0, -1))
      else if (typed.length < WORD_LENGTH) setTyped(t => t + key)
      return
    }
    if (!playing || myDone) return
    if (key === 'ENTER') submitGuess()
    else if (key === 'BACK') setTyped(t => t.slice(0, -1))
    else if (typed.length < WORD_LENGTH) setTyped(t => t + key)
  }

  const nextRound = () => {
    const nextUsed = [...usedSecrets, round.cpuSecret]
    setWinners(w => [...w, result])
    setUsedSecrets(nextUsed)
    setRound(newRound(nextUsed))
    setTyped('')
    setFeedback(null)
  }

  const newMatch = () => {
    const nextUsed = [...usedSecrets, round.cpuSecret]
    setWinners([])
    setUsedSecrets(nextUsed)
    setRound(newRound(nextUsed))
    setTyped('')
    setFeedback(null)
  }

  const roundNo = winners.length + 1
  const rail = (
    <MatchScoreRail
      game={{ scores, players: names }}
      mySymbol="X"
      matchTarget={MATCH_WINS}
      roundLabel={`ROUND ${roundNo}`}
    />
  )

  if (round.phase === 'setting') {
    return (
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="w-full">{rail}</div>
        <div className="text-center space-y-1">
          <p className="font-pixel text-[10px] text-retro-text">PICK A WORD FOR THE CPU</p>
          <p className="font-mono text-[11px] text-retro-dim">The CPU has already picked one for you.</p>
        </div>
        <div className="flex gap-1.5" aria-label={`Your word: ${typed || 'empty'}`}>
          {Array.from({ length: WORD_LENGTH }, (_, i) => (
            <MarkTile key={i} size="lg" letter={typed[i] || ''} pending={!!typed[i]} />
          ))}
        </div>
        <WordFeedback message={feedback?.message} tone="bad" id={feedback?.id} />
        <button
          type="button"
          onClick={lockSecret}
          disabled={typed.length !== WORD_LENGTH}
          className="px-6 py-2 rounded font-pixel text-[10px] bg-retro-cta text-retro-bg hover:shadow-neon-cta active:scale-95 disabled:opacity-50"
        >
          LOCK IN
        </button>
        <WordKeyboard onKey={onKey} enterLabel="Lock in word" />
      </div>
    )
  }

  const shownCpuRows = round.cpuRows.slice(0, cpuShown)
  const nextCpuAt = cpuShown < round.cpuRows.length ? round.startedAt + cpuTimes[cpuShown] : null

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="w-full">{rail}</div>

      {!revealed && myDone && (
        <div className="w-full text-center space-y-2" aria-live="polite">
          <p className="font-pixel text-[9px] text-retro-cta">
            {myDone.solved ? `SOLVED IN ${myDone.guesses} (${fmtSecs(myDone.at)})` : 'OUT OF GUESSES'} — THE CPU IS STILL PLAYING
          </p>
          <button
            type="button"
            onClick={() => setRound(r => ({ ...r, skipped: true }))}
            className="px-4 py-1.5 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:text-retro-text active:scale-95"
          >
            SKIP AHEAD ▸▸
          </button>
          <p className="font-mono text-[10px] text-retro-dim">Skipping keeps the CPU&apos;s own timing.</p>
        </div>
      )}
      {!revealed && !myDone && cpuDone && (
        <div className="w-full space-y-1 text-center">
          <p className="font-pixel text-[9px] text-retro-p2" aria-live="polite">
            {cpuDone.solved ? `CPU SOLVED IN ${cpuDone.guesses} — ` : 'THE CPU IS OUT — '}FINISH BEFORE TIME RUNS OUT
          </p>
          <RoundTimer endsAt={graceEndsAt} now={now} totalMs={DUEL_FINISH_GRACE_MS} label="TIME LEFT" />
        </div>
      )}

      {revealed && (
        <div className="text-center space-y-1" aria-live="polite">
          <p className={cn('font-pixel text-sm', result === 'X' ? 'text-retro-win text-glow-win' : result === 'draw' ? 'text-retro-text' : 'text-retro-p2')}>
            {result === 'X' ? 'YOU WIN THE ROUND!' : result === 'draw' ? "IT'S A DRAW" : 'THE CPU WINS THE ROUND'}
          </p>
          <p className="font-mono text-[11px] text-retro-dim">{explain(result, myDone, cpuDone)}</p>
          <p className="font-mono text-[10px] text-retro-dim">
            You: {myDone.solved ? `${myDone.guesses}/${MAX_GUESSES} in ${fmtSecs(myDone.at)}` : 'not solved'} ·
            CPU: {cpuDone.solved ? `${cpuDone.guesses}/${MAX_GUESSES} in ${fmtSecs(cpuDone.at)}` : 'not solved'}
          </p>
        </div>
      )}

      {revealed && (
        <div className="flex gap-6 justify-center">
          <WordReveal word={round.cpuSecret.toUpperCase()} label="CPU'S WORD" />
          <WordReveal word={round.mySecret} label="YOUR WORD" />
        </div>
      )}

      <div className="flex items-start gap-4">
        <div>
          <p className="font-pixel text-[8px] text-retro-dim mb-1 text-center tracking-wider">YOUR GUESSES</p>
          <Board guesses={round.guesses} current={revealed || myDone ? '' : typed} label="Your board" />
        </div>
        <div>
          <p className="font-pixel text-[8px] text-retro-dim mb-1 text-center tracking-wider">CPU</p>
          {revealed
            ? <Board guesses={round.cpuRows} size="sm" label="CPU board" />
            : <Board guesses={shownCpuRows} ghost label={`CPU board: ${shownCpuRows.length} of ${MAX_GUESSES} guesses used`} />}
          {!revealed && nextCpuAt && (
            <p className="font-pixel text-[7px] text-retro-dim mt-1 text-center arcade-blink">THINKING…</p>
          )}
        </div>
      </div>

      {!revealed && (
        <>
          <WordFeedback message={feedback?.message} tone="bad" id={feedback?.id} />
          <WordKeyboard
            keyState={getKeyboardState(round.guesses)}
            onKey={onKey}
            disabled={!!myDone}
          />
        </>
      )}

      {revealed && (champion ? (
        <div className="text-center space-y-2">
          <p className={cn('font-pixel text-sm', champion === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-p2')}>
            {champion === 'X' ? 'YOU WIN THE MATCH!' : 'THE CPU WINS THE MATCH'}
          </p>
          <button
            type="button"
            onClick={newMatch}
            className="px-5 py-2 font-pixel text-[10px] bg-retro-cta text-retro-bg rounded hover:shadow-neon-cta active:scale-95"
          >
            NEW MATCH
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={nextRound}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
        >
          NEXT ROUND
        </button>
      ))}
    </div>
  )
}
