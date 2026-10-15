// The party shell: a persistent header of P1–P4 tiles and a footer of chat and
// reactions around the game. Game.jsx mounts it OUTSIDE the gameType-keyed game
// tree, around both of its render branches, so it survives a game switch, BACK
// TO PARTY and the picker. Rules live in src/lib/partyShellLogic.js.
//
// The header has two views the player flips at any time (big tiles / a 64 pt
// face strip; never automatic) plus a minimise to a row of dots. The choice is
// remembered per device. Every tile carries data-seat-card={uid} so reactions
// and chat bubbles float up from the sender's face.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import Avatar from './Avatar'
import { cn } from '@/lib/utils'
import { memberPresent } from '../lib/nightLogic'
import {
  SHELL_VIEW_KEY, isPartyFamily, parseShellView, shellTiles, toggleShellMinimised, toggleShellView,
} from '../lib/partyShellLogic'

const EmoteBar = lazy(() => import('./EmoteBar'))

const SEAT_TEXT = ['text-retro-p1', 'text-retro-p2', 'text-retro-p3', 'text-retro-p4']
const SEAT_BORDER = ['border-retro-p1', 'border-retro-p2', 'border-retro-p3', 'border-retro-p4']
const SEAT_BG = ['bg-retro-p1', 'bg-retro-p2', 'bg-retro-p3', 'bg-retro-p4']

const MIC_OFF = <path d="M2 2l20 20M18.9 13.2A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M12 19v3" />

function Glyph({ children, size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function readView() {
  try { return parseShellView(localStorage.getItem(SHELL_VIEW_KEY)) } catch { return parseShellView(null) }
}

/** The tile's state words, in one place for the big tile and the strip face. */
function stateLabel(tile) {
  if (!tile.online) return 'AWAY'
  if (tile.seatState === 'watching') return 'WATCHING'
  return null
}

function Badges({ tile, status, size }) {
  return (
    <>
      {tile.isHost && (
        <span className="absolute -top-1 -left-1 px-1 rounded-sm bg-retro-cta text-retro-bg font-pixel text-[6px] leading-[10px]" data-testid="host-badge">HOST</span>
      )}
      {status?.inVoice && status.muted && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-retro-danger text-retro-bg flex items-center justify-center" style={{ width: size, height: size }} data-testid="mute-badge">
          <Glyph size={size - 4}>{MIC_OFF}</Glyph>
        </span>
      )}
    </>
  )
}

function ringClass(tile, status) {
  if (status?.speaking) return 'ring-2 ring-retro-win shadow-glow-dot'
  if (tile.turn) return 'ring-2 ring-retro-cta'
  return ''
}

function InviteTile({ onInvite, compact, seat }) {
  return (
    <button
      type="button"
      onClick={onInvite || undefined}
      disabled={!onInvite}
      aria-label={`Invite a friend to seat P${seat}`}
      data-testid="invite-tile"
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-retro-border text-retro-dim press disabled:opacity-60',
        compact ? 'w-12 h-12 shrink-0' : 'flex-1 min-w-0 h-24',
      )}
    >
      <span className="font-pixel text-base leading-none">+</span>
      {!compact && <span className="font-pixel text-[7px] tracking-wider">INVITE</span>}
    </button>
  )
}

