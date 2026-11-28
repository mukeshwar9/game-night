import { Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import Avatar from '../components/Avatar'
import { GameArt } from '../components/GameArt'
import VoicePanel from '../components/voice/VoicePanel'
import useBusy from '../hooks/useBusy'
import { GAME_TYPES, getPlayerTag } from '../lib/games'
import GameSearchInput from '../components/GameSearchInput'
import SearchEmpty from '../components/SearchEmpty'
import { suggestedSearchTerms } from '../lib/gameSearch'
import { effectiveCap, filterPartyGroups, groupPickerForParty, partyMembers, partyPresentMembers } from '../lib/partyLogic'
import { hostUidOf } from '../lib/night'
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
import { shellActive } from '../lib/partyShellLogic'
import { cn } from '@/lib/utils'

// The party lobby (party-first rooms): the game list filtered by how many are
// present, and one way to invite more. Who is here is the shell's header (tiles
// or strip) and nothing in this body repeats it. The host picks; a pick
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
  const [query, setQuery] = useState('')
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

  const searching = !!query.trim()
  const groupCount = (g) => g.all.length + g.rotate.length + g.short.length
  const shownGroups = filterPartyGroups(groups, query)
  const total = groupCount(groups)
  const noMatches = searching && groupCount(shownGroups) === 0

  const pickerGroups = (
    <>
      <GameSearchInput value={query} onChange={setQuery} placeholder={`Search ${total} games…`} testId="party-search" />
      {noMatches && (
        <SearchEmpty testId="party-search-empty" query={query} terms={suggestedSearchTerms(t => groupCount(filterPartyGroups(groups, t)) > 0)} onClear={() => setQuery('')} onSuggest={setQuery} />
      )}
      {(!searching || shownGroups.all.length > 0) && <PickerGroup
        testId="party-group-all" title={`EVERYONE PLAYS · ${shownGroups.all.length}`} tone="text-retro-win"
        games={shownGroups.all}
        onPick={canPick ? pick : null} picking={picking} showAll={searching}
      />}
      {shownGroups.rotate.length > 0 && (
        <PickerGroup
          testId="party-group-rotate" title={`TAKE TURNS · 2 PLAY, WINNER STAYS · ${shownGroups.rotate.length}`} tone="text-retro-p4"
          games={shownGroups.rotate}
          onPick={canPick ? pick : null} picking={picking} showAll={searching}
        />
      )}
      {shownGroups.short.length > 0 && (
        <details className="rounded border border-dashed border-retro-border px-3 py-2" data-testid="party-group-short">
          <summary className="cursor-pointer font-pixel text-[8px] tracking-wider text-retro-dim min-h-9 flex items-center">
            NEEDS MORE PLAYERS · {shownGroups.short.length}
          </summary>
          <ul className="space-y-1 pt-1">
            {shownGroups.short.map(({ cfg, short }) => (
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

      {amMember && !shellActive(game) && <VoicePanel game={game} gameId={gameId} />}

      {amMember && alone && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-4 text-center" data-testid="party-alone">
          <p className="font-pixel text-[8px] tracking-wider text-retro-cta">WHILE YOUR FRIENDS ARRIVE</p>
          <div className="space-y-1">
            <p className="font-mono text-[12px] text-retro-dim">Room code</p>
            <p data-testid="party-code" className="font-mono text-4xl font-bold tracking-[0.3em] text-retro-text select-all" aria-label={`Room code ${gameId}`}>{gameId}</p>
          </div>
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
          {/* The one invite entry point: its sheet holds friends, the link and the QR. */}
          <button type="button" onClick={onInvite || share} disabled={!onInvite && shareBusy} className="w-full min-h-12 bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-wider rounded hover:shadow-neon-cta transition press-card disabled:opacity-50">
            INVITE FRIENDS
          </button>
        </div>
      )}

      {alone && (
        <button type="button" onClick={() => setWarmUp(true)} className="w-full min-h-11 border border-dashed border-retro-border text-retro-dim font-pixel text-[8px] tracking-wider rounded hover:border-retro-cta/60 hover:text-retro-text transition press-card">
          WARM UP SOLO · 30 SEC
        </button>
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

      {/* Once friends are here, inviting is one quiet row (the header's empty
          seats open the same sheet). */}
      {amMember && !alone && members.length < cap && (
        <div className="flex items-center gap-2" data-testid="party-invite-row">
          <button type="button" onClick={onInvite || share} disabled={!onInvite && shareBusy} className="flex-1 min-h-11 border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition press-card disabled:opacity-50">
            INVITE FRIENDS
          </button>
          <span className="min-h-11 px-3 flex items-center border border-retro-border bg-retro-surface text-retro-text font-mono text-sm tracking-[0.2em] rounded" aria-label={`Room code ${gameId}`}>
            {gameId}
          </span>
        </div>
      )}
    </div>
  )
}

// Long groups (55 take-turns games, 67 for two) show their first few with a
// SHOW ALL toggle, so the lobby stays a lobby rather than a catalogue.
const GROUP_PREVIEW = 6

function PickerGroup({ testId, title, tone, games, onPick, picking, showAll = false }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded || showAll ? games : games.slice(0, GROUP_PREVIEW)
  return (
    <section className="space-y-2" data-testid={testId}>
      <p className={cn('font-pixel text-[8px] tracking-wider', tone)}>{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {shown.map(g => {
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
            </button>
          )
        })}
      </div>
      {!showAll && games.length > GROUP_PREVIEW && (
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
