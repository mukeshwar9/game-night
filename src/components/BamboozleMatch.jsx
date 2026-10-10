import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BamboozleArena from './BamboozleArena'
import BamboozlePad, { Coins, GrabButton, Hearts } from './BamboozlePad'
import { CountNumber, Plate, SeatCard, YouTag } from './BamboozleParts'
import Avatar from './Avatar'
import useBamboozleControls from '../hooks/useBamboozleControls'
import { isReducedMotion } from '../hooks/useMotionPref'
import { useAuth } from '../lib/AuthContext'
import { createFx, feedFx } from '../lib/bamboozleDraw'
import { COINS_PER_HEART, ROUNDS_TO_WIN } from '../lib/bamboozleLogic'
import { seatCss } from '../lib/bamboozlePalette'
import { BOT_LEVELS, GRAB_RECHARGE, LOCAL_LAYOUT, createSim, stepSim, tallyRound } from '../lib/bamboozleSim'
import { encodeAvatar, randomLook } from '../lib/avatarKit'
import { mulberry32 } from '../lib/detMath'
import { sounds } from '../lib/sounds'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'
import { cn } from '@/lib/utils'

// BAMBOOZLE on one device: "solo" is you against one to three bots with the
// whole surface as your pad, "local" is two to four people on one phone with a
// thumb strip each. Both run the same garden as the online race (the seeded
// timeline in bamboozleLogic.js) plus the movers in bamboozleSim.js.
//
// The setup (how many, how hard, which twists) keys the table: changing it
// remounts a fresh garden behind the TAP TO PLAY plate.

const BETWEEN_MS = 2600
const SUBSTEP = 1 / 60
const ZEROS = [0, 0, 0, 0]
const LEVEL_LABEL = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' }
const TWIST_LABEL = { crumble: 'CRUMBLE', coins: 'BAIT', grab: 'GRAB' }
const TWIST_HELP = {
  crumble: 'Boulders crack and break; a new one lands somewhere else.',
  coins: 'A coin shows before a wall fires. Three buy a heart back.',
  grab: 'Hold a rival beside you, walk them out of cover, let go to throw.',
}

const randomInt = () => Math.floor(Math.random() * 2 ** 31)

/** A fresh round for a setup. `local`: every seat is a person; otherwise seat 0 is you and the rest are bots. */
function makeSim({ players, level, twists }, local) {
  return createSim({
    seed: randomInt(),
    players: Array.from({ length: players }, (_, i) => ({ bot: !local && i > 0 })),
    crumble: twists.crumble, coins: twists.coins, grab: twists.grab, botLevel: level,
  })
}