function BigTile({ tile, status, me, onPerson }) {
  const i = (tile.seat - 1) % 4
  const label = stateLabel(tile)
  return (
    <button
      type="button"
      data-seat-card={tile.uid}
      data-testid="shell-tile"
      onClick={onPerson ? () => onPerson(tile) : undefined}
      aria-label={`${tile.name}${me ? ' (you)' : ''}, seat ${tile.seat}${label ? `, ${label.toLowerCase()}` : ''}`}
      className={cn(
        'relative flex-1 min-w-0 h-24 flex flex-col items-center gap-1 px-1 rounded border-2 bg-retro-card transition-colors',
        status?.video ? 'justify-end' : 'justify-center',
        tile.online ? SEAT_BORDER[i] : 'border-retro-border opacity-60',
        ringClass(tile, status),
      )}
    >
      <span className={cn('absolute top-0.5 right-1 font-pixel text-[6px]', SEAT_TEXT[i])}>P{tile.seat}</span>
      {status?.video
        ? <span className="absolute inset-0 overflow-hidden rounded-[3px]">{status.video}</span>
        : <span className="relative"><Avatar id={tile.avatar} size={48} /></span>}
      <span className={cn('relative w-full truncate font-pixel text-[7px] text-center', status?.video ? 'mt-auto bg-retro-bg/75 text-retro-text' : 'text-retro-text')}>{me ? 'YOU' : tile.name}</span>
      <span className="font-pixel text-[6px] text-retro-dim h-2">{label}</span>
      <Badges tile={tile} status={status} size={14} />
    </button>
  )
}

function StripFace({ tile, status, me, onPerson }) {
  const i = (tile.seat - 1) % 4
  const label = stateLabel(tile)
  return (
    <button
      type="button"
      data-seat-card={tile.uid}
      data-testid="shell-tile"
      onClick={onPerson ? () => onPerson(tile) : undefined}
      aria-label={`${tile.name}${me ? ' (you)' : ''}, seat ${tile.seat}${label ? `, ${label.toLowerCase()}` : ''}`}
      className="relative shrink-0 flex flex-col items-center gap-0.5 w-14"
    >
      <span className={cn('relative rounded border-2 bg-retro-card', tile.online ? SEAT_BORDER[i] : 'border-retro-border opacity-60', ringClass(tile, status))}>
        {status?.video
          ? <span className="block w-8 h-8 overflow-hidden rounded">{status.video}</span>
          : <Avatar id={tile.avatar} size={24} />}
        <Badges tile={tile} status={status} size={12} />
      </span>
      <span className="w-full truncate font-pixel text-[6px] text-retro-text text-center">{me ? 'YOU' : tile.name}</span>
    </button>
  )
}

function ViewToggle({ view, onToggle, onMinimise }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label={view === 'tiles' ? 'Switch to small faces' : 'Switch to big tiles'}
        data-testid="shell-view-toggle"
        className="min-h-9 min-w-9 flex items-center justify-center rounded border border-retro-border bg-retro-card text-retro-dim press"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {view === 'tiles'
            ? <><rect x="3" y="9" width="4" height="6" rx="1" /><rect x="10" y="9" width="4" height="6" rx="1" /><rect x="17" y="9" width="4" height="6" rx="1" /></>
            : <><rect x="3" y="4" width="8" height="7" rx="1" /><rect x="13" y="4" width="8" height="7" rx="1" /><rect x="3" y="13" width="8" height="7" rx="1" /><rect x="13" y="13" width="8" height="7" rx="1" /></>}
        </svg>
      </button>
      {onMinimise && (
        <button
          type="button"
          onClick={onMinimise}
          aria-label="Minimise the player row"
          data-testid="shell-minimise"
          className="min-h-9 min-w-9 flex items-center justify-center rounded border border-retro-border bg-retro-card text-retro-dim font-pixel text-[10px] press"
        >
          ▴
        </button>
      )}
    </span>
  )
}

/**
 * @param {object} props
 * @param {boolean} props.active           render the chrome (party rooms); children always render in the same slot
 * @param {any} props.game
 * @param {string} props.myUid
 * @param {string | null} props.hostUid
 * @param {boolean} props.inLobby
 * @param {(() => void) | null} [props.onInvite]
 * @param {object} [props.footer]          EmoteBar props (onSend, cooldown, onSendText, …)
 * @param {(tile: any) => void} [props.onPerson]
 * @param {Record<string, any>} [props.statusFor]  uid -> { speaking, muted, inVoice, video }
 * @param {import('react').ReactNode} [props.trailing] footer extras (the mic)
 * @param {import('react').ReactNode} [props.notice]   a strip that sits just above the footer (voice errors)
 * @param {import('react').ReactNode} props.children
 */
