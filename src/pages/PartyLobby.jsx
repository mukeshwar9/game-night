import { Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import Avatar from '../components/Avatar'
import { GameArt } from '../components/GameArt'
import QrCode from '../components/QrCode'
import VoicePanel from '../components/voice/VoicePanel'
import useBusy from '../hooks/useBusy'
import { GAME_TYPES, getPlayerTag } from '../lib/games'
import { effectiveCap, groupPickerForParty, partyMembers, partyPresentMembers } from '../lib/partyLogic'
import { hostUidOf } from '../lib/night'
import { memberPresent } from '../lib/nightLogic'
import { recordFunnel } from '../lib/analytics'
import { track } from '../lib/track'
import { shareUrl } from '../lib/platform'
import { shareLink } from '../lib/share'
import { HEADLINE_GAMES } from '../lib/adLanding'
import { arrivalProgress, arrivingCount, inviteShareText, newcomerName } from '../lib/arrivalLogic'
import { sounds } from '../lib/sounds'
import useServerClock from '../hooks/useServerClock'
import { lazyWithRetry } from '../lib/lazyWithRetry'
import BottomSheet from '../components/BottomSheet'
import { seatedIds } from '../lib/roomLogic'

// The solo warm-up: a short reaction run against a bot, opened in a sheet so
// the host never leaves the room (leaving would read as offline to anyone who
// arrives meanwhile).
const WarmUp = lazyWithRetry(() => import('./demos/ReactionDemo'))

const HEADLINE_2P = HEADLINE_GAMES.map(h => h.type)
import { cn } from '@/lib/utils'

// The party lobby (party-first rooms): who is here, places to invite into,
// and the game list filtered by how many are present. The host picks; a pick
// switches the room through the shell's normal switch path (onSwitchGame),
// which seats a 2-player game's two and lines up the rest (winner stays).
export default function PartyLobby({ gameId, game, mySeat, isHost, onSwitchGame, onInvite }) {
  const members = partyMembers(game, true)
  const cap = effectiveCap(game, { nPlayer: true, maxPlayers: 4 })
  const present = partyPresentMembers(game, true)
  const n = Math.max(1, present.length)
  const hostUid = hostUidOf(game)
  const host = members.find(m => m.uid === hostUid)
  const groups = groupPickerForParty(GAME_TYPES, n)
  // Party games first (what a group gathers for); the headline 2P games lead
  // the take-turns list, so the short preview is the familiar ones.
  groups.all = [...groups.all.filter(g => g.category === 'party'), ...groups.all.filter(g => g.category !== 'party')]
  groups.rotate = [...HEADLINE_2P.map(t => groups.rotate.find(g => g.type === t)).filter(Boolean), ...groups.rotate.filter(g => !HEADLINE_2P.includes(g.type))]
  const [picking, setPicking] = useState(null)
  const [showQr, setShowQr] = useState(false)
  const [warmUp, setWarmUp] = useState(false)
  const [arrived, setArrived] = useState(null)
  const { now: clockNow } = useServerClock({ tickMs: 30_000 })
  const prevMembers = useRef(members)
  const [shareBusy, runShare] = useBusy()
  const [, runPick] = useBusy()
  const url = shareUrl(`/game/${gameId}`)
  const amMember = !!game?.players?.[mySeat]
  const canPick = isHost && amMember && !!onSwitchGame
  // Host alone: the lobby is a waiting room, not a game list.
  const alone = canPick && present.length <= 1
  const progress = arrivalProgress({ present: present.length, cap })
  const arrivingN = alone ? arrivingCount(game?.arriving, { now: clockNow, selfUid: mySeat, seatedUids: seatedIds(game?.players) }) : 0

  // Someone joined while the host waited (or warmed up): the return cue.
  const memberKey = members.map(m => m.uid).join(',')
  useEffect(() => {
    const name = newcomerName(prevMembers.current, members, mySeat)
    prevMembers.current = members
    if (!name) return undefined
    sounds.join()
    // Reacting to a Firebase snapshot (an external system) — one update per arrival.
    setWarmUp(false)
    setArrived(name)
    const t = setTimeout(() => setArrived(null), 5000)
    return () => clearTimeout(t)
    // Keyed on who is here, not every snapshot (chat, presence).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey])

  const pick = (type) => {
    if (!canPick) return
    setPicking(type)
    runPick(async () => { await onSwitchGame(type) }, () => toast.error("COULDN'T START THAT GAME — TRY AGAIN"))
      .finally(() => setPicking(null))
  }

  const share = () => runShare(async () => {
    const outcome = await shareLink({ text: inviteShareText({ hostName: host?.name, party: true }), url })
    if (outcome === 'shared') { recordFunnel('shared'); track('invite_shared', { surface: 'party_lobby', method: 'native_share' }); return }
    if (outcome === 'cancelled') return
    await navigator.clipboard.writeText(url)
    recordFunnel('shared')
    track('invite_shared', { surface: 'party_lobby', method: 'copy' })
    toast.success('LINK COPIED!')
  }, () => toast.error("COULDN'T SHARE — COPY THE LINK FROM THE ADDRESS BAR"))

  const slots = Array.from({ length: cap }, (_, i) => members[i] || null)

  const pickerGroups = (
    <>
      <PickerGroup
        testId="party-group-all" title={`EVERYONE PLAYS · ${groups.all.length}`} tone="text-retro-win"
        games={groups.all} chip={() => ({ label: `ALL ${n}`, tone: 'win' })}
        onPick={canPick ? pick : null} picking={picking}
      />
      {groups.rotate.length > 0 && (
        <PickerGroup
          testId="party-group-rotate" title={`TAKE TURNS · 2 PLAY, WINNER STAYS · ${groups.rotate.length}`} tone="text-retro-p4"
          games={groups.rotate} chip={() => ({ label: `2 + ${n - 2}`, tone: 'p4' })}
          onPick={canPick ? pick : null} picking={picking}
        />
      )}
      {groups.short.length > 0 && (
        <details className="rounded border border-dashed border-retro-border px-3 py-2" data-testid="party-group-short">
          <summary className="cursor-pointer font-pixel text-[8px] tracking-wider text-retro-dim min-h-9 flex items-center">
            NEEDS MORE PLAYERS · {groups.short.length}
          </summary>
          <ul className="space-y-1 pt-1">
            {groups.short.map(({ cfg, short }) => (
              <li key={cfg.type} className="flex items-center justify-between font-mono text-[11px] text-retro-dim">
                <span>{cfg.label}</span><span>+{short} {short === 1 ? 'player' : 'players'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )

  return (
    <div className="space-y-4" data-testid="party-lobby">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-[13px] text-retro-text text-glow-cta tracking-wider truncate">
          {host ? `${host.name.toUpperCase()}'S PARTY` : 'PARTY'}
        </h2>
        <span data-testid="party-count" className="font-pixel text-[8px] tracking-wider border rounded px-1.5 py-1 whitespace-nowrap text-retro-win border-retro-win/60 bg-retro-tint-p1">
          {members.length} / {cap}
        </span>
      </div>

      {arrived && (
        <div data-testid="party-arrived" role="status" className="seat-pop rounded border-2 border-retro-cta bg-retro-tint-cta px-3 py-2 text-center shadow-neon-cta">
          <p className="font-pixel text-[11px] text-retro-cta text-glow-cta tracking-wider break-words">{arrived} IS HERE!</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {slots.map((m, i) => m ? (
          <Member key={m.uid} member={m} here={memberPresent(game, m.uid, true)} isHost={m.uid === hostUid} isMe={m.uid === mySeat} popIn={!!arrived && m.name?.toUpperCase() === arrived} />
        ) : (
          <button
            key={`empty-${i}`}
            type="button"
            onClick={onInvite}
            disabled={!amMember || !onInvite}
            className="flex flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed border-retro-border min-h-[104px] text-retro-cta hover:border-retro-cta/60 transition press-card disabled:opacity-50"
          >
            <span className="seat-breathe font-pixel text-lg leading-none" aria-hidden="true">+</span>
            <span className="font-pixel text-[8px] tracking-wider">{alone && i === 1 ? 'SAVING A SEAT' : 'INVITE'}</span>
          </button>
        ))}
      </div>

      {amMember && <VoicePanel game={game} gameId={gameId} />}

      {amMember && members.length < cap && (
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-3" data-testid={alone ? 'party-alone' : undefined}>
          <p className={cn('font-pixel text-[8px] tracking-wider', alone ? 'text-retro-cta' : 'text-retro-dim')}>{alone ? 'WHILE YOUR FRIENDS ARRIVE' : 'BRING FRIENDS'}</p>
          {alone && (
            <div className="space-y-1.5">
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: progress.need }, (_, i) => (
                  <span key={i} className={cn('h-1.5 flex-1 rounded-sm', i < progress.present ? 'bg-retro-win' : 'bg-retro-border')} />
                ))}
              </div>
              <p data-testid="party-progress" className="font-pixel text-[8px] tracking-wider text-retro-text">
                {arrivingN > 0 ? 'SOMEONE OPENED YOUR LINK…' : progress.text}
              </p>
            </div>
          )}
          {onInvite && (
            <button type="button" onClick={onInvite} className="w-full min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] tracking-wider rounded hover:shadow-neon-cta transition press-card">
              INVITE FRIENDS
            </button>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={share} disabled={shareBusy} className="min-h-11 border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] rounded hover:border-retro-cta/60 transition press-card disabled:opacity-50">
              {shareBusy ? 'SHARING…' : 'LINK'}
            </button>
            <button type="button" onClick={() => setShowQr(v => !v)} aria-expanded={showQr} className="min-h-11 border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] rounded hover:border-retro-cta/60 transition press-card">
              QR
            </button>
            <span className="min-h-11 flex items-center justify-center border border-retro-border bg-retro-card text-retro-text font-mono text-[12px] tracking-[0.2em] rounded" aria-label={`Room code ${gameId}`}>
              {gameId}
            </span>
          </div>
          {showQr && <div className="flex justify-center"><QrCode value={url} size={160} /></div>}
          {alone && (
            <button type="button" onClick={() => setWarmUp(true)} className="w-full min-h-11 border border-retro-border bg-retro-surface text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition press-card">
              WARM UP SOLO · 30 SEC
            </button>
          )}
        </div>
      )}

      {warmUp && (
        <BottomSheet onClose={() => setWarmUp(false)} ariaLabel="Solo warm-up" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-pixel text-[10px] text-retro-text tracking-wider">WARM-UP · REACTION RUN</p>
            <button type="button" onClick={() => setWarmUp(false)} className="min-h-11 px-3 font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-text transition-colors">BACK TO PARTY</button>
          </div>
          <p className="font-mono text-[11px] text-retro-dim">This closes by itself when a friend arrives.</p>
          <Suspense fallback={null}><WarmUp /></Suspense>
        </BottomSheet>
      )}

      {alone ? null : canPick ? (
        <p className="text-center font-pixel text-[10px] text-retro-text">PICK A GAME FOR {n}</p>
      ) : (
        <div className="rounded border border-retro-cta/40 bg-retro-tint-cta p-3 flex items-center gap-3" data-testid="party-picking">
          {host && <Avatar id={host.avatar} size={24} />}
          <span className="flex-1 font-mono text-[11px] text-retro-text">
            <span className="text-retro-cta">{host?.name || 'The host'}</span> is picking a game…
          </span>
        </div>
      )}

      {alone ? (
        <details className="rounded border border-dashed border-retro-border px-3 py-2" data-testid="party-browse">
          <summary className="cursor-pointer font-pixel text-[8px] tracking-wider text-retro-dim min-h-9 flex items-center">
            BROWSE GAMES ANYWAY
          </summary>
          <div className="space-y-4 pt-2">{pickerGroups}</div>
        </details>
      ) : pickerGroups}
    </div>
  )
}

function Member({ member, here, isHost, isMe, popIn = false }) {
  return (
    <div data-testid="party-member" className={cn(popIn && 'seat-pop', 'flex flex-col items-center gap-1.5 rounded border border-retro-border bg-retro-card pt-3 pb-2 px-1 min-w-0 min-h-[104px]')}>
      <span className={cn('relative', !here && 'opacity-40 grayscale')}>
        <Avatar id={member.avatar} size={48} />
        {isHost && (
          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-retro-cta border-2 border-retro-card flex items-center justify-center" title="Host">
            <svg width="10" height="8" viewBox="0 0 12 10" aria-hidden="true" className="fill-retro-bg"><path d="M0 2h2v2h2V0h4v4h2V2h2v8H0z" /></svg>
          </span>
        )}
        <span className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-card', here ? 'bg-retro-win' : 'bg-retro-dim')} />
      </span>
      <span className="font-mono text-[11px] text-retro-text truncate max-w-full">{member.name}{isMe ? ' (you)' : ''}</span>
      <span className={cn('font-pixel text-[7px] tracking-wider', isHost ? 'text-retro-cta' : 'text-retro-dim')}>
        {isHost ? 'HOST' : here ? 'READY' : 'RECONNECTING…'}
      </span>
    </div>
  )
}

const CHIP_TONE = {
  win: 'text-retro-win border-retro-win/60 bg-retro-tint-p1',
  p4: 'text-retro-p4 border-retro-p4/50 bg-retro-tint-p4',
}

// Long groups (55 take-turns games, 67 for two) show their first few with a
// SHOW ALL toggle, so the lobby stays a lobby rather than a catalogue.
const GROUP_PREVIEW = 6

function PickerGroup({ testId, title, tone, games, chip, onPick, picking }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? games : games.slice(0, GROUP_PREVIEW)
  return (
    <section className="space-y-2" data-testid={testId}>
      <p className={cn('font-pixel text-[8px] tracking-wider', tone)}>{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {shown.map(g => {
          const c = chip(g)
          const Icon = g.Icon
          return (
            <button
              key={g.type}
              type="button"
              data-game={g.type}
              onClick={onPick ? () => onPick(g.type) : undefined}
              disabled={!onPick || !!picking}
              aria-label={onPick ? `Play ${g.label}` : g.label}
              className={cn(
                'w-full min-h-14 flex items-center gap-2.5 px-2.5 py-2 text-left border rounded transition',
                picking === g.type ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta' : 'border-retro-border bg-retro-card',
                onPick && 'hover:border-retro-cta/50 press-card',
                !onPick && 'cursor-default',
                picking && picking !== g.type && 'opacity-40',
              )}
            >
              <span aria-hidden="true" className="relative w-8 h-8 shrink-0 rounded-lg overflow-hidden flex items-center justify-center border border-retro-border text-retro-text">
                {Icon && <Icon />}
                <GameArt type={g.type} className="absolute inset-0 w-full h-full block" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-pixel text-[9px] text-retro-text leading-snug">{picking === g.type ? 'STARTING…' : g.label}</span>
                <span className="block font-mono text-[10px] text-retro-dim mt-0.5 truncate">
                  <span className={g.nPlayer ? 'text-retro-p2' : undefined}>{getPlayerTag(g)}</span>
                  {g.durationMin != null && ` · ~${g.durationMin} min`}
                </span>
              </span>
              <span className={cn('font-pixel text-[7px] tracking-wider border rounded px-1.5 py-1 whitespace-nowrap', CHIP_TONE[c.tone])}>{c.label}</span>
            </button>
          )
        })}
      </div>
      {games.length > GROUP_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="w-full min-h-11 border border-retro-border rounded font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text hover:border-retro-cta/50 transition"
        >
          {expanded ? 'SHOW FEWER' : `SHOW ALL ${games.length}`}
        </button>
      )}
    </section>
  )
}
