import { useCallback, useEffect, useRef, useState } from 'react'
import PuckRushTable, { PuckRushHud } from '../components/PuckRushTable'
import { usePuckrushControls } from '../hooks/usePuckrushControls'
import { BOT_LEVELS, PUCKS_EACH, createState, step, computeAI, getWinner, countSides } from '../lib/puckrushLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// Solo PUCK RUSH against a bot, or two players at opposite ends of one phone.
// The same sim the online room runs, with no network in between.

const DIFFICULTIES = ['easy', 'normal', 'hard']
const DT = 1 / 120
const COUNT_IN_MS = 1200
const FLASH_MS = 260
const between = ([lo, hi]) => lo + Math.random() * (hi - lo)

export default function PuckRushDemo() {
  const [state, setState] = useState(createState)
  const [mode, setMode] = useState('bot')            // 'bot' | 'two'
  const [difficulty, setDifficulty] = useState('normal')
  const [round, setRound] = useState(0)              // bump to deal a fresh table
  const [record, setRecord] = useState(() => readBotRecord('puckrush'))
  const [flash, setFlash] = useState(null)
  const [aims, setAims] = useState({ X: null, O: null })
  const tableRef = useRef(null)
  const stateRef = useRef(state)
  const getPucks = useCallback(() => stateRef.current.pucks, [])
  const two = mode === 'two'
  const winner = getWinner(state)
  const { getInput, getAim, reset } = usePuckrushControls(tableRef, {
    sides: two ? ['X', 'O'] : ['X'], getPucks, enabled: !winner,
  })

  useEffect(() => {
    const fresh = createState()
    stateRef.current = fresh
    reset()
    let alive = true
    let raf = 0
    let last = 0
    let acc = 0
    let done = false
    let flashTimer = 0
    let botQ = 0
    let botAt = performance.now() + COUNT_IN_MS + between(BOT_LEVELS[difficulty].waitMs)
    let botFlings = []
    const loop = (ts) => {
      if (!alive) return
      raf = requestAnimationFrame(loop)
      acc += Math.min(50, ts - (last || ts)) / 1000
      last = ts
      if (done) return
      while (acc >= DT) {
        acc -= DT
        const cur = stateRef.current
        if (!two && ts >= botAt) {
          botAt = ts + between(BOT_LEVELS[difficulty].waitMs)
          const f = computeAI(cur, 'O', difficulty)
          if (f) { botQ += 1; botFlings = [{ ...f, q: botQ }] }
        }
        const inputs = { X: getInput('X'), O: two ? getInput('O') : { hold: null, f: botFlings } }
        const res = step(cur, inputs, DT)
        stateRef.current = res.state
        for (const ev of res.events) {
          if (ev.type === 'fling') sounds.stackRelease()
          else if (ev.type === 'hit') sounds.hit(3)
          else if (ev.type === 'wall') sounds.move('O')
          else if (ev.type === 'cross') {
            sounds.go()
            setFlash(ev.by)
            clearTimeout(flashTimer)
            flashTimer = setTimeout(() => setFlash(null), FLASH_MS)
          }
        }
        const w = getWinner(res.state)
        if (w) {
          done = true
          if (two || w === 'X') sounds.win(); else sounds.lose()
          if (!two) setRecord(recordBotResult('puckrush', difficulty, w === 'X' ? 'win' : 'loss'))
          break
        }
      }
      // One render per frame, not one per substep.
      setState(stateRef.current)
      setAims({ X: getAim('X'), O: two ? getAim('O') : null })
    }
    raf = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(flashTimer) }
  }, [mode, difficulty, round, two, getInput, getAim, reset])

  const left = countSides(state)
  const names = two ? { X: 'P1', O: 'P2' } : { X: 'YOU', O: 'CPU' }
  const chip = (on) => cn(
    'px-3 py-1 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5',
    on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
  )

  return (
    <div className="space-y-3">
      <PuckRushHud left={left} names={names} />
      <PuckRushTable
        tableRef={tableRef}
        pucks={state.pucks}
        held={state.held}
        aims={aims}
        flash={flash}
        labels={two ? { X: 'P1 HALF', O: 'P2 HALF' } : { X: 'YOUR HALF', O: 'CPU HALF' }}
      />

      {winner ? (
        <div className="text-center space-y-2">
          <p className={cn('font-pixel text-sm', two || winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>
            {two ? `${names[winner]} CLEARED THEIR HALF!` : winner === 'X' ? 'YOUR HALF IS CLEAR!' : 'CPU CLEARED FIRST'}
          </p>
          <button
            onClick={() => setRound((r) => r + 1)}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
          >
            PLAY AGAIN
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-1.5">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                onClick={() => { setMode('bot'); setDifficulty(d) }}
                aria-pressed={!two && difficulty === d}
                aria-label={`${d} bot, your record ${describeLevelRecord(record[d])}`}
                className={chip(!two && difficulty === d)}
              >
                <span>{d}</span>
                {formatLevelRecord(record[d]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[d])}</span>}
              </button>
            ))}
            <button onClick={() => setMode('two')} aria-pressed={two} className={chip(two)}>
              <span>2 PLAYERS</span>
              <span className="text-[7px] text-retro-dim">ONE PHONE</span>
            </button>
          </div>
          <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
            PULL A PUCK BACK AND LET GO · ONLY THE GAP LETS IT THROUGH<br />
            {two ? 'ONE PLAYER AT EACH END · ' : ''}EMPTY YOUR HALF OF ALL {PUCKS_EACH * 2} PUCKS FIRST
          </p>
        </>
      )}
    </div>
  )
}