export default function PartyShell({ active, game, myUid, hostUid, inLobby, onInvite = null, footer = null, onPerson, statusFor, trailing = null, notice = null, children }) {
  const [view, setView] = useState(readView)
  useEffect(() => {
    try { localStorage.setItem(SHELL_VIEW_KEY, view) } catch { /* private mode */ }
  }, [view])

  const tiles = useMemo(() => shellTiles(game, { inLobby, hostUid }), [game, inLobby, hostUid])
  const family = isPartyFamily(game)
  const present = tiles.filter(t => t.uid && memberPresent(game, t.uid, family)).length
  const showFooter = active && !!footer && (game?.status !== 'waiting' || tiles.filter(t => t.uid).length >= 2)

  const seated = tiles.filter(t => !t.invite)
  const statusOf = (t) => (t.uid ? statusFor?.[t.uid] : undefined)

  // The wrapper and the children's slot are identical whether or not the chrome
  // shows, so a room that flips between party and plain never remounts the game.
  return (
    <div className="party-shell" data-testid={active ? 'party-shell' : undefined} data-view={view} data-present={present}>
      {active && <header
        className="sticky top-0 z-30 border-b border-retro-border bg-retro-bg/95 backdrop-blur pt-[env(safe-area-inset-top)]"
        data-testid="shell-header"
      >
        {view === 'tiles' && (
          <div className="px-2 pt-2 pb-1 space-y-1">
            <div className="flex gap-1.5">
              {tiles.map(t => (t.invite
                ? <InviteTile key={t.key} seat={t.seat} onInvite={onInvite} compact={false} />
                : <BigTile key={t.key} tile={t} me={t.uid === myUid} status={statusOf(t)} onPerson={onPerson} />))}
            </div>
            <div className="flex justify-end"><ViewToggle view={view} onToggle={() => setView(toggleShellView(view))} /></div>
          </div>
        )}
        {view === 'strip' && (
          <div className="flex items-center gap-1.5 px-2 h-16">
            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {tiles.map(t => (t.invite
                ? <InviteTile key={t.key} seat={t.seat} onInvite={onInvite} compact />
                : <StripFace key={t.key} tile={t} me={t.uid === myUid} status={statusOf(t)} onPerson={onPerson} />))}
            </div>
            <ViewToggle view={view} onToggle={() => setView(toggleShellView(view))} onMinimise={() => setView(toggleShellMinimised(view))} />
          </div>
        )}
        {view === 'mini' && (
          <button
            type="button"
            onClick={() => setView(toggleShellMinimised(view))}
            aria-label="Show the player row"
            data-testid="shell-expand"
            className="w-full h-[30px] flex items-center justify-center gap-2"
          >
            {seated.map(t => (
              <span
                key={t.key}
                data-seat-card={t.uid}
                className={cn('w-3 h-3 rounded-full', SEAT_BG[(t.seat - 1) % 4], !t.online && 'opacity-40', statusOf(t)?.speaking && 'ring-2 ring-retro-win', t.turn && 'ring-2 ring-retro-cta')}
              />
            ))}
            <span className="font-pixel text-[7px] text-retro-dim">▾</span>
          </button>
        )}
      </header>}

      <div className={showFooter ? 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]' : undefined}>{children}</div>

      {active && showFooter && (
        <footer
          className="fixed inset-x-0 bottom-0 z-30 border-t border-retro-border bg-retro-bg/95 backdrop-blur px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
          data-testid="shell-footer"
        >
          {notice && <div className="absolute bottom-full inset-x-0 px-2 pb-1 space-y-1" data-testid="shell-notice">{notice}</div>}
          <Suspense fallback={<div className="h-11" />}>
            <EmoteBar variant="footer" trailing={trailing} {...footer} />
          </Suspense>
        </footer>
      )}
    </div>
  )
}
