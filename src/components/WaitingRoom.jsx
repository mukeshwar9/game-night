import { useState } from 'react'
import { toast } from 'sonner'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { getGameConfig, usesFirstMover, firstMoverUpdates, resolveGoesFirst } from '../lib/games'
import { MODES as PONG_MODES, MULTIPLAYER_MODES as PONG_MODE_IDS, getMode as getPongMode } from '../lib/pongLogic'
import { UPDRAFT_MODES, UPDRAFT_MODE_IDS, getUpdraftMode } from '../lib/updraftConfig'
import ArrowsDifficultyPicker from './ArrowsDifficultyPicker'
import QrCode from './QrCode'
import InviteFriendModal from './InviteFriendModal'
import PixelDots from './loading/PixelDots'
import Avatar from './Avatar'
import GameSwitcher from './GameSwitcher'
import TimerScalePicker from './TimerScalePicker'
import { amHost } from '../lib/night'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'
import { ARCHERY_FORMATS, archeryFormat } from '../lib/archeryLogic'
import { recordFunnel } from '../lib/analytics'
import { shareUrl } from '../lib/platform'
import { shareLink } from '../lib/share'
import PushNudge from './PushNudge'
import { waitingForLabel } from '../lib/roomLogic'

const PONG_MATCH_OPTIONS = [3, 5, 7]

