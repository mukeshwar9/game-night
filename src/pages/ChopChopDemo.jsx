import { useEffect, useRef, useState } from 'react'
import ChopScene from '../components/ChopScene'
import useGameKeys from '../hooks/useGameKeys'
import { useAuth } from '../lib/AuthContext'
import { newRaceSeed } from '../lib/raceLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import {
  CHOP_GAME_MS, CHOP_STUN_MS, GHOST_LEVELS,
  applyChop, ghostChops, normalizeChopStats, sideDanger, visibleRows, warnsStill,
} from '../lib/chopLogic'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// Solo CHOP CHOP: the same 30-second stack as the online race, against a
// ghost that chops at a steady pace. The clock starts on the first tap.

const TICK_MS = 100

export default function ChopChopDemo() {
  const { profile } = useAuth()
  const [seed, setSeed] = useState(newRaceSeed)
  const [stats, setStats] = useState(() => normalizeChopStats(null))
  const statsRef = useRef(stats)
  const [side, setSide] = useState('L')
  const [lastSide, setLastSide] = useState(null)
  const [stunned, setStunned] = useState(false)
  const stunnedRef = useRef(false)
  const stunTimer = useRef(null)
  const [level, setLevel] = useState('normal')
  const [record, setRecord] = useState(() => readBotRecord('chopchop'))
  const [startAt, setStartAt] = useState(null)      // performance.now() of the first tap
  const [elapsed, setElapsed] = useState(0)
  const running = startAt != null && elapsed < CHOP_GAME_MS
  const over = startAt != null && elapsed >= CHOP_GAME_MS
  const ghost = ghostChops(level, elapsed)

  useEffect(() => {
    if (startAt == null) return
    const id = setInterval(() => {
      const t = Math.min(CHOP_GAME_MS, performance.now() - startAt)
      setElapsed(t)
      if (t < CHOP_GAME_MS) return
      clearInterval(id)
      // The bell: the score is final. Settle the result here, once.
      clearTimeout(stunTimer.current)
      const mine = statsRef.current.chops
      const theirs = ghostChops(level, CHOP_GAME_MS)
      if (mine > theirs) sounds.win(); else if (mine === theirs) sounds.draw(); else sounds.lose()
      if (mine !== theirs) setRecord(recordBotResult('chopchop', level, mine > theirs ? 'win' : 'loss'))
    }, TICK_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the level is locked while the clock runs
  }, [startAt])

  const won = stats.chops > ghostChops(level, CHOP_GAME_MS)
  const drew = stats.chops === ghostChops(level, CHOP_GAME_MS)
  useEffect(() => () => clearTimeout(stunTimer.current), [])

  const chop = (s) => {
    if (over || stunnedRef.current) return
    if (startAt == null) setStartAt(performance.now())
    const res = applyChop(seed, statsRef.current, s)
    statsRef.current = res.stats
    setStats(res.stats)
    setSide(s)
    if (res.chopped) { setLastSide(s); sounds.hit(res.stats.streak) }
    if (res.bonk) {
      sounds.bust()
      stunnedRef.current = true
      setStunned(true)
      clearTimeout(stunTimer.current)
      stunTimer.current = setTimeout(() => { stunnedRef.current = false; setStunned(false) }, CHOP_STUN_MS)
    }
  }

  useGameKeys((e) => {
    if (e.repeat || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return false
    chop(e.key === 'ArrowLeft' ? 'L' : 'R')
    return true
  }, { enabled: !over })

  const again = () => {
    const fresh = normalizeChopStats(null)
    statsRef.current = fresh
    stunnedRef.current = false
    clearTimeout(stunTimer.current)
    setSeed(newRaceSeed()); setStats(fresh); setSide('L'); setLastSide(null); setStunned(false); setStartAt(null); setElapsed(0)
  }

  const left = CHOP_GAME_MS - elapsed
  const diff = stats.chops - ghost
  const warn = warnsStill(stats)

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      <ChopScene
        rows={visibleRows(seed, stats)}
        side={side}
        chops={stats.chops}
        streak={stats.streak}
        stunned={stunned && !over}
        avatar={profile?.avatar}
        lead={startAt == null ? null : { avatar: null, label: 'VS CPU', text: diff > 0 ? `+${diff} AHEAD` : diff < 0 ? `${-diff} BEHIND` : 'LEVEL', ahead: diff >= 0 }}
        clock={{ text: `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`, frac: left / CHOP_GAME_MS, low: left < 6000 }}
        warn={{ L: warn && sideDanger(seed, stats, 'L'), R: warn && sideDanger(seed, stats, 'R') }}
        lastSide={lastSide}
        onChop={chop}
        disabled={over}
        hint={over ? null : !running ? 'TAP A SIDE TO START · ARROW KEYS WORK TOO' : stunned ? 'STUNNED! SHAKE IT OFF…' : warn ? 'THE RED BUTTON IS THE SIDE WITH A BEAM' : 'READ THE STACK · DODGE THE BEAMS'}
      />

      {over ? (
        <div className="text-center space-y-2">
          <p className={cn('font-pixel text-sm', won ? 'text-retro-win text-glow-win' : drew ? 'text-retro-text' : 'text-retro-danger')}>
            {won ? 'YOU WIN!' : drew ? 'LEVEL!' : 'CPU WINS'}
            <span className="block mt-1 text-[9px] text-retro-dim">{stats.chops} — {ghost} CRATES · {stats.bonks} BEAM{stats.bonks === 1 ? '' : 'S'} · BEST STREAK ×{stats.best}</span>
          </p>
          <button onClick={again} className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press">
            PLAY AGAIN
          </button>
        </div>
      ) : (
        <div className="flex justify-center gap-1.5">
          {GHOST_LEVELS.map((d) => (
            <button
              key={d}
              onClick={() => setLevel(d)}
              disabled={running}
              aria-pressed={level === d}
              aria-label={`${d} pace, your record ${describeLevelRecord(record[d])}`}
              className={cn(
                'px-3 py-1 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5 disabled:opacity-60',
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
