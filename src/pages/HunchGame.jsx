import { useEffect, useRef } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  applyPlay, applySteady, clearedLevel, isRunOver, lowestCard, nextLevel, normalizeHunchRound,
  pileTop, startRun,
  HUNCH_REWARDS, HUNCH_TARGET_LEVEL,
} from '../lib/hunchLogic'
import { getServerNow } from '../hooks/useServerClock'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { CoopEndActions, CoopTeamBar } from '../components/CoopShell'

const newSeed = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

// One room transaction that moves `round` forward with `step(round)`. A
// cleared level adds one to the team score; the end of the run finishes the
// room (winner 'draw': co-op, nobody loses to anybody).
function commitRound(gameId, step) {
  return runTransaction(ref(db, `games/${gameId}`), current => {
    if (!current || current.gameType !== 'hunch' || current.status !== 'playing') return
    const next = step(current.round)
    if (!next) return
    const at = getServerNow()
    const out = { ...current, round: next, lastActivityAt: at }
    const before = normalizeHunchRound(current.round)
    if (clearedLevel(before, next)) {
      out.scores = { X: (current.scores?.X || 0) + 1, O: (current.scores?.O || 0) + 1 }
    }
    if (isRunOver(next)) {
      out.status = 'finished'
      out.winner = 'draw'
    }
    return out
  })
}

function Lives({ count }) {
  return (
    <span className="font-pixel text-[10px] text-retro-cta tracking-widest" aria-label={`${count} ${count === 1 ? 'life' : 'lives'}`}>
      {'♥'.repeat(Math.max(0, count)) || '—'}
    </span>
  )
}

function Card({ value, tone = 'mine', size = 'md', dim = false }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded border-2 font-pixel shrink-0 tabular-nums',
        size === 'xl' ? 'w-28 h-36 text-4xl' : size === 'sm' ? 'w-8 h-11 text-[10px]' : 'w-12 h-16 text-[15px]',
        tone === 'mine' && 'border-retro-p1 bg-retro-tint-p1 text-retro-p1',
        tone === 'lowest' && 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta',
        tone === 'pile' && 'border-retro-win bg-retro-card text-retro-win shadow-neon-win',
        tone === 'empty' && 'border-dashed border-retro-border bg-retro-card text-retro-dim',
        tone === 'out' && 'border-retro-border bg-retro-card text-retro-dim line-through',
        dim && 'opacity-60',
      )}
    >{value}</div>
  )
}

function CardBacks({ count }) {
  if (!count) return <span className="font-pixel text-[8px] text-retro-win tracking-widest">EMPTY</span>
  const shown = Math.min(count, 12)
  return (
    <div className="flex items-center" aria-label={`${count} ${count === 1 ? 'card' : 'cards'}`}>
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="w-3.5 h-5 -ml-1 first:ml-0 rounded-sm border border-retro-p2 bg-retro-tint-p2" aria-hidden="true" />
      ))}
      <span className="ml-2 font-pixel text-[10px] text-retro-p2">{count}</span>
    </div>
  )
}

// One line about what just happened, from `round.last`.
function lastLine(round, players, mySymbol) {
  const last = round?.last
  if (!last) return null
  const who = (seat) => (seat === mySymbol ? 'You' : players?.[seat]?.name || seat)
  const lostCards = [...(last.lost?.X || []), ...(last.lost?.O || [])].sort((a, b) => a - b)
  if (last.kind === 'mistake') return { tone: 'bad', text: `TOO SOON — ${lostCards.join(', ')} ${lostCards.length === 1 ? 'was' : 'were'} lower. −1 ♥` }
  if (last.kind === 'forgive') return { tone: 'win', text: `CROSSED IN FLIGHT — ${who(last.by)} played ${last.card} at the same moment. Life restored.` }
  if (last.kind === 'steady') return { tone: 'info', text: `STEADY — ${lostCards.join(' and ')} thrown out.` }
  return { tone: 'info', text: `${who(last.by)} played ${last.card}.` }
}

