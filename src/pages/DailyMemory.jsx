import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { todayKey, getDailyNumber, msUntilNextDaily, formatCountdown, localDateLabel } from '../lib/daily'
import {
  dailyMemoryGame, dailyMemoryRand, rankDailyEntries, DAILY_MEMORY_UNITS,
} from '../lib/memoryDailyLogic'
import { readDailyAttempt, markDailyStarted, submitDailyMemory, readDailyBoard } from '../lib/memoryProgress'
import { getGameConfig } from '../lib/games'
import { getUid } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { useMusicScene } from '../lib/music'
import { shareResult } from '@/lib/shareCard'
import { shareUrl } from '@/lib/platform'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { SimonSolo, VisualMemorySolo, ChimpSolo, NumberMemorySolo } from './MemorySoloDemos'

const RUNS = { simon: SimonSolo, visualmemory: VisualMemorySolo, chimp: ChimpSolo, numbermemory: NumberMemorySolo }

// DAILY MEMORY: one of the four memory runs a day, the same seeded deal for every
// player, one attempt, and today's scores of you and your friends. Results are
// written once to dailyMemory/{date}/{uid} (memoryProgress.js); the rules refuse
// a second write, so a reload or a second device cannot buy another try.
export default function DailyMemory() {
  const date = todayKey()
  const type = dailyMemoryGame(date)
  const cfg = getGameConfig(type)
  const Run = RUNS[type]
  const unit = DAILY_MEMORY_UNITS[type]
  const { profile } = useAuth()

  const [rand] = useState(() => dailyMemoryRand(date, type))
  const [attempt, setAttempt] = useState(() => readDailyAttempt(date))
  const [playing, setPlaying] = useState(false)
  const [board, setBoard] = useState(null) // null while loading
  const [sharing, runShare] = useBusy()
  useMusicScene(playing ? 'game' : null, type)

  const refreshBoard = () => readDailyBoard(date).then(entries => setBoard(rankDailyEntries(entries, getUid())))
  useEffect(() => { refreshBoard() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once per visit; finishing a run refreshes it again

  const used = attempt?.started && !playing
  const score = attempt?.score ?? null
  const mine = board?.find(e => e.me)

  const start = () => {
    markDailyStarted(date)
    setAttempt({ started: true })
    setPlaying(true)
  }

  const finish = async (s) => {
    setAttempt({ started: true, score: s })
    const ok = await submitDailyMemory(date, {
      game: type, score: s,
      name: profile?.displayName || localStorage.getItem('playerName') || 'PLAYER',
      avatar: profile?.avatar || localStorage.getItem('playerAvatar') || undefined,
    })
    if (!ok && getUid()) toast.error("COULDN'T SAVE TODAY'S SCORE — CHECK CONNECTION")
    refreshBoard()
  }

  const share = () => runShare(async () => {
    await shareResult({
      gameLabel: `DAILY MEMORY #${getDailyNumber(date)}`,
      headline: `${score ?? mine?.score ?? 0} ${unit}`,
      sub: cfg?.label,
      accentVar: '--c-cta',
      url: shareUrl('/daily/memory'),
    })
  }, () => toast.error("COULDN'T SHARE — TRY AGAIN"))

  return (
    <main className="min-h-screen bg-retro-bg flex flex-col items-center">
      <div className="w-full max-w-md space-y-4 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-pixel text-sm text-retro-cta tracking-wider whitespace-nowrap">DAILY MEMORY #{getDailyNumber(date)}</h1>
          <span className="font-pixel text-[9px] text-retro-dim">{localDateLabel()}</span>
        </div>

        {playing ? (
          <div className="border border-retro-border rounded p-2 sm:p-4 bg-retro-card space-y-3">
            <p className="font-pixel text-xs text-retro-text text-center tracking-wider">{cfg?.label} · ONE TRY</p>
            <Run rand={rand} single onFinish={finish} />
            {attempt?.score != null && (
              <button
                type="button"
                onClick={() => setPlaying(false)}
                className="w-full py-2.5 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
              >
                SEE TODAY&apos;S BOARD
              </button>
            )}
          </div>
        ) : (
          <div className="border border-retro-border rounded p-4 bg-retro-card space-y-3 text-center">
            <p className="font-pixel text-[8px] text-retro-dim tracking-widest">TODAY&apos;S GAME</p>
            <p className="font-pixel text-base text-retro-text">{cfg?.label}</p>
            <p className="font-mono text-[12px] text-retro-dim">{cfg?.desc} · same deal for everyone · one try</p>
            {used ? (
              <>
                <p className="font-pixel text-[9px] text-retro-dim mt-2">YOUR SCORE</p>
                <p className="font-pixel text-xl text-retro-cta text-glow-cta">{score ?? mine?.score ?? '—'} {unit}</p>
                {score == null && mine == null && (
                  <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">YOU STARTED TODAY&apos;S RUN BUT DID NOT FINISH IT</p>
                )}
                <button
                  type="button"
                  onClick={share}
                  disabled={sharing}
                  className="w-full py-2.5 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-50"
                >
                  {sharing ? 'BUILDING…' : 'SHARE RESULT'}
                </button>
                <p className="font-pixel text-[8px] text-retro-dim">NEXT DAILY IN {formatCountdown(msUntilNextDaily())}</p>
                <Link to={`/solo/${type}`} className="block font-pixel text-[9px] text-retro-p1 underline underline-offset-4">PRACTICE {cfg?.label} →</Link>
              </>
            ) : (
              <button
                type="button"
                onClick={start}
                className="w-full py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
              >
                PLAY TODAY&apos;S RUN
              </button>
            )}
          </div>
        )}

        {!playing && (
          <section className="border border-retro-border rounded p-3 bg-retro-card space-y-2" aria-label="Today's board">
            <p className="font-pixel text-[9px] text-retro-dim tracking-widest">TODAY · YOU AND FRIENDS</p>
            {board == null ? (
              <p className="font-pixel text-[8px] text-retro-dim">LOADING…</p>
            ) : board.length === 0 ? (
              <p className="font-mono text-[12px] text-retro-dim">No scores yet today. Play, then send your friends the link.</p>
            ) : (
              <ol className="space-y-1">
                {board.map(e => (
                  <li key={e.uid} className={cn('flex items-center justify-between rounded px-2 py-1.5 font-pixel text-[9px]', e.me ? 'bg-retro-tint-cta text-retro-text' : 'text-retro-text')}>
                    <span className="truncate">{e.rank}. {e.me ? 'YOU' : String(e.name || 'PLAYER').toUpperCase()}</span>
                    <span className="shrink-0 tabular-nums text-retro-cta">{e.score} {unit}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
