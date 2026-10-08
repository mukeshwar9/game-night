import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import BirdseyeArena from '../components/birdseye/BirdseyeArena'
import BirdChip from '../components/birdseye/BirdChip'
import { FORTS, BIRDS, fortScore, starsFor, fortUnlocked } from '../lib/birdseyeCore'
import { fortSnapshot } from '../lib/birdseyeLogic'
import { readBirdseyeProgress, saveBirdseyeFort } from '../lib/birdseyeProgress'
import { sounds } from '../lib/sounds'

// BIRDSEYE solo: World 1's five forts. Pick a fort, fling its three birds,
// pop every scarecrow; stars by score. Fully local — no Firebase.

const Stars = ({ n, className }) => (
  <span className={cn('font-pixel tracking-[0.2em]', className)} aria-label={`${n} of 3 stars`}>
    <span className="text-retro-cta">{'★'.repeat(n)}</span><span className="text-retro-border">{'★'.repeat(3 - n)}</span>
  </span>
)

function FortPicker({ progress, onPick }) {
  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <p className="font-pixel text-[10px] text-retro-cta tracking-wider">WORLD 1 · FENWICK FARM</p>
        <p className="font-mono text-[11px] text-retro-dim">Fling the flock, pop every scarecrow. Ride the shot from behind (CHASE) or from the beak (BEAK).</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {FORTS.map((f, i) => {
          const open = fortUnlocked(progress, i)
          const rec = progress[f.id]
          return (
            <button
              key={f.id}
              type="button"
              disabled={!open}
              onClick={() => onPick(i)}
              data-testid={`birdseye-fort-${f.id}`}
              className={cn(
                'min-h-14 w-full flex items-center gap-3 p-3 rounded border-2 text-left transition-all active:scale-[0.98]',
                open ? 'border-retro-border bg-retro-card hover:border-retro-cta/60' : 'border-retro-border/60 bg-retro-surface opacity-60',
              )}
            >
              <span className="font-pixel text-[10px] text-retro-dim w-9 shrink-0">{f.id}</span>
              <span className="flex-1 min-w-0">
                <span className="font-pixel text-[10px] text-retro-text block truncate">{open ? f.name : 'LOCKED'}</span>
                <span className="font-mono text-[10px] text-retro-dim flex items-center gap-1 mt-0.5">
                  {f.birds.map((b, k) => <BirdChip key={k} id={b} className="w-4 h-4" />)}
                  <span className="ml-1">{f.crows.length} SCARECROW{f.crows.length > 1 ? 'S' : ''}{f.wind ? ' · WIND' : ''}</span>
                </span>
              </span>
              <span className="text-right shrink-0">
                <Stars n={rec?.stars || 0} className="text-[10px] block" />
                {rec?.best ? <span className="font-mono text-[10px] text-retro-dim">BEST {rec.best}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function BirdseyeSolo() {
  const [progress, setProgress] = useState(() => readBirdseyeProgress())
  const [fortIdx, setFortIdx] = useState(null)
  const [snap, setSnap] = useState(null)
  const [shotN, setShotN] = useState(0)
  const [points, setPoints] = useState(0)
  const [history, setHistory] = useState([]) // [{ before, shot, points, pops }]
  const [panel, setPanel] = useState(null) // null | { kind: 'shot' | 'end', … }
  const [playback, setPlayback] = useState(null)
  const [boardKey, setBoardKey] = useState(0)
  const pending = useRef(null)
  const replayId = useRef(0)

  const fort = fortIdx == null ? null : FORTS[fortIdx]
  const board = useMemo(() => (fort && snap ? { key: boardKey, snap, bird: fort.birds[shotN] ?? null } : null),
    // a new board only when the page asks for one (start / next bird)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardKey])

  const start = (i) => {
    const f = FORTS[i]
    setFortIdx(i)
    setSnap(fortSnapshot(f))
    setShotN(0); setPoints(0); setHistory([]); setPanel(null); setPlayback(null)
    pending.current = null
    setBoardKey(k => k + 1)
  }

  const onSettled = (e) => {
    if (!e.live) { // a REPLAY finished: bring the result panel back
      setPlayback(null)
      setPanel(p => (p ? { ...p, hidden: false } : p))
      return
    }
    const n = shotN + 1
    const total = points + e.points
    setHistory(h => [...h, { before: e.before, shot: e.shot, points: e.points, pops: e.pops }])
    setShotN(n); setPoints(total)
    pending.current = e.snap
    const cleared = e.crowsLeft === 0
    if (cleared || n >= fort.birds.length) {
      const birdsLeft = fort.birds.length - n
      const score = fortScore(total, cleared, birdsLeft)
      const stars = starsFor(fort, score, cleared)
      const best = progress[fort.id]?.best || 0
      if (cleared) { setProgress(saveBirdseyeFort(fort.id, stars, score)); sounds.win() } else sounds.lose()
      setPanel({ kind: 'end', cleared, score, stars, birdsLeft, crowsLeft: e.crowsLeft, newBest: cleared && score > best, last: e })
    } else {
      setPanel({ kind: 'shot', last: e, crowsLeft: e.crowsLeft })
    }
  }

  const nextBird = () => { setSnap(pending.current); setPanel(null); setBoardKey(k => k + 1) }
  const replay = (cam) => {
    const last = history[history.length - 1]
    if (!last) return
    setPanel(p => ({ ...p, hidden: true }))
    setPlayback({ id: ++replayId.current, before: last.before, shot: last.shot, cam })
  }

  const hudLeft = useMemo(() => fort && (
    <>
      <span className="font-pixel text-[7px] text-retro-text bg-retro-card/85 rounded px-1.5 py-1">{fort.id} {fort.name}</span>
      <span className="font-pixel text-[7px] text-retro-text bg-retro-card/85 rounded px-1.5 py-1"><span className="text-retro-cta">{points}</span> PTS</span>
      <span className="flex items-center gap-0.5 bg-retro-card/85 rounded px-1 py-0.5" aria-label={`${fort.birds.length - shotN} birds left`}>
        {fort.birds.map((b, k) => <BirdChip key={k} id={b} used={k < shotN} className="w-4 h-4" />)}
      </span>
      {fort.wind ? <span className="font-pixel text-[7px] text-retro-dim bg-retro-card/85 rounded px-1.5 py-1">WIND ← {Math.abs(fort.wind)}</span> : null}
    </>
  ), [fort, points, shotN])

  if (!fort) return <FortPicker progress={progress} onPick={start} />

  const btn = 'min-h-10 px-3 rounded border-2 border-retro-border font-pixel text-[8px] text-retro-text hover:border-retro-cta/60 active:scale-95'
  const cta = 'min-h-10 px-3 rounded bg-retro-cta text-retro-bg font-pixel text-[9px] hover:shadow-neon-cta active:scale-95'
  const replayRow = (
    <div className="space-y-1.5">
      <p className="font-pixel text-[7px] text-retro-dim tracking-wider">REPLAY THIS SHOT FROM</p>
      <div className="flex justify-center gap-1.5">
        {[['chase', 'CHASE'], ['beak', 'BEAK'], ['side', 'SIDE']].map(([c, l]) => <button key={c} type="button" className={btn} onClick={() => replay(c)}>{l}</button>)}
      </div>
    </div>
  )
  const nextIdx = fortIdx + 1 < FORTS.length ? fortIdx + 1 : null

  return (
    <div className="space-y-2">
      <BirdseyeArena
        fort={fort}
        board={board}
        playback={playback}
        onSettled={onSettled}
        hudLeft={hudLeft}
        tip={shotN === 0 && !panel ? fort.tip : null}
        beakHint={fort.id === '1-3' && shotN === 0}
        className="h-[min(70vh,600px)] min-h-[420px]"
      >
        {panel && !panel.hidden && (
          <div role="dialog" aria-label={panel.kind === 'end' ? 'Fort result' : 'Shot result'} className="absolute inset-x-2 bottom-2 rounded border-2 border-retro-border bg-retro-card/95 p-3 text-center space-y-2">
            {panel.kind === 'shot' ? (
              <>
                <p className="font-pixel text-[11px] text-retro-cta">{BIRDS[panel.last.shot.b].name} · +{panel.last.points}</p>
                <p className="font-mono text-[11px] text-retro-dim">
                  {panel.crowsLeft} SCARECROW{panel.crowsLeft > 1 ? 'S' : ''} LEFT · NEXT: {BIRDS[fort.birds[shotN]].name} ({BIRDS[fort.birds[shotN]].ability})
                </p>
                {replayRow}
                <button type="button" className={cn(cta, 'w-full')} onClick={nextBird} data-testid="birdseye-next-bird">NEXT BIRD</button>
              </>
            ) : (
              <>
                <p className={cn('font-pixel text-[12px]', panel.cleared ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>
                  {panel.cleared ? 'FORT CLEARED' : 'OUT OF BIRDS'}
                </p>
                {panel.cleared && <Stars n={panel.stars} className="text-[18px] block" />}
                <div className="font-mono text-[11px] text-retro-text space-y-0.5 text-left bg-retro-surface border border-retro-border rounded p-2">
                  <div className="flex justify-between"><span>POINTS</span><span>{points}</span></div>
                  {panel.cleared && <div className="flex justify-between"><span>BIRDS LEFT × 1500</span><span>{panel.birdsLeft * 1500}</span></div>}
                  <div className="flex justify-between font-bold"><span>SCORE{panel.newBest ? ' · NEW BEST' : ''}</span><span className="text-retro-cta">{panel.score}</span></div>
                </div>
                {panel.cleared ? (
                  // a cleared fort keeps it minimal: replay it, or move on
                  <div className="flex gap-1.5 justify-center">
                    <button type="button" className={btn} onClick={() => start(fortIdx)} data-testid="birdseye-replay-level">REPLAY LEVEL</button>
                    {nextIdx != null
                      ? <button type="button" className={cta} onClick={() => start(nextIdx)} data-testid="birdseye-next-fort">NEXT FORT</button>
                      : <button type="button" className={cta} onClick={() => setFortIdx(null)}>FORTS</button>}
                  </div>
                ) : (
                  <>
                    <p className="font-mono text-[11px] text-retro-dim">{panel.crowsLeft} scarecrow{panel.crowsLeft > 1 ? 's' : ''} still standing.</p>
                    {replayRow}
                    <div className="flex gap-1.5 justify-center flex-wrap">
                      <button type="button" className={btn} onClick={() => setFortIdx(null)}>FORTS</button>
                      <button type="button" className={btn} onClick={() => start(fortIdx)}>RETRY</button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </BirdseyeArena>
      <p className="font-mono text-[10px] text-retro-dim text-center">
        DRAG ANYWHERE TO PULL · TAP MID-AIR FOR THE ABILITY<span className="kbd-hint"> · ARROWS AIM · SPACE LAUNCHES</span>
      </p>
    </div>
  )
}
