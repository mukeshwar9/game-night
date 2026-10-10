import { useEffect, useMemo, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { db } from '../lib/firebase'
import { serverNow } from '../lib/serverClock'
import { levelRand, newSeed } from '../lib/memoryRaceLogic'
import { LEVEL_COUNTDOWN_MS } from '../lib/levelRaceLogic'
import { dealSplit, splitTap, splitCleared, splitRevealMs, SPLIT_LIVES } from '../lib/splitSignalLogic'
import usePhaseClock from '../hooks/usePhaseClock'
import { sounds } from '../lib/sounds'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { CountdownCover, PhaseBar, BoardHint, Lives } from '../components/memory/MemoryParts'

function toFound(raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw ?? {})) if (v) out[Number(String(k).replace(/^c/, ''))] = v
  return out
}

// Split Signal (co-op): one pattern, two halves. Each player sees only their own
// half lit during the reveal, then both rebuild the whole pattern on one shared
// board, each tapping the tiles they saw. A wrong tap (a blank tile, or one you did
// not see) costs a shared life and replays the level with a new pattern.
// Room state: games/{id}/mem = { level, seed, startAt, lives, found: { cell: seat } }.
export default function SplitSignalGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const mem = game.mem ?? {}
  const level = mem.level ?? 1
  const playing = game.status === 'playing'
  const seat = mySymbol === 'O' ? 'O' : 'X'
  const memPath = `games/${gameId}/mem`
  const deal = useMemo(() => (mem.seed != null ? dealSplit(level, levelRand(mem.seed, level)) : null), [mem.seed, level])
  // Stored as { c3: 'X' } (a 'c' prefix keeps Firebase from turning a dense map of
  // numeric keys into an array); used as { 3: 'X' }.
  const found = toFound(mem.found)
  const startAt = mem.startAt ?? null
  const revealMs = splitRevealMs(level)
  const { phase, left } = usePhaseClock(startAt, [['reveal', revealMs]], serverNow)
  const [flash, setFlash] = useState(null) // { cell, kind }

  useEffect(() => {
    if (!playing || mem.startAt != null || mem.seed == null) return
    runTransaction(ref(db, `${memPath}/startAt`), cur => cur ?? serverNow() + LEVEL_COUNTDOWN_MS).catch(() => {})
  }, [playing, mem.startAt, mem.seed, memPath])

  // One transaction on `mem` per move, so a wrong tap and a clear can never both
  // land; `step` returns the next mem and an optional `after` room patch (team
  // score, end of run) that is written once the transaction commits.
  const commit = async (step) => {
    let after = null
    try {
      const res = await runTransaction(ref(db, memPath), cur => {
        after = null
        if (!cur) return
        const out = step(cur)
        if (!out) return
        after = out.after ?? null
        return out.mem
      })
      if (res.committed && after) await update(ref(db, `games/${gameId}`), after)
    } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
  }

  const tap = (cell) => {
    if (!mySymbol || !deal || phase !== 'recall' || !playing) return
    const result = splitTap(deal, found, seat, cell)
    if (result === 'repeat') return
    const sig = `${mem.seed}:${level}`
    if (result === 'found') {
      sounds.step()
      setFlash({ cell, kind: 'found' })
      commit(cur => {
        if (`${cur.seed}:${cur.level}` !== sig) return null
        const nextFound = { ...toFound(cur.found), [cell]: seat }
        if (!splitCleared(deal, nextFound)) return { mem: { ...cur, found: { ...(cur.found ?? {}), [`c${cell}`]: seat } } }
        // Level cleared together: both scores count the team's levels.
        return {
          mem: { ...cur, level: cur.level + 1, seed: newSeed(), startAt: serverNow() + LEVEL_COUNTDOWN_MS, found: null, miss: null },
          after: { 'scores/X': (game.scores?.X || 0) + 1, 'scores/O': (game.scores?.O || 0) + 1 },
        }
      })
    } else {
      sounds.miss()
      setFlash({ cell, kind: 'wrong' })
      commit(cur => {
        if (`${cur.seed}:${cur.level}` !== sig) return null
        const lives = (cur.lives ?? SPLIT_LIVES) - 1
        // Co-op: the run ending is a shared result, so the room finishes as a draw.
        if (lives <= 0) return { mem: { ...cur, lives: 0, miss: { by: seat, cell } }, after: { status: 'finished', winner: 'draw' } }
        return { mem: { ...cur, lives, seed: newSeed(), startAt: serverNow() + LEVEL_COUNTDOWN_MS, found: null, miss: { by: seat, cell } } }
      })
    }
  }

  const partner = mySymbol === 'X' ? 'O' : 'X'
  const partnerName = (game.players?.[partner]?.name || 'PARTNER').toUpperCase()

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <p className="font-pixel text-[10px] text-center text-retro-text leading-relaxed">
          OUT OF LIVES · TOGETHER YOU CLEARED {Math.max(0, level - 1)} LEVEL{level - 1 === 1 ? '' : 'S'}
        </p>
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          onPlayAgain={!proposal ? onPlayAgain : null}
          onNewMatch={!proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  const mine = deal ? deal[seat] : []
  const total = deal ? deal.X.length + deal.O.length : 0
  const foundCount = Object.keys(found).length
  const hint = !mySymbol ? `TEAM ${foundCount}/${total}`
    : phase === 'countdown' ? ''
      : phase === 'reveal' ? `REMEMBER YOUR ${mine.length} TILE${mine.length === 1 ? '' : 'S'} — ${partnerName} SEES THE OTHERS`
        : `TAP THE TILES YOU SAW · TEAM ${foundCount}/${total}`

  return (
    <div className="space-y-4">
      {!mySymbol && <SpectatorCard game={game} />}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">LEVEL {level}</span>
        <Lives lives={mem.lives ?? SPLIT_LIVES} max={SPLIT_LIVES} />
      </div>
      {mem.miss && phase !== 'recall' && (
        <p className="font-pixel text-[8px] text-center text-retro-danger">
          {mem.miss.by === seat ? 'YOUR' : `${partnerName}'S`} WRONG TILE COST A LIFE — NEW PATTERN
        </p>
      )}
      <PhaseBar left={phase === 'reveal' ? left : null} total={revealMs} />
      <div className="relative bg-retro-surface border-2 border-retro-border rounded p-2.5">
        {phase === 'countdown' && <CountdownCover msLeft={left} label={`LEVEL ${level} · GET READY`} />}
        {deal && (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${deal.side}, minmax(0, 1fr))`, touchAction: 'manipulation' }}>
            {Array.from({ length: deal.side * deal.side }, (_, i) => {
              const lit = phase === 'reveal' && mine.includes(i)
              const by = found[i]
              const canTap = !!mySymbol && phase === 'recall' && !by
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!canTap}
                  onClick={() => tap(i)}
                  aria-label={`row ${Math.floor(i / deal.side) + 1}, column ${(i % deal.side) + 1}${lit ? ', lit' : by ? `, found by ${by}` : ''}`}
                  className={cn(
                    'aspect-square rounded border-2 transition-colors duration-150',
                    lit ? (seat === 'X' ? 'bg-retro-p1 border-retro-p1' : 'bg-retro-p2 border-retro-p2')
                      : by === 'X' ? 'bg-retro-tint-p1 border-retro-p1'
                        : by === 'O' ? 'bg-retro-tint-p2 border-retro-p2'
                          : 'bg-retro-card border-retro-border/60',
                    canTap && 'cursor-pointer hover:border-retro-text/40 press',
                    flash?.cell === i && flash.kind === 'wrong' && 'pairs-mismatch-shake border-retro-danger',
                  )}
                />
              )
            })}
          </div>
        )}
      </div>
      <BoardHint tone={phase === 'reveal' ? 'cta' : 'text'}>{hint}</BoardHint>
      {!opponentOnline && mySymbol && <OfflineNotice label="PARTNER" />}
    </div>
  )
}
