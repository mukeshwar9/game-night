import { useEffect, useMemo, useState } from 'react'
import FaceOffBoard from '../components/FaceOffBoard'
import {
  BOT_LEVELS, FACE_COUNT, QUESTIONS,
  answerQuestion, askQuestion, botMove, canAsk, canName, dealFaces, judge, nameFace, normalizeRound,
  phaseOf, remainingFor, splitFor, traitOf,
} from '../lib/faceoffLogic'
import { generateSeedHex } from '../lib/diceLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// Solo FACE OFF against a bot: the same round object and moves as the online
// room (faceoffLogic.js), kept in local state. No commitments are needed —
// the bot's secret never leaves this page.

const ME = 'X'
const CPU = 'O'
const BOT_MS = 1300
const STAMP_MS = 1100
const fresh = () => ({ fSeed: generateSeedHex(), fTurn: ME })

export default function FaceOffDemo() {
  const [raw, setRaw] = useState(fresh)
  const [mine, setMine] = useState(null)            // my secret face index
  const [theirs, setTheirs] = useState(null)        // the bot's
  const [level, setLevel] = useState('normal')
  const [record, setRecord] = useState(() => readBotRecord('faceoff'))
  const [selected, setSelected] = useState(null)
  const [naming, setNaming] = useState(false)
  const [candidate, setCandidate] = useState(null)
  const [result, setResult] = useState(null)
  const [stamp, setStamp] = useState(null)
  const round = normalizeRound(raw)
  const faces = useMemo(() => dealFaces(round.seed), [round.seed])
  const phase = phaseOf(raw)

  const settle = (named) => {
    const verdict = judge(faces, { ...named, fReveal: { X: { i: mine, salt: '' }, O: { i: theirs, salt: '' } } }, { X: true, O: true })
    setRaw(named)
    setResult(verdict)
    if (verdict.winner === ME) sounds.win(); else sounds.lose()
    setRecord(recordBotResult('faceoff', level, verdict.winner === ME ? 'win' : 'loss'))
  }

  // The bot's turn: ask (my face answers at once) or name.
  useEffect(() => {
    if (result || phase !== 'ask' || round.turn !== CPU) return
    const id = setTimeout(() => {
      const move = botMove(faces, raw, CPU, level)
      if (move.name != null) { settle(nameFace(raw, CPU, move.name)); return }
      sounds.move('O')
      setRaw(answerQuestion(askQuestion(raw, CPU, move.ask), ME, traitOf(faces, mine, move.ask)))
    }, BOT_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `settle` closes over the same values already listed
  }, [raw, result, phase, round.turn, level, faces, mine])

  useEffect(() => {
    if (stamp == null) return
    const id = setTimeout(() => setStamp(null), STAMP_MS)
    return () => clearTimeout(id)
  }, [stamp])

  const lock = () => {
    if (candidate == null) return
    setMine(candidate)
    setTheirs(Math.floor(Math.random() * FACE_COUNT))
    setRaw({ ...raw, fCommit: { X: 'local', O: 'local' } })
    setCandidate(null)
    sounds.move('X')
  }
  const ask = () => {
    if (!selected || !canAsk(raw, ME, selected)) return
    const a = traitOf(faces, theirs, selected)
    setRaw(answerQuestion(askQuestion(raw, ME, selected), CPU, a))
    setStamp({ a })
    if (a) sounds.go(); else sounds.buzz()
    setSelected(null)
  }
  const confirmName = () => {
    if (candidate == null || !canName(raw, ME)) return
    settle(nameFace(raw, ME, candidate))
    setNaming(false)
    setCandidate(null)
  }
  const again = () => { setRaw(fresh()); setMine(null); setTheirs(null); setResult(null); setSelected(null); setNaming(false); setCandidate(null); setStamp(null) }

  const standing = new Set(remainingFor(faces, raw, ME))
  const down = new Set(faces.map((_, i) => i).filter((i) => !standing.has(i)))
  const myTurn = !result && phase === 'ask' && round.turn === ME
  const mode = result ? 'watch' : phase === 'pick' ? 'pick' : naming && myTurn ? 'name' : 'ask'
  const sel = myTurn && selected && canAsk(raw, ME, selected) ? selected : null
  const myAnswered = round.asks.filter((a) => a.by === ME && a.a != null)
  const lastOf = (s) => round.asks.filter((a) => a.by === s).slice(-1)
  const seats = {
    X: { name: 'YOU', secret: mine != null ? faces[mine] : null, left: standing.size, wins: 0 },
    O: { name: 'CPU', secret: result ? faces[theirs] : null, left: remainingFor(faces, raw, CPU).length, wins: 0 },
  }
  const hint = result ? ''
    : phase === 'pick' ? 'TAP THE FACE YOU WANT TO HIDE'
      : myTurn ? (sel ? 'ASK IT, OR TRY ANOTHER' : 'YOUR TURN · TAP A QUESTION TO SEE ITS SPLIT') : 'CPU IS CHOOSING A QUESTION…'

  let primary = null
  let secondary = null
  if (mode === 'pick') {
    primary = { label: candidate == null ? 'TAP A FACE' : `HIDE ${faces[candidate].name}`, sub: 'THE CPU MUST FIND IT', onClick: lock, disabled: candidate == null }
  } else if (mode === 'name') {
    primary = { label: candidate == null ? 'TAP A FACE' : `IT'S ${faces[candidate].name}!`, onClick: confirmName, disabled: candidate == null }
    secondary = { label: 'BACK', onClick: () => { setNaming(false); setCandidate(null) } }
  } else if (mode === 'ask') {
    primary = { label: 'ASK', sub: sel ? QUESTIONS.find((q) => q.id === sel).label : 'PICK A QUESTION', onClick: ask, disabled: !sel }
    secondary = { label: 'NAME THE FACE', sub: `${standing.size} LEFT`, onClick: () => { setNaming(true); setSelected(null); setCandidate(null) }, disabled: !myTurn }
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      <FaceOffBoard
        faces={faces}
        seats={seats}
        mySide={ME}
        turn={!result && phase === 'ask' ? round.turn : null}
        down={down}
        highlight={mode === 'ask' && sel ? new Set([...standing].filter((i) => faces[i].traits[sel] === 1)) : null}
        mode={mode}
        candidate={candidate}
        onFace={(i) => { sounds.touch(); setCandidate(i) }}
        log={[...lastOf(ME), ...lastOf(CPU)]}
        asked={Object.fromEntries(myAnswered.map((a) => [a.q, a.a]))}
        selected={sel}
        onQuestion={myTurn ? (q) => { sounds.touch(); setSelected(selected === q ? null : q) } : null}
        split={sel ? splitFor(faces, raw, ME, sel) : null}
        stamp={stamp ? stamp.a : null}
        primary={primary}
        secondary={secondary}
        hint={hint}
      />

      {result ? (
        <div className="text-center space-y-2">
          <p className={cn('font-pixel text-sm', result.winner === ME ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>
            {result.winner === ME ? (round.name.by === ME ? 'GOT IT!' : 'CPU GUESSED WRONG') : (round.name.by === ME ? 'WRONG FACE' : 'CPU FOUND YOUR FACE')}
            <span className="block mt-1 text-[9px] text-retro-dim">CPU WAS HIDING {faces[theirs].name}</span>
          </p>
          <button onClick={again} className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press">
            PLAY AGAIN
          </button>
        </div>
      ) : phase === 'pick' && (
        <div className="flex justify-center gap-1.5">
          {BOT_LEVELS.map((d) => (
            <button
              key={d}
              onClick={() => setLevel(d)}
              aria-pressed={level === d}
              aria-label={`${d} bot, your record ${describeLevelRecord(record[d])}`}
              className={cn(
                'px-3 py-1 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5',
                level === d ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
              )}
            >
              <span>{d}</span>
              {formatLevelRecord(record[d]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[d])}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
