// /night — a one-phone night: deal 5, 7 or 10 pass-and-play games, play them
// one after another on this phone, and keep the standings in a strip that stays
// on screen between games. Rules live in src/lib/localNightLogic.js; the games
// are the same local pages /local/:type renders. Client-only: the night is kept
// in localStorage on this phone and never touches Firebase.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import LoadingLine from '../components/loading/LoadingLine'
import { FocusPlay } from '../components/FocusStage'
import { VideoCallShell } from '../components/VideoCallLayout'
import { GAME_TYPES, getGameConfig, supportsLocalPlay } from '../lib/games'
import { canFocusPage } from '../lib/focusLogic'
import { lazyWithRetry } from '../lib/lazyWithRetry'
import { useMusicScene } from '../lib/music'
import { recordPlay } from '../lib/analytics'
import { recordRecentPlay } from '../lib/recentPlays'
import {
  NIGHT_LENGTHS, DEFAULT_LENGTH, MIN_PLAYERS, MAX_PLAYERS, NAME_MAX,
  defaultPlayers, cleanName, dealPool, fitLength, dealGames, redealOne,
  createNight, currentGame, currentIndex, isFinished, setPhase, recordResult, undoResult,
  standings, champions, winnerOf, gamePoints, parseNight, serializeNight,
} from '../lib/localNightLogic'

const BotBoardDemo = lazyWithRetry(() => import('./demos/BotBoardDemo'))

const STORAGE_KEY = 'gn-local-night'

function loadNight() {
  try { return parseNight(localStorage.getItem(STORAGE_KEY)) } catch { return null }
}
function saveNight(night) {
  try {
    if (night) localStorage.setItem(STORAGE_KEY, serializeNight(night))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* private window or blocked storage: the night just does not survive a reload */ }
}

const chip = (on) =>
  `min-h-11 min-w-11 px-3 rounded border font-pixel text-[10px] tracking-wider transition press ${
    on ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border bg-retro-card text-retro-dim hover:border-retro-cta/50'}`

const primaryBtn =
  'w-full min-h-12 rounded border border-retro-cta bg-retro-tint-cta text-retro-cta font-pixel text-[10px] tracking-wider shadow-neon-cta transition press disabled:opacity-40'
const quietBtn =
  'min-h-11 px-3 rounded border border-retro-border bg-retro-card text-retro-dim font-pixel text-[9px] tracking-wider transition press hover:border-retro-cta/50'

function GameIcon({ cfg, size = 28 }) {
  const Icon = cfg.Icon
  return Icon ? <Icon size={size} /> : null
}

// --- Standings strip (visible all night) ------------------------------------------

function StandingsStrip({ night }) {
  const rows = standings(night)
  const anyPoints = rows.some(r => r.points > 0)
  return (
    <ul
      aria-label="Night standings"
      className="sticky top-[calc(var(--app-header-offset)+0.75rem)] z-10 grid gap-2 bg-retro-bg py-2"
      style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
      data-testid="night-strip"
    >
      {night.players.map(p => {
        const r = rows.find(x => x.id === p.id)
        const lead = anyPoints && r.rank === 1
        return (
          <li
            key={p.id}
            data-testid={`night-strip-${p.id}`}
            className={`flex flex-col items-center gap-1 rounded border px-1 py-2 ${
              lead ? 'border-retro-win bg-retro-tint-cta shadow-neon-win' : 'border-retro-border bg-retro-card'}`}
          >
            <Avatar id={p.avatar} size={24} />
            <span className="w-full truncate text-center font-pixel text-[8px] text-retro-text">{p.name}</span>
            <span className={`font-pixel text-[11px] ${lead ? 'text-retro-win' : 'text-retro-text'}`}>{r.points}</span>
          </li>
        )
      })}
    </ul>
  )
}

// --- Progress track ---------------------------------------------------------------

