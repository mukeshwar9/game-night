import { useState } from 'react'
import { toast } from 'sonner'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { getGameConfig, usesFirstMover, firstMoverUpdates, resolveGoesFirst } from '../lib/games'
import QrCode from './QrCode'
import InviteFriendModal from './InviteFriendModal'
import PixelDots from './loading/PixelDots'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

const PONG_MATCH_OPTIONS = [3, 5, 7]

export default function WaitingRoom({ gameId, gameType, game, mySymbol }) {
  const shareUrl = `${window.location.origin}/game/${gameId}`
  const label = getGameConfig(gameType)?.label
  const [showInvite, setShowInvite] = useState(false)
  const [matchLengthBusy, setMatchLengthBusy] = useState(false)
  const [shareBusy, runShare] = useBusy()
  const [startBusy, runStart] = useBusy()

  const bothSeated = !!(game?.players?.X && game?.players?.O)
  const pickFirst = usesFirstMover(gameType) && bothSeated
  const seated = mySymbol === 'X' || mySymbol === 'O'
  const goesFirst = game?.goesFirst === 'O' || game?.goesFirst === 'random' ? game.goesFirst : 'X'
  const nameX = (game?.players?.X?.name || 'PLAYER 1').toUpperCase()
  const nameO = (game?.players?.O?.name || 'PLAYER 2').toUpperCase()

  const isPongHost = gameType === 'pong' && mySymbol === 'X'
  const matchLength = game?.matchLength ?? 3

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
      ...firstMoverUpdates(gameType, starter),
      lastActivityAt: Date.now(),
    })
  }, () => toast.error("COULDN'T START — TRY AGAIN"))

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = shareUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    toast.success('LINK COPIED!')
  }

  const shareInvite = async () => {
    const data = { title: 'Game Night', text: 'Join my Game Night room!', url: shareUrl }
    if (navigator.share) {
      try { await navigator.share(data); return } catch { /* cancelled — ignore */ }
    }
    copyLink()
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <PixelDots size="lg" tone="cta" glow />

      {/* Status text + game label */}
      <div className="text-center space-y-1">
        <p className="font-pixel text-xs text-retro-text">
          {pickFirst ? 'READY TO PLAY' : 'WAITING FOR OPPONENT'}
        </p>
        {label && (
          <p className="font-pixel text-[10px] text-retro-dim">· {label} ·</p>
        )}
        <p className="font-mono text-xs text-retro-dim">
          {pickFirst ? 'choose who goes first, then start' : 'share the link to invite a friend'}
        </p>
      </div>

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
                  'min-h-11 px-3 font-pixel text-[9px] rounded border-2 transition-all active:scale-95 max-w-[9rem] truncate',
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
                hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {startBusy ? 'STARTING…' : 'START GAME'}
            </button>
          ) : (
            <p className="font-pixel text-[7px] text-retro-dim/70">WAITING FOR A PLAYER TO START</p>
          )}
        </div>
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
                  'px-4 py-1.5 font-pixel text-[10px] rounded border-2 transition-all active:scale-95',
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
            <p className="font-pixel text-[7px] text-retro-dim/70">HOST PICKS THE LENGTH</p>
          )}
        </div>
      )}

      {/* QR code */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="bg-white p-2 rounded">
          <QrCode value={shareUrl} size={150} />
        </div>
        <p className="font-pixel text-[9px] text-retro-dim">SCAN TO JOIN</p>
      </div>

      {/* Share + Copy buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => runShare(shareInvite)}
          disabled={shareBusy}
          className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
            hover:shadow-neon-cta transition-all active:scale-95 shadow-neon-cta disabled:opacity-50"
        >
          SHARE
        </button>
        <button
          onClick={() => runShare(copyLink)}
          disabled={shareBusy}
          className="px-4 py-2 bg-retro-card border border-retro-border text-retro-dim
            font-pixel text-[10px] rounded hover:text-retro-text hover:border-retro-p1
            transition-all active:scale-95 disabled:opacity-50"
        >
          COPY
        </button>
      </div>

      {/* Invite a friend directly */}
      <button
        onClick={() => setShowInvite(true)}
        className="flex items-center gap-2 px-4 py-2 bg-retro-card border border-retro-p1/40 text-retro-p1
          font-pixel text-[10px] rounded hover:border-retro-p1 hover:shadow-neon-p1 transition-all active:scale-95"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        INVITE A FRIEND
      </button>

      {/* URL row */}
      <div className="w-full bg-retro-card border border-retro-border rounded p-3 flex items-center gap-2">
        <p className="text-retro-dim text-xs font-mono truncate flex-1">{shareUrl}</p>
      </div>

      {showInvite && (
        <InviteFriendModal gameId={gameId} gameType={gameType} onClose={() => setShowInvite(false)} />
      )}

      {/* Room code */}
      <p className="font-pixel text-[10px] text-retro-dim">
        CODE: <span className="text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
      </p>
    </div>
  )
}