export default function WaitingRoom({ gameId, gameType, game, mySymbol, onSwitch, opponentOnline }) {
  const inviteUrl = shareUrl(`/game/${gameId}`)
  const label = getGameConfig(gameType)?.label
  const waitingFor = waitingForLabel(!!getGameConfig(gameType)?.coop)
  const [showInvite, setShowInvite] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [matchLengthBusy, setMatchLengthBusy] = useState(false)
  const [shareBusy, runShare] = useBusy()
  const [startBusy, runStart] = useBusy()
  const [pongModeBusy, runPongMode] = useBusy()
  const [archeryFormatBusy, runArcheryFormat] = useBusy()
  const [pendingPongMode, setPendingPongMode] = useState(null)

  // Lobby (challenge-created) rooms get a game picker + generalized START
  // that works for any game type; legacy/link-created rooms (no `lobby`
  // flag) render exactly as before — see CLAUDE.md's lobby data-model delta.
  const isLobby = !!game?.lobby
  const bothSeated = !!(game?.players?.X && game?.players?.O)
  const pickFirst = usesFirstMover(gameType) && bothSeated
  const seated = mySymbol === 'X' || mySymbol === 'O'
  const goesFirst = game?.goesFirst === 'O' || game?.goesFirst === 'random' ? game.goesFirst : 'X'
  const nameX = (game?.players?.X?.name || 'PLAYER 1').toUpperCase()
  const nameO = (game?.players?.O?.name || 'PLAYER 2').toUpperCase()
  const xOnline = mySymbol === 'X' ? true : mySymbol === 'O' ? opponentOnline !== false : game?.presence?.X?.online !== false
  const oOnline = mySymbol === 'O' ? true : mySymbol === 'X' ? opponentOnline !== false : game?.presence?.O?.online !== false
  const readyToPlay = pickFirst || (isLobby && bothSeated)

  const isPongHost = gameType === 'pong' && mySymbol === 'X'
  const matchLength = game?.matchLength ?? 3
  const pongMode = getPongMode(game?.pongMode).id

  // UPDRAFT versus: CHAOS (default) or PURE, the creator's pick; kept in the
  // round node so a rematch keeps it (updraftFreshState).
  const isUpdraftHost = gameType === 'updraft' && mySymbol === 'X'
  const updraftMode = getUpdraftMode(game?.updraft?.mode)
  const [updraftModeBusy, runUpdraftMode] = useBusy()
  const [pendingUpdraftMode, setPendingUpdraftMode] = useState(null)
  const setUpdraftMode = (id) => {
    if (id === updraftMode) return
    setPendingUpdraftMode(id)
    runUpdraftMode(
      () => update(ref(db, `games/${gameId}`), { 'updraft/mode': id }),
      () => toast.error("COULDN'T SET THE MODE — TRY AGAIN"),
    ).finally(() => setPendingUpdraftMode(null))
  }

  const setPongMode = (id) => {
    if (id === pongMode) return
    setPendingPongMode(id)
    runPongMode(
      () => update(ref(db, `games/${gameId}`), { pongMode: id }),
      () => toast.error("COULDN'T SET THE MODE — TRY AGAIN"),
    ).finally(() => setPendingPongMode(null))
  }

  const setArcheryFormat = (format) => {
    if (format === archeryFormat(game?.archeryFormat)) return
    runArcheryFormat(async () => {
      await update(ref(db, `games/${gameId}`), { archeryFormat: format })
    }, () => toast.error('COULDN\'T SET RANGE FORMAT — TRY AGAIN'))
  }

  const setMatchLength = async (n) => {
    setMatchLengthBusy(true)
    try {
      await update(ref(db, `games/${gameId}`), { matchLength: n })
    } catch {
      toast.error("COULDN'T SET MATCH LENGTH — TRY AGAIN")
    } finally {
      setMatchLengthBusy(false)
    }
  }

  const setGoesFirst = async (value) => {
    if (!seated || goesFirst === value) return
    setMatchLengthBusy(true)
    try {
      await update(ref(db, `games/${gameId}`), { goesFirst: value })
    } catch {
      toast.error("COULDN'T SET WHO GOES FIRST — TRY AGAIN")
    } finally {
      setMatchLengthBusy(false)
    }
  }

  const startMatch = () => runStart(async () => {
    const starter = resolveGoesFirst(goesFirst)
    await update(ref(db, `games/${gameId}`), {
      status: 'playing',
      ...(isLobby ? { lobby: null } : {}),
      ...firstMoverUpdates(gameType, starter),
      lastActivityAt: Date.now(),
    })
  }, () => toast.error("COULDN'T START — TRY AGAIN"))

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = inviteUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    recordFunnel('shared')
    toast.success('LINK COPIED!')
  }

  const shareInvite = async () => {
    const outcome = await shareLink({ text: 'Join my Game Night room!', url: inviteUrl })
    if (outcome === 'shared') { recordFunnel('shared'); return }
    if (outcome === 'cancelled') return
    copyLink()
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      {isLobby ? (
        <div className="w-full bg-retro-card border border-retro-border rounded p-4 flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
            <div className="relative">
              <Avatar id={game?.players?.X?.avatar} size={44} />
              <span
                className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-card', xOnline ? 'bg-retro-win' : 'bg-retro-dim')}
                title={xOnline ? 'Online' : 'Offline'}
              />
            </div>
            <p className="font-mono text-xs text-retro-text truncate max-w-full">{nameX}</p>
          </div>
          <span className="font-pixel text-[10px] text-retro-cta text-glow-cta shrink-0">VS</span>
          <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
            {bothSeated ? (
              <>
                <div className="relative">
                  <Avatar id={game?.players?.O?.avatar} size={44} />
                  <span
                    className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-card', oOnline ? 'bg-retro-win' : 'bg-retro-dim')}
                    title={oOnline ? 'Online' : 'Offline'}
                  />
                </div>
                <p className="font-mono text-xs text-retro-text truncate max-w-full">{nameO}</p>
              </>
            ) : (
              <>
                <div className="w-11 h-11 rounded-full border-2 border-dashed border-retro-border flex items-center justify-center animate-pulse">
                  <span className="font-pixel text-sm text-retro-dim">?</span>
                </div>
                <p className="font-pixel text-[8px] text-retro-dim tracking-wider">WAITING…</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <PixelDots size="lg" tone="cta" glow />
      )}

      {/* Status text */}
      <div className="text-center space-y-1">
        <p className="font-pixel text-xs text-retro-text">
          {readyToPlay ? 'READY TO PLAY' : waitingFor}
        </p>
        {/* The room line above already names the game (lobbies show it in
            their GAME row), and SHARE INVITE LINK says what to do next, so a
            plain waiting room needs no hint line. */}
        {(readyToPlay || isLobby) && (
          <p className="font-mono text-xs text-retro-dim">
            {readyToPlay
              ? (pickFirst ? 'choose who goes first, then start' : 'pick a game, then start')
              : 'chat while you wait — pick a game anytime'}
          </p>
        )}
      </div>

      {/* Lobby-only: live game picker, works pre-game with no proposal handshake */}
      {isLobby && (
        <div className="w-full bg-retro-card border border-retro-border rounded p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-pixel text-[8px] text-retro-dim tracking-wider">GAME</p>
            <p className="font-pixel text-[11px] text-retro-p1 text-glow-p1 truncate">{label}</p>
          </div>
          {seated && (
            <GameSwitcher variant="button" currentType={gameType} onSwitch={onSwitch} />
          )}
        </div>
      )}

      {pickFirst && (
        <div className="w-full bg-retro-card border border-retro-border rounded p-3 space-y-3 text-center">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">WHO GOES FIRST</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {[
              { id: 'X', label: nameX },
              { id: 'O', label: nameO },
              { id: 'random', label: 'RANDOM' },
            ].map(opt => (
              <button
                key={opt.id}
                disabled={!seated || matchLengthBusy || startBusy}
                onClick={() => setGoesFirst(opt.id)}
                className={cn(
                  'min-h-11 px-3 font-pixel text-[9px] rounded border-2 transition press max-w-[9rem] truncate',
                  goesFirst === opt.id
                    ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                    : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
                  (!seated || matchLengthBusy || startBusy) && 'opacity-60 cursor-not-allowed',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {seated ? (
            <button
              onClick={startMatch}
              disabled={startBusy}
              className="w-full min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
                hover:shadow-neon-cta transition press disabled:opacity-50"
            >
              {startBusy ? 'STARTING…' : 'START GAME'}
            </button>
          ) : (
            <p className="font-pixel text-[8px] text-retro-dim/70">WAITING FOR A PLAYER TO START</p>
          )}
        </div>
      )}

      {gameType === 'archery' && (
        <div className="w-full space-y-2 rounded border border-retro-border bg-retro-card p-3 text-center">
          <p className="font-pixel text-[9px] tracking-wider text-retro-dim">RANGE FORMAT · HOST PICKS</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(ARCHERY_FORMATS).map(([id, format]) => (
              <button key={id} type="button" disabled={mySymbol !== 'X' || archeryFormatBusy || startBusy}
                onClick={() => setArcheryFormat(id)}
                className={cn('min-h-11 rounded border-2 px-1 font-pixel text-[8px] transition',
                  archeryFormat(game?.archeryFormat) === id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta' : 'border-retro-border bg-retro-surface text-retro-dim',
                  (mySymbol !== 'X' || archeryFormatBusy) && 'opacity-60')}
              >{format.label}<span className="mt-1 block text-[7px] opacity-80">{format.ends} × 3</span></button>
            ))}
          </div>
          {mySymbol !== 'X' && <p className="font-pixel text-[8px] text-retro-dim/70">X PICKS THE RANGE LENGTH</p>}
        </div>
      )}

      {/* Lobby games that don't use the WHO GOES FIRST picker (realtime/
          simultaneous types, or a solo challenger before the second seat
          fills) still get a START — generalized: enabled once both are
          seated, disabled with a hint otherwise. */}
      {!pickFirst && isLobby && (
        <div className="w-full bg-retro-card border border-retro-border rounded p-3 text-center">
          {seated ? (
            <button
              onClick={startMatch}
              disabled={startBusy || !bothSeated}
              className="w-full min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
                hover:shadow-neon-cta transition press disabled:opacity-50"
            >
              {startBusy ? 'STARTING…' : bothSeated ? 'START GAME' : waitingFor}
            </button>
          ) : (
            <p className="font-pixel text-[8px] text-retro-dim/70">WAITING FOR A PLAYER TO START</p>
          )}
        </div>
      )}

      {/* Pong mode selector (creator only) */}
      {gameType === 'pong' && (
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2 text-center">
          <p className="font-pixel text-[9px] text-retro-dim">MODE</p>
          <div className="grid grid-cols-2 gap-2">
            {PONG_MODE_IDS.map(id => (
              <button
                key={id}
                disabled={!isPongHost || pongModeBusy}
                onClick={() => setPongMode(id)}
                className={cn(
                  'min-h-11 px-2 py-1.5 font-pixel rounded border-2 transition press',
                  pongMode === id
                    ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                    : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
                  (!isPongHost || pongModeBusy) && 'opacity-60 cursor-not-allowed',
                )}
              >
                <span className="block text-[10px]">{pendingPongMode === id ? 'SETTING…' : PONG_MODES[id].label}</span>
                <span className="block mt-1 text-[8px] leading-snug opacity-80">{PONG_MODES[id].blurb}</span>
              </button>
            ))}
          </div>
          {!isPongHost && (
            <p className="font-pixel text-[8px] text-retro-dim/70">HOST PICKS THE MODE</p>
          )}
        </div>
      )}

      {/* Updraft mode selector (creator only) */}
      {gameType === 'updraft' && (
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2 text-center">
          <p className="font-pixel text-[9px] text-retro-dim">MODE</p>
          <div className="grid grid-cols-2 gap-2">
            {UPDRAFT_MODE_IDS.map(id => (
              <button
                key={id}
                disabled={!isUpdraftHost || updraftModeBusy}
                onClick={() => setUpdraftMode(id)}
                aria-pressed={updraftMode === id}
                className={cn(
                  'min-h-11 px-2 py-1.5 font-pixel rounded border-2 transition press',
                  updraftMode === id
                    ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                    : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
                  (!isUpdraftHost || updraftModeBusy) && 'opacity-60 cursor-not-allowed',
                )}
              >
                <span className="block text-[10px]">{pendingUpdraftMode === id ? 'SETTING…' : UPDRAFT_MODES[id].label}</span>
                <span className="block mt-1 text-[8px] leading-snug opacity-80">{UPDRAFT_MODES[id].blurb}</span>
              </button>
            ))}
          </div>
          {!isUpdraftHost && (
            <p className="font-pixel text-[8px] text-retro-dim/70">HOST PICKS THE MODE</p>
          )}
        </div>
      )}

      {/* Arrows difficulty (creator only) */}
      {gameType === 'arrows' && (
        <ArrowsDifficultyPicker gameId={gameId} game={game} isHost={mySymbol === 'X'} />
      )}

      {/* Pong match-length selector (creator only) */}
      {gameType === 'pong' && (
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2 text-center">
          <p className="font-pixel text-[9px] text-retro-dim">ROUNDS TO WIN MATCH</p>
          <div className="flex justify-center gap-2">
            {PONG_MATCH_OPTIONS.map(n => (
              <button
                key={n}
                disabled={!isPongHost || matchLengthBusy}
                onClick={() => setMatchLength(n)}
                className={cn(
                  'px-4 py-1.5 font-pixel text-[10px] rounded border-2 transition press',
                  matchLength === n
                    ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                    : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
                  (!isPongHost || matchLengthBusy) && 'opacity-60 cursor-not-allowed',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {!isPongHost && (
            <p className="font-pixel text-[8px] text-retro-dim/70">HOST PICKS THE LENGTH</p>
          )}
        </div>
      )}

      {/* Share-first: on a phone the host sends a link, they don't scan their
          own screen. One full-width primary action; under it one quiet row:
          the code big enough to read aloud, then QR and friend invites.
          COPY LINK was a third way to do what SHARE already does (the share
          sheet has Copy, and with no share sheet SHARE copies). */}
      <div className="w-full space-y-2">
        <button
          onClick={() => runShare(shareInvite)}
          disabled={shareBusy}
          className="w-full min-h-12 bg-retro-cta text-retro-bg font-pixel text-[11px] tracking-widest rounded
            hover:shadow-neon-cta transition press-card disabled:opacity-50"
        >
          {shareBusy ? 'SHARING…' : 'SHARE INVITE LINK'}
        </button>
        <div className="flex items-center gap-2 border-t border-retro-border/60 pt-3">
          <button
            onClick={() => runShare(copyLink)}
            disabled={shareBusy}
            aria-label={`Room code ${gameId}. Copy invite link`}
            title="Copy invite link"
            className="flex-1 min-w-0 min-h-11 text-left rounded transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            <span className="block font-pixel text-[8px] text-retro-dim tracking-wider">ROOM CODE</span>
            <span className="block font-pixel text-base text-retro-p1 tracking-[0.25em] mt-1">{gameId}</span>
          </button>
          <button
            onClick={() => setShowQr(v => !v)}
            aria-expanded={showQr}
            className="shrink-0 min-h-11 px-3 border border-retro-border rounded font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-text"
          >
            {showQr ? 'HIDE QR' : 'QR'}
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="shrink-0 min-h-11 px-3 flex items-center justify-center gap-2 border border-retro-border text-retro-text
              font-pixel text-[9px] tracking-wider rounded hover:border-retro-p1 transition press"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            FRIENDS
          </button>
        </div>
      </div>

      {/* The host is about to switch apps to send the link: offer the ping
          that brings them back when the friend joins (functions/push.js). */}
      {mySymbol === 'X' && !bothSeated && !isLobby && (
        <PushNudge spot="room" text="Get a ping when your friend joins, so you can leave the app while you wait." />
      )}

      {showQr && (
        <div className="flex flex-col items-center gap-1.5">
          <div className="bg-white p-2 rounded">
            <QrCode value={inviteUrl} size={150} />
          </div>
          <p className="font-pixel text-[9px] text-retro-dim">SCAN TO JOIN</p>
        </div>
      )}

      {/* Room timer scale (host picks NORMAL / RELAXED / OFF; everyone
          sees it). A room preference that survives switches and rematches,
          so it sits under the invite — inviting is the job of this screen. */}
      <TimerScalePicker gameId={gameId} game={game} canEdit={amHost(game)} />

      {showInvite && (
        <InviteFriendModal gameId={gameId} gameType={gameType} onClose={() => setShowInvite(false)} />
      )}

    </div>
  )
}