function ProgressTrack({ night }) {
  const at = currentIndex(night)
  return (
    <div className="space-y-1.5" data-testid="night-progress">
      <ol className="flex gap-1" aria-label="Night progress">
        {night.games.map((type, i) => {
          const done = i < at
          const now = i === at && !isFinished(night)
          return (
            <li
              key={`${i}-${type}`}
              title={getGameConfig(type).label}
              className={`h-2 flex-1 rounded-sm border ${
                done ? 'border-retro-cta bg-retro-cta' : now ? 'border-retro-cta bg-transparent' : 'border-retro-border bg-retro-card'}`}
            />
          )
        })}
      </ol>
      <p className="text-center font-pixel text-[8px] tracking-wider text-retro-dim">
        {isFinished(night) ? 'NIGHT COMPLETE' : `GAME ${at + 1} OF ${night.games.length}`}
      </p>
    </div>
  )
}

// --- Setup ------------------------------------------------------------------------

function Setup({ onStart }) {
  const [count, setCount] = useState(2)
  const [length, setLength] = useState(DEFAULT_LENGTH)
  const [names, setNames] = useState(['', '', '', ''])
  const pool = useMemo(() => dealPool(GAME_TYPES, supportsLocalPlay, count), [count])
  const [games, setGames] = useState(() => dealGames(dealPool(GAME_TYPES, supportsLocalPlay, 2), DEFAULT_LENGTH))

  const redeal = (nextCount, nextLength) =>
    setGames(dealGames(dealPool(GAME_TYPES, supportsLocalPlay, nextCount), nextLength))

  const pickCount = (n) => {
    const nextLength = fitLength(length, dealPool(GAME_TYPES, supportsLocalPlay, n).length)
    setCount(n)
    setLength(nextLength)
    redeal(n, nextLength)
  }

  const start = () => {
    const players = defaultPlayers(count).map((p, i) => ({ ...p, name: cleanName(names[i], p.name) }))
    onStart(createNight({ players, games }))
  }

  return (
    <div className="space-y-5" data-testid="night-setup">
      <section className="space-y-2">
        <h2 className="font-pixel text-[9px] tracking-wider text-retro-dim">WHO'S PLAYING?</h2>
        <div className="flex gap-2" role="group" aria-label="Players">
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(n => (
            <button
              key={n}
              type="button"
              aria-pressed={count === n}
              onClick={() => pickCount(n)}
              className={chip(count === n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {defaultPlayers(count).map((p, i) => (
            <label key={p.id} className="flex items-center gap-2 rounded border border-retro-border bg-retro-card px-2 py-1.5">
              <Avatar id={p.avatar} size={24} />
              <input
                value={names[i]}
                maxLength={NAME_MAX}
                placeholder={p.name}
                aria-label={`Player ${i + 1} name`}
                onChange={e => setNames(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                className="min-h-9 w-full min-w-0 bg-transparent font-mono text-xs text-retro-text outline-none placeholder:text-retro-dim"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-pixel text-[9px] tracking-wider text-retro-dim">HOW MANY GAMES?</h2>
        <div className="flex gap-2" role="group" aria-label="Games in the night">
          {NIGHT_LENGTHS.map(n => (
            <button
              key={n}
              type="button"
              aria-pressed={length === n}
              disabled={n > pool.length}
              onClick={() => { setLength(n); redeal(count, n) }}
              className={`${chip(length === n)} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2" aria-label="Dealt games">
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-[9px] tracking-wider text-retro-dim">TONIGHT'S GAMES</h2>
          <button type="button" onClick={() => redeal(count, length)} className={quietBtn}>DEAL AGAIN</button>
        </div>
        <ol className="space-y-1.5">
          {games.map((type, i) => {
            const cfg = getGameConfig(type)
            return (
              <li key={`${i}-${type}`} className="flex min-h-11 items-center gap-3 rounded border border-retro-border bg-retro-card px-3">
                <span className="w-4 font-pixel text-[8px] text-retro-dim">{i + 1}</span>
                <GameIcon cfg={cfg} size={24} />
                <span className="flex-1 truncate font-pixel text-[9px] tracking-wider text-retro-text">{cfg.label}</span>
                <button
                  type="button"
                  aria-label={`Swap ${cfg.label}`}
                  onClick={() => setGames(g => redealOne(g, i, pool))}
                  className="min-h-11 min-w-11 font-pixel text-[11px] text-retro-dim transition press hover:text-retro-cta"
                >
                  ↻
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <button type="button" onClick={start} disabled={games.length === 0} className={primaryBtn} data-testid="night-start">
        START THE NIGHT
      </button>
    </div>
  )
}

// --- The game on screen -----------------------------------------------------------

function NightGame({ type }) {
  const cfg = getGameConfig(type)
  return (
    <div className="rounded border border-retro-border bg-retro-card p-2 sm:p-4">
      <p className="pb-2 text-center font-pixel text-[9px] text-retro-dim">
        {cfg.localBlurb || 'PASS & PLAY · ONE SCREEN, TAKE TURNS'}{cfg.localMaxPlayers ? ` · 2-${cfg.localMaxPlayers} PLAYERS` : ''}
      </p>
      <Suspense fallback={<LoadingLine />}>
        {cfg.LocalPage ? (
          canFocusPage(cfg)
            ? <FocusPlay label={cfg.label}><cfg.LocalPage mode="local" /></FocusPlay>
            : <cfg.LocalPage mode="local" />
        ) : <BotBoardDemo type={type} mode="local" />}
      </Suspense>
    </div>
  )
}

function WhoWon({ night, onPick }) {
  return (
    <section className="space-y-3 rounded border border-retro-cta/60 bg-retro-card p-3" data-testid="night-judging">
      <h2 className="text-center font-pixel text-[10px] tracking-wider text-retro-text">WHO WON?</h2>
      <div className="grid grid-cols-2 gap-2">
        {night.players.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            data-testid={`night-winner-${p.id}`}
            className="flex min-h-16 items-center gap-2 rounded border border-retro-border bg-retro-surface px-3 transition press-card hover:border-retro-win/70"
          >
            <Avatar id={p.avatar} size={48} />
            <span className="min-w-0 flex-1 truncate text-left font-pixel text-[9px] text-retro-text">{p.name}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onPick(null)} data-testid="night-winner-draw" className={`${quietBtn} w-full`}>
        DRAW · NOBODY WINS
      </button>
    </section>
  )
}

function LastResult({ night, onUndo }) {
  const idx = currentIndex(night)
  if (idx === 0) return null
  const last = night.results[idx - 1]
  const lastWinner = winnerOf(night, idx - 1)
  const lastPts = gamePoints(night.players, last.winner).find(p => p.points > 0)?.points
  return (
    <p className="rounded border border-retro-border bg-retro-card px-3 py-2 text-center font-mono text-[11px] text-retro-dim" data-testid="night-last">
      {getGameConfig(last.type).label}:{' '}
      {lastWinner
        ? <span className="text-retro-win">{lastWinner.name} won +{lastPts}</span>
        : <span className="text-retro-text">a draw, +1 each</span>}
      {' · '}
      <button type="button" onClick={onUndo} className="min-h-11 px-1 text-retro-cta underline">UNDO</button>
    </p>
  )
}

function Intro({ night, onPlay, onSwap, onUndo }) {
  const idx = currentIndex(night)
  const type = currentGame(night)
  const cfg = getGameConfig(type)
  return (
    <div className="space-y-3" data-testid="night-intro">
      <LastResult night={night} onUndo={onUndo} />
      <section className="space-y-3 rounded border border-retro-border bg-retro-card p-4 text-center">
        <p className="font-pixel text-[8px] tracking-wider text-retro-dim">{idx === 0 ? 'FIRST GAME' : 'NEXT GAME'}</p>
        <div className="flex justify-center"><GameIcon cfg={cfg} size={48} /></div>
        <h2 className="font-pixel text-xs tracking-wider text-retro-text" data-testid="night-next-label">{cfg.label}</h2>
        {cfg.desc && <p className="font-mono text-[11px] leading-relaxed text-retro-dim">{cfg.desc}</p>}
      </section>
      <button type="button" onClick={onPlay} className={primaryBtn} data-testid="night-play">PLAY {cfg.label}</button>
      <button type="button" onClick={onSwap} className={`${quietBtn} w-full`}>SWAP THIS GAME</button>
    </div>
  )
}

function Finale({ night, onAgain, onUndo }) {
  const rows = standings(night)
  const champs = champions(night)
  return (
    <div className="space-y-4" data-testid="night-finale">
      <LastResult night={night} onUndo={onUndo} />
      <section className="space-y-2 rounded border border-retro-win bg-retro-card p-4 text-center shadow-neon-win">
        <p className="font-pixel text-[8px] tracking-wider text-retro-dim">{champs.length > 1 ? 'IT IS A TIE' : 'NIGHT CHAMPION'}</p>
        <div className="flex justify-center gap-2">
          {champs.map(c => <Avatar key={c.id} id={c.avatar} size={72} />)}
        </div>
        <h2 className="font-pixel text-xs tracking-wider text-retro-win text-glow-win" data-testid="night-champion">
          {champs.map(c => c.name).join(' & ')}
        </h2>
      </section>
      <ol className="space-y-1.5" aria-label="Final standings">
        {rows.map(r => (
          <li key={r.id} className="flex min-h-11 items-center gap-3 rounded border border-retro-border bg-retro-card px-3">
            <span className="w-4 font-pixel text-[9px] text-retro-dim">{r.rank}</span>
            <Avatar id={r.avatar} size={24} />
            <span className="flex-1 truncate font-pixel text-[9px] text-retro-text">{r.name}</span>
            <span className="font-mono text-[11px] text-retro-dim">{r.wins} {r.wins === 1 ? 'WIN' : 'WINS'}</span>
            <span className="w-8 text-right font-pixel text-[11px] text-retro-text">{r.points}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onAgain} className={primaryBtn} data-testid="night-again">PLAY ANOTHER NIGHT</button>
    </div>
  )
}

// --- Page -------------------------------------------------------------------------

export default function LocalNight() {
  const [night, setNight] = useState(loadNight)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const recorded = useRef(new Set())

  const update = (next) => { setNight(next); saveNight(next) }

  const type = night ? currentGame(night) : null
  const inGame = !!night && !isFinished(night) && (night.phase === 'playing' || night.phase === 'judging')
  useMusicScene(inGame ? 'game' : 'lobby', inGame ? type : null)

  // One play per dealt game, counted when it first goes on screen.
  useEffect(() => {
    if (!inGame) return
    const key = `${night.startedAt}-${currentIndex(night)}`
    if (recorded.current.has(key)) return
    recorded.current.add(key)
    recordPlay(type, 'local')
    recordRecentPlay(type, 'local')
  }, [inGame, night, type])

  const swapCurrent = () => {
    const pool = dealPool(GAME_TYPES, supportsLocalPlay, night.players.length)
    update({ ...night, games: redealOne(night.games, currentIndex(night), pool) })
  }

  const endNight = () => {
    if (!confirmEnd) { setConfirmEnd(true); return }
    setConfirmEnd(false)
    update(null)
  }

  const finished = !!night && isFinished(night)

  return (
    <VideoCallShell>
      <main className="flex min-h-screen flex-col items-center bg-retro-bg">
        <div className="w-full max-w-md space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <h1 className="text-center font-pixel text-[10px] tracking-wider text-retro-text">ONE-PHONE NIGHT</h1>

          {!night && <Setup onStart={update} />}

          {night && (
            <>
              <StandingsStrip night={night} />
              <ProgressTrack night={night} />

              {finished && <Finale night={night} onAgain={() => update(null)} onUndo={() => update(undoResult(night))} />}

              {!finished && night.phase === 'intro' && (
                <Intro
                  night={night}
                  onPlay={() => update(setPhase(night, 'playing'))}
                  onSwap={swapCurrent}
                  onUndo={() => update(undoResult(night))}
                />
              )}

              {inGame && (
                <>
                  <NightGame key={`${currentIndex(night)}-${type}`} type={type} />
                  {night.phase === 'playing' && (
                    <button type="button" onClick={() => update(setPhase(night, 'judging'))} className={primaryBtn} data-testid="night-finished">
                      GAME OVER · WHO WON?
                    </button>
                  )}
                  {night.phase === 'judging' && (
                    <WhoWon night={night} onPick={(id) => update(recordResult(night, id))} />
                  )}
                </>
              )}

              {!finished && (
                <button type="button" onClick={endNight} onBlur={() => setConfirmEnd(false)} className={`${quietBtn} w-full`}>
                  {confirmEnd ? 'TAP AGAIN TO END THE NIGHT' : 'END THE NIGHT'}
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </VideoCallShell>
  )
}
