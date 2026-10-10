import { useCallback, useEffect, useRef, useState } from 'react'
import BonkArena from '../components/BonkArena'
import BonkPad from '../components/BonkPad'
import { BonkBanner, BonkPickSheet, BonkScoreCard, BonkTideChip } from '../components/BonkHud'
import { KEYS_P1, KEYS_P2, KEYS_SOLO, useBonkPads } from '../hooks/useBonkPads'
import useBonkFx from '../hooks/useBonkFx'
import { DT, TARGET, SEATS, BOT_LEVELS, createMatch, step, getWinner, makeBot } from '../lib/bonkLogic'
import { arenaById } from '../lib/bonkArenas'
import { viewOf, staticView } from '../lib/bonkNet'
import { hudOf, sameHud } from '../lib/bonkFx'
import { cn } from '@/lib/utils'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// Solo BONK BUGGIES against a bot, or two players side by side on one phone.
// The same match the online room runs, with no network in between.

const DIFFICULTIES = Object.keys(BOT_LEVELS)
const LEAD_COUNT_S = 1.5
const STILL = staticView()

export default function BonkBuggiesDemo() {
  const [mode, setMode] = useState('bot')            // 'bot' | 'two'
  const [difficulty, setDifficulty] = useState('normal')
  const [round, setRound] = useState(0)              // bump to deal a fresh match
  const [record, setRecord] = useState(() => readBotRecord('bonkbuggies'))
  const [winner, setWinner] = useState(null)
  const two = mode === 'two'
  const names = two ? { X: 'P1', O: 'P2' } : { X: 'YOU', O: 'BOT' }
  const namesRef = useRef(names)
  useEffect(() => { namesRef.current = names })

  const pads = useBonkPads({
    ids: two ? ['p1', 'p2'] : ['p1'],
    keys: two ? { p1: KEYS_P1, p2: KEYS_P2 } : { p1: KEYS_SOLO },
    enabled: !winner,
  })
  const { fx, apply } = useBonkFx()

  const viewRef = useRef(STILL)
  const [hud, setHud] = useState(() => hudOf(STILL, { X: 'YOU', O: 'BOT' }))
  const hudRef = useRef(hud)
  const getView = useCallback(() => viewRef.current, [])
  const pickRef = useRef(null)
  const onPick = useCallback((id) => { pickRef.current = id }, [])

  useEffect(() => {
    const m = createMatch({ seed: (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0, leadCount: LEAD_COUNT_S, bots: two ? [] : ['O'] })
    const bot = two ? null : makeBot(difficulty)
    let raf = 0
    let last = 0
    let acc = 0
    let done = false
    let alive = true
    const publish = (view) => {
      viewRef.current = view
      const next = hudOf(view, namesRef.current)
      if (!sameHud(next, hudRef.current)) { hudRef.current = next; setHud(next) }
    }
    publish(viewOf(m))
    const loop = (ts) => {
      if (!alive) return
      raf = requestAnimationFrame(loop)
      acc += Math.min(50, ts - (last || ts)) / 1000
      last = ts
      if (done || document.hidden) { if (document.hidden) acc = 0; return }
      while (acc >= DT) {
        acc -= DT
        const pick = pickRef.current
        const x = { ...pads.getInput('p1'), pick: two || m.pick?.by === 0 ? pick : null }
        const o = two
          ? { ...pads.getInput('p2'), pick: m.pick?.by === 1 ? pick : null }
          : { ...bot(m.r, 1, DT), pick: null }
        if (m.phase !== 'pick') pickRef.current = null
        const res = step(m, { X: x, O: o }, DT)
        for (const e of res.events) apply(e, { me: two ? null : 'X' })
        const w = getWinner(m)
        if (w) {
          done = true
          setWinner(w)
          if (!two) setRecord(recordBotResult('bonkbuggies', difficulty, w === 'X' ? 'win' : 'loss'))
          break
        }
      }
      publish(viewOf(m))
    }
    raf = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [mode, difficulty, round, two, pads, apply])

  // A new match clears the result.
  const restart = () => { setWinner(null); setRound((r) => r + 1) }
  const choose = (m, d) => { setWinner(null); setMode(m); if (d) setDifficulty(d) }

  const chip = (on) => cn(
    'px-3 py-1 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5',
    on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
  )
  const picker = hud.pick ? (two || hud.pick.by === 0) : false

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2">
        <BonkScoreCard seat={0} name={names.X} score={hud.score[0]} lid={hud.lids[0]} testId="bonk-score-X" />
        <BonkScoreCard seat={1} name={names.O} score={hud.score[1]} lid={hud.lids[1]} testId="bonk-score-O" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[8px] text-retro-dim" data-testid="bonk-arena-name">
          ROUND {hud.round} · {arenaById(hud.arena).name}
        </span>
        <BonkTideChip tide={hud.tide} />
      </div>
      <BonkArena getView={getView} fx={fx} label="Two dune buggies on a rocky island: bonk the other helmet">
        <BonkBanner banner={hud.banner} />
        <BonkPickSheet pick={hud.pick} name={hud.pick ? names[SEATS[hud.pick.by]] : ''} mine={picker} onPick={onPick} />
      </BonkArena>

      <div className="flex gap-3">
        <BonkPad
          id="p1" tone="p1" label={two ? 'P1' : ''} hop={hud.hop[0]} compact={two}
          buttonProps={pads.buttonProps} isDown={pads.down}
          disabled={!!winner || hud.phase === 'pick'}
        />
        {two && (
          <BonkPad
            id="p2" tone="p2" label="P2" hop={hud.hop[1]} compact
            buttonProps={pads.buttonProps} isDown={pads.down}
            disabled={!!winner || hud.phase === 'pick'}
          />
        )}
      </div>

      {winner ? (
        <div className="text-center space-y-2">
          <p className={cn('font-pixel text-sm', two || winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>
            {two ? `${names[winner]} WINS ${hud.score[0]}–${hud.score[1]}` : winner === 'X' ? 'YOU WIN!' : 'THE BOT WINS'}
          </p>
          <button
            onClick={restart}
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
                onClick={() => choose('bot', d)}
                aria-pressed={!two && difficulty === d}
                aria-label={`${d} bot, your record ${describeLevelRecord(record[d])}`}
                className={chip(!two && difficulty === d)}
              >
                <span>{d}</span>
                {formatLevelRecord(record[d]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[d])}</span>}
              </button>
            ))}
            <button onClick={() => choose('two')} aria-pressed={two} className={chip(two)}>
              <span>2 PLAYERS</span>
              <span className="text-[7px] text-retro-dim">ONE PHONE</span>
            </button>
          </div>
          <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
            TOUCH THEIR HELMET · KEEP YOURS OFF THE GROUND<br />
            {two ? 'P1: A / D · P2: ← / → · ' : ''}BOTH BUTTONS = HOP · FIRST TO {TARGET}
          </p>
        </>
      )}
    </div>
  )
}