function Chip({ on, onClick, disabled, children, title, className }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 font-pixel text-[8px] rounded border-2 transition press disabled:opacity-50',
        on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function BamboozleMatch({ mode = 'solo' }) {
  const [config, setConfig] = useState({ players: 2, level: 'normal', twists: { crumble: true, coins: true, grab: true } })
  const key = [config.players, config.level, ...Object.values(config.twists).map(Number)].join('-')
  return <BamboozleTable key={key} mode={mode} config={config} setConfig={setConfig} />
}

function BamboozleTable({ mode, config, setConfig }) {
  const local = mode === 'local'
  const { players, level, twists } = config
  const { profile } = useAuth()
  const [phase, setPhase] = useState('ready') // ready | play | between | over
  const [wins, setWins] = useState(ZEROS)
  const [round, setRound] = useState(1)
  const [banner, setBanner] = useState(null)
  const [ui, setUi] = useState({ hp: [], coins: [], out: [], cd: [], holding: [], count: 0, you: null })
  const [record, setRecord] = useState(() => readBotRecord('bamboozle'))
  const [first] = useState(() => ({ sim: makeSim(config, local), fx: createFx() }))

  const simRef = useRef(first.sim)
  const fxRef = useRef(first.fx)
  const phaseRef = useRef('ready')
  const winsRef = useRef(ZEROS)
  const roundRef = useRef(1)
  const timer = useRef(0)
  const lastCount = useRef(0)
  const uiKey = useRef('')
  const controls = useBamboozleControls({ shared: !local, enabled: phase === 'play' || phase === 'between' })

  // Seat avatars: you are your own profile avatar; the others get fixed looks.
  const avatars = useMemo(() => {
    const rand = mulberry32(0xb4b00)
    const others = [1, 2, 3].map(() => encodeAvatar({ ...randomLook(rand), pet: 'none' }))
    return [profile?.avatar || '', ...others]
  }, [profile?.avatar])
  const names = local ? ['P1', 'P2', 'P3', 'P4'] : ['YOU', 'BOT 1', 'BOT 2', 'BOT 3']

  useEffect(() => () => clearTimeout(timer.current), [])

  const setPhaseBoth = useCallback((p) => { phaseRef.current = p; setPhase(p) }, [])

  const freshGarden = useCallback(() => {
    simRef.current = makeSim(config, local)
    fxRef.current = createFx()
    lastCount.current = 0
    uiKey.current = ''
  }, [config, local])

  const startRound = useCallback(() => {
    freshGarden()
    setBanner(null)
    setRound(roundRef.current)
    setPhaseBoth('play')
  }, [freshGarden, setPhaseBoth])

  const startMatch = useCallback(() => {
    clearTimeout(timer.current)
    winsRef.current = ZEROS
    roundRef.current = 1
    setWins(ZEROS)
    startRound()
  }, [startRound])

  const backToSetup = useCallback(() => {
    clearTimeout(timer.current)
    freshGarden()
    winsRef.current = ZEROS
    roundRef.current = 1
    setWins(ZEROS)
    setRound(1)
    setBanner(null)
    setPhaseBoth('ready')
  }, [freshGarden, setPhaseBoth])

  const finishRound = useCallback((winner) => {
    const r = tallyRound(winsRef.current, winner, ROUNDS_TO_WIN)
    winsRef.current = r.wins
    setWins(r.wins)
    const who = winner != null ? (local ? `PLAYER ${winner + 1}` : winner === 0 ? 'YOU' : `BOT ${winner}`) : ''
    if (r.draw) {
      setBanner({ title: 'DRAW', sub: 'NOBODY SCORES', seat: null })
      sounds.draw()
    } else if (r.matchWinner != null) {
      setBanner({ title: `${who} ${who === 'YOU' ? 'WIN' : 'WINS'} THE MATCH`, sub: null, seat: winner })
      if (local || winner === 0) sounds.matchWin(); else sounds.lose()
      if (!local) setRecord(recordBotResult('bamboozle', level, winner === 0 ? 'win' : 'loss'))
    } else {
      setBanner({ title: `${who} ${who === 'YOU' ? 'SURVIVE' : 'SURVIVES'}`, sub: `ROUND ${roundRef.current} · FIRST TO ${ROUNDS_TO_WIN}`, seat: winner })
      if (local || winner === 0) sounds.win(); else sounds.lose()
    }
    if (r.matchWinner != null) { setPhaseBoth('over'); return }
    setPhaseBoth('between')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { roundRef.current += 1; startRound() }, BETWEEN_MS)
  }, [local, level, startRound, setPhaseBoth])

  const onEvents = useCallback((events) => {
    for (const e of events) {
      if (e.type === 'go') sounds.go()
      else if (e.type === 'warn') sounds.bzWarn()
      else if (e.type === 'impact') sounds.bzThunk()
      else if (e.type === 'hit') sounds.bzOuch()
      else if (e.type === 'out') sounds.bzOut()
      else if (e.type === 'crack') sounds.bzCrack()
      else if (e.type === 'land') sounds.bzLand()
      else if (e.type === 'coin') sounds.bzCoin()
      else if (e.type === 'heal') sounds.bzHeal()
      else if (e.type === 'grab') sounds.bzGrab()
      else if (e.type === 'throw' || e.type === 'free') sounds.bzThrow()
      else if (e.type === 'over') finishRound(e.winner)
    }
  }, [finishRound])

  const tick = useCallback((dt) => {
    const sim = simRef.current
    if (!sim || phaseRef.current === 'ready') return
    const inputs = sim.players.map((p) => (p.bot ? null : controls.getInput(p.i)))
    const events = []
    for (let rem = dt; rem > 1e-6;) {
      const h = Math.min(rem, SUBSTEP)
      events.push(...stepSim(sim, inputs, h))
      rem -= h
    }
    feedFx(fxRef.current, sim, events, { reduced: isReducedMotion() })
    const count = sim.t < 0 ? Math.max(1, Math.ceil(-sim.t - 0.2)) : 0
    if (count !== lastCount.current) {
      lastCount.current = count
      if (count > 0) sounds.bzTick()
    }
    const hp = sim.players.map((p) => p.hp)
    const coins = sim.players.map((p) => p.coins)
    const out = sim.players.map((p) => p.out)
    const cd = sim.players.map((p) => Math.round(Math.min(1, 1 - p.grabCd / GRAB_RECHARGE) * 20) / 20)
    const holding = sim.players.map((p) => p.grab != null)
    const key = [hp, coins, out.map(Number), cd, holding.map(Number), count].join('|')
    if (key !== uiKey.current) {
      uiKey.current = key
      const me = sim.players[0]
      setUi({ hp, coins, out, cd, holding, count, you: count > 0 ? { x: me.x, y: me.y, n: sim.n } : null })
    }
    onEvents(events)
  }, [controls, onEvents])

  const live = phase !== 'ready'
  const grabOn = twists.grab
  const locked = (i) => !live || phase === 'over' || !!ui.out[i]

  const arena = (
    <BamboozleArena
      simRef={simRef}
      fxRef={fxRef}
      avatars={avatars.slice(0, players)}
      onTick={tick}
      hints
      className="rounded-lg"
    >
      {phase === 'ready' && (
        <Plate
          title="TAP TO PLAY"
          sub={local ? `${players} PLAYERS · FIRST TO ${ROUNDS_TO_WIN} ROUNDS` : `YOU + ${players - 1} BOT${players > 2 ? 'S' : ''} · FIRST TO ${ROUNDS_TO_WIN} ROUNDS`}
          onClick={startMatch}
        />
      )}
      {live && ui.count > 0 && <CountNumber n={ui.count} />}
      {live && ui.count > 0 && !local && ui.you && <YouTag x={ui.you.x} y={ui.you.y} n={ui.you.n} />}
      {banner && <Plate title={banner.title} sub={banner.sub} seat={banner.seat} />}
    </BamboozleArena>
  )

  const setup = (
    <div className="space-y-2.5" aria-label="Game setup">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="font-pixel text-[8px] text-retro-dim w-full text-center">{local ? 'PLAYERS ON THIS PHONE' : 'YOU VS'}</span>
        {[2, 3, 4].map((n) => (
          <Chip key={n} on={players === n} onClick={() => setConfig((c) => ({ ...c, players: n }))}>
            {local ? `${n} PLAYERS` : `${n - 1} BOT${n > 2 ? 'S' : ''}`}
          </Chip>
        ))}
      </div>
      {!local && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {BOT_LEVELS.map((d) => (
            <Chip key={d} on={level === d} onClick={() => setConfig((c) => ({ ...c, level: d }))} className="flex flex-col items-center gap-0.5">
              <span aria-label={`${d} bots, your record ${describeLevelRecord(record[d])}`}>{LEVEL_LABEL[d]}</span>
              {formatLevelRecord(record[d]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[d])}</span>}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="font-pixel text-[8px] text-retro-dim w-full text-center">TWISTS</span>
        {Object.keys(TWIST_LABEL).map((k) => (
          <Chip
            key={k}
            on={twists[k]}
            title={TWIST_HELP[k]}
            onClick={() => setConfig((c) => ({ ...c, twists: { ...c.twists, [k]: !c.twists[k] } }))}
          >
            {TWIST_LABEL[k]}
          </Chip>
        ))}
      </div>
    </div>
  )

  const grabFor = (i) => grabOn && (
    <GrabButton seat={i} controls={controls} holding={!!ui.holding[i]} charge={ui.cd[i] ?? 1} disabled={locked(i)} />
  )

  // One phone: a thumb strip per seat; top-row strips read from across the table.
  const strip = (i, top) => (
    <BamboozlePad
      key={i}
      seat={i}
      controls={controls}
      disabled={locked(i)}
      className="rounded-lg border-2 bg-retro-card min-h-[88px]"
      label={`Player ${i + 1}: drag here to steer`}
    >
      <div className={cn('flex items-center gap-2 p-2 min-h-[88px]', top && 'rotate-180')} style={{ borderColor: seatCss(i) }}>
        <Avatar id={avatars[i]} size={48} view="bust" tile={false} className="shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-pixel text-[8px] leading-none truncate" style={{ color: seatCss(i) }}>
            {names[i]}{wins[i] > 0 ? ` ${'★'.repeat(wins[i])}` : ''}
          </p>
          {ui.out[i]
            ? <p className="font-pixel text-[8px] text-retro-dim">OUT</p>
            : (
              <div className="flex items-center gap-2 flex-wrap">
                <Hearts hp={ui.hp[i] ?? 3} size={13} />
                {twists.coins && <Coins coins={ui.coins[i] ?? 0} of={COINS_PER_HEART} />}
              </div>
            )}
          <p className="font-pixel text-[7px] text-retro-dim leading-none">{live ? 'DRAG HERE' : 'READY'}</p>
        </div>
        {grabFor(i)}
      </div>
    </BamboozlePad>
  )

  const [topRow, bottomRow] = LOCAL_LAYOUT[Math.min(4, Math.max(2, players))]
  const cols = (n) => (n === 1 ? 'grid-cols-1' : 'grid-cols-2')

  const body = local ? (
    <div className="space-y-2">
      <div className={cn('grid gap-2', cols(topRow.length))}>{topRow.map((i) => strip(i, true))}</div>
      {arena}
      <div className={cn('grid gap-2', cols(bottomRow.length))}>{bottomRow.map((i) => strip(i, false))}</div>
    </div>
  ) : (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: players }, (_, i) => (
          <SeatCard
            key={i}
            seat={i}
            name={names[i]}
            avatar={avatars[i]}
            hp={ui.hp[i] ?? 3}
            coins={ui.coins[i] ?? 0}
            wins={wins[i]}
            out={!!ui.out[i]}
            you={i === 0}
            showCoins={twists.coins}
            size="sm"
          />
        ))}
      </div>
      <BamboozlePad seat={0} controls={controls} disabled={!live || phase === 'over'} secondFingerGrab={grabOn} className="rounded-lg" label="Drag anywhere to steer">
        {arena}
        <div className="flex items-center justify-between gap-2 px-1 pt-2 min-h-[56px]">
          <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
            DRAG ANYWHERE TO STEER · ARROWS / WASD{grabOn ? ' · SPACE GRABS' : ''}
          </p>
          {grabFor(0)}
        </div>
      </BamboozlePad>
    </div>
  )

  return (
    <div
      className="w-full max-w-sm mx-auto space-y-3"
      data-testid="bamboozle"
      data-mode={mode}
      data-phase={phase}
      data-round={round}
      data-players={players}
    >
      {(phase === 'ready' || phase === 'over') && setup}
      {body}
      {phase === 'over' && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={startMatch} className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press">
            PLAY AGAIN
          </button>
          <button
            onClick={backToSetup}
            className="px-4 py-2.5 border border-retro-border text-retro-text font-pixel text-[9px] rounded hover:border-retro-cta transition press"
          >
            CHANGE SETUP
          </button>
        </div>
      )}
      {(phase === 'play' || phase === 'between') && (
        <p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
          HIDE BEHIND A BOULDER · THE LIT WALL FIRES NEXT
        </p>
      )}
    </div>
  )
}