export default function HunchGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const [playing, runPlay] = useBusy()
  const [steadying, runSteady] = useBusy()
  const [advancing, runAdvance] = useBusy()
  const round = normalizeHunchRound(game?.round)
  const isSpectator = !mySymbol
  const partner = mySymbol === 'O' ? 'X' : 'O'
  const phase = round?.phase || null
  const myHand = !isSpectator ? round?.hands?.[mySymbol] || [] : []
  const myLowest = lowestCard(myHand)
  const partnerCount = round?.hands?.[partner]?.length || 0
  const top = pileTop(round)
  const partnerOffline = !isSpectator && opponentOnline === false
  const inPlay = game?.status === 'playing' && phase === 'play'

  // First observer deals the run: a room fresh from creation, PLAY AGAIN, NEW
  // MATCH or a switch carries a round without a phase (maybe just `best`).
  const needsRun = !!game && game.gameType === 'hunch' && game.status === 'playing' && !phase
  useEffect(() => {
    if (!needsRun) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.gameType !== 'hunch' || current.status !== 'playing' || current.round?.phase) return
      return { ...current, round: startRun({ seed: newSeed(), best: current.round?.best }), lastActivityAt: getServerNow() }
    }).catch(() => {})
  }, [needsRun, gameId])

  // Sounds follow the shared state so both phones hear the same thing.
  const lastKey = round?.last ? `${round.level}-${round.last.kind}-${round.last.at}-${round.last.card}` : ''
  const prev = useRef({ key: lastKey, phase })
  useEffect(() => {
    const was = prev.current
    prev.current = { key: lastKey, phase }
    if (!round) return
    if (was.phase === 'play' && phase === 'clear') { sounds.win(); return }
    if (was.phase === 'play' && phase === 'lost') { sounds.lose(); return }
    if (!lastKey || lastKey === was.key) return
    const kind = round.last?.kind
    if (kind === 'mistake') sounds.miss()
    else if (kind === 'steady' || kind === 'forgive') sounds.go()
    else if (kind === 'play') sounds.move(round.last.by)
  }, [lastKey, phase, round])

  const play = () => {
    if (playing || !inPlay || myLowest == null) return
    const card = myLowest
    runPlay(async () => {
      const result = await commitRound(gameId, r => applyPlay(r, { player: mySymbol, card, at: getServerNow() }))
      // Not committed: the hand changed under the tap (a mistake or STEADY
      // took the card). The board already shows why.
      if (!result.committed) sounds.wall()
    }, () => toast.error('PLAY FAILED — CHECK CONNECTION'))
  }

  const iHoldSteady = !!round?.steady?.[mySymbol]
  const partnerHoldsSteady = !!round?.steady?.[partner]
  const toggleSteady = () => {
    if (steadying || !inPlay) return
    const on = !iHoldSteady
    runSteady(async () => {
      await commitRound(gameId, r => applySteady(r, { player: mySymbol, on, at: getServerNow() }))
    }, () => toast.error('STEADY FAILED — CHECK CONNECTION'))
  }

  const advance = () => runAdvance(async () => {
    await commitRound(gameId, r => nextLevel(r))
  }, () => toast.error('NEXT LEVEL FAILED — CHECK CONNECTION'))

  if (!round || !phase) {
    return <div className="py-10 text-center font-pixel text-[10px] text-retro-dim arcade-blink">SHUFFLING…</div>
  }

  const teamStars = Math.min(game?.scores?.X || 0, game?.scores?.O || 0)
  const status = phase === 'won' ? 'RUN COMPLETE'
    : phase === 'lost' ? 'OUT OF LIVES'
      : phase === 'clear' ? `LEVEL ${round.level} CLEAR`
        : isSpectator ? 'SPECTATING'
          : partnerOffline ? 'PARTNER OFFLINE'
            : 'NO TALKING'
  const tone = phase === 'won' || phase === 'clear' ? 'win' : phase === 'lost' ? 'bad' : undefined
  const event = lastLine(round, game.players, mySymbol)
  const partnerName = game.players?.[partner]?.name || partner
  const nextReward = HUNCH_REWARDS[round.level]

  return (
    <div className="flex flex-col items-center gap-4 py-2 max-w-md mx-auto w-full">
      <CoopTeamBar
        game={game}
        mySymbol={mySymbol}
        opponentOnline={opponentOnline}
        status={status}
        tone={tone}
        stats={`TEAM ★ ${teamStars} · BEST LV ${round.best}`}
      />

      <div className="w-full grid grid-cols-3 items-center rounded border-2 border-retro-border bg-retro-card px-3 py-2">
        <span className="font-pixel text-[10px] text-retro-text tracking-widest">LV {round.level}<span className="text-retro-dim">/{HUNCH_TARGET_LEVEL}</span></span>
        <span className="text-center"><Lives count={round.lives} /></span>
        <span className="text-right font-pixel text-[9px] text-retro-p2 tracking-widest" aria-label={`${round.steadies} steady tokens`}>
          STEADY ◆{round.steadies}
        </span>
      </div>

      {/* Partner strip: card count only, plus their STEADY hold. */}
      {isSpectator ? (
        <div className="w-full flex items-center justify-between gap-2 px-1">
          {['X', 'O'].map(seat => (
            <div key={seat} className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[10px] text-retro-dim truncate max-w-[5rem]">{game.players?.[seat]?.name || seat}</span>
              <CardBacks count={round.hands[seat].length} />
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full flex items-center justify-between gap-2 px-1">
          <span className="font-mono text-[10px] text-retro-dim truncate">{partnerName} holds</span>
          <div className="flex items-center gap-2">
            <CardBacks count={partnerCount} />
            {partnerHoldsSteady && inPlay && (
              <span className="px-1.5 py-0.5 rounded border border-retro-p2 font-pixel text-[7px] text-retro-p2 tracking-widest animate-pulse">STEADY</span>
            )}
          </div>
        </div>
      )}

      {/* The pile. */}
      <div className="flex flex-col items-center gap-2" aria-live="polite">
        <span className="font-pixel text-[8px] text-retro-dim tracking-widest">PILE</span>
        <Card value={top || '—'} tone={top ? 'pile' : 'empty'} size="xl" />
        <p
          className={cn(
            'min-h-[2.5em] max-w-xs text-center font-mono text-[10px]',
            event?.tone === 'bad' ? 'text-retro-cta' : event?.tone === 'win' ? 'text-retro-win' : 'text-retro-dim',
          )}
          role="status"
        >{event?.text || (inPlay ? 'Play when it feels right. The pile must only go up.' : '')}</p>
      </div>

      {phase === 'clear' && (
        <div className="w-full rounded border-2 border-retro-win bg-retro-card p-4 text-center space-y-2 shadow-neon-win">
          <p className="font-pixel text-lg text-retro-win tracking-widest">LEVEL {round.level} CLEAR</p>
          <p className="font-mono text-[11px] text-retro-text">
            {round.reward === 'life' ? 'Reward: +1 life ♥' : round.reward === 'steady' ? 'Reward: +1 STEADY ◆' : 'Next up: one more card each.'}
          </p>
          {!isSpectator && (
            <button
              type="button"
              onClick={advance}
              disabled={advancing}
              className="min-h-11 px-5 py-2.5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] hover:shadow-neon-cta disabled:opacity-50"
            >{advancing ? 'DEALING…' : `DEAL LEVEL ${round.level + 1}`}</button>
          )}
        </div>
      )}

      {(phase === 'won' || phase === 'lost') && (
        <div className={cn(
          'w-full rounded border-2 p-4 text-center space-y-2',
          phase === 'won' ? 'border-retro-win bg-retro-card shadow-neon-win' : 'border-retro-cta bg-retro-tint-cta',
        )}>
          <p className={cn('font-pixel text-lg tracking-widest', phase === 'won' ? 'text-retro-win' : 'text-retro-cta')}>
            {phase === 'won' ? 'IN SYNC' : 'OUT OF SYNC'}
          </p>
          <p className="font-mono text-[11px] text-retro-text">
            {phase === 'won'
              ? `You cleared all ${HUNCH_TARGET_LEVEL} levels together.`
              : `You reached level ${round.level}. Best so far: level ${round.best}.`}
          </p>
        </div>
      )}

      {/* My hand + actions. */}
      {!isSpectator && phase === 'play' && (
        <>
          <div className="w-full">
            <p className="mb-1.5 font-pixel text-[8px] text-retro-dim tracking-widest">YOUR CARDS</p>
            <div className="flex flex-wrap gap-1.5" aria-label={`Your cards: ${myHand.join(', ') || 'none'}`}>
              {myHand.length === 0
                ? <span className="font-mono text-[10px] text-retro-win">All played — wait for your partner.</span>
                : myHand.map(c => <Card key={c} value={c} tone={c === myLowest ? 'lowest' : 'mine'} dim={c !== myLowest} />)}
            </div>
          </div>
          <div className="w-full grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={play}
              disabled={playing || !inPlay || myLowest == null}
              className="min-h-14 rounded bg-retro-cta text-retro-bg font-pixel text-[13px] tracking-widest hover:shadow-neon-cta active:scale-[0.98] disabled:opacity-40"
            >{playing ? 'PLAYING…' : myLowest == null ? 'DONE' : `PLAY ${myLowest}`}</button>
            <button
              type="button"
              onClick={toggleSteady}
              disabled={steadying || !inPlay || (!iHoldSteady && round.steadies <= 0) || myLowest == null && !iHoldSteady}
              aria-pressed={iHoldSteady}
              className={cn(
                'min-h-14 px-3 rounded border-2 font-pixel text-[9px] tracking-wider disabled:opacity-40',
                iHoldSteady ? 'border-retro-p2 bg-retro-tint-p2 text-retro-p2 shadow-neon-p2' : 'border-retro-border text-retro-text hover:border-retro-p2/60',
              )}
            >{steadying ? 'HOLDING…' : iHoldSteady ? (partnerHoldsSteady ? 'STEADY!' : 'HOLDING ◆') : `STEADY ◆${round.steadies}`}</button>
          </div>
          <p className="font-mono text-[9px] text-retro-dim text-center max-w-xs">
            {iHoldSteady
              ? 'Waiting for your partner to hold STEADY too. Tap again to let go.'
              : partnerHoldsSteady
                ? `${partnerName} wants to STEADY — hold it too and you each throw out your lowest card.`
                : nextReward
                  ? `Clear this level to earn ${nextReward === 'life' ? 'a life' : 'a STEADY'}.`
                  : 'No words, no chat. Emotes only.'}
          </p>
        </>
      )}

      {(phase === 'won' || phase === 'lost') && !isSpectator && (
        <CoopEndActions
          gameType="hunch"
          onPlayAgain={onPlayAgain}
          onNewMatch={onNewMatch}
          onSwitchGame={onSwitchGame}
          proposal={proposal}
          playAgainLabel="NEW RUN"
        />
      )}

      {partnerOffline && inPlay && (
        <p className="font-pixel text-[9px] text-retro-p2 text-center" role="status">PARTNER OFFLINE — THE PILE WAITS FOR THEM</p>
      )}
    </div>
  )
}
