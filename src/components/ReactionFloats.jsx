import { Suspense, useState } from 'react'
import { lazyWithRetry } from '../lib/lazyWithRetry'
import { isQuickChat } from '../lib/emotes'
import { floatAnchor } from '../lib/chatUiLogic'
import { pixelEmoteFor } from '../lib/pixelEmotes'
import PixelEmote from './PixelEmote'
import { cn } from '@/lib/utils'
import './ReactionFloats.css'

const AnimatedEmoji = lazyWithRetry(() => import('./AnimatedEmoji'))

// Which side of the screen a sender belongs to: X left, O right, everyone
// else (spectators, party seats keyed by uid) centre.
function sideOf(f) {
  const seat = f.kind === 'chat' ? f.seat : (f.spectator ? null : f.by)
  return seat === 'X' ? 'left' : seat === 'O' ? 'right' : 'center'
}

function seatOf(f) {
  return f.kind === 'chat' ? f.seat : (f.spectator ? null : f.by)
}

// One float, anchored to the sender's player card (PlayerCard's
// data-seat-card) when it is on screen — a reaction pops over the card,
// a chat line hangs just below it — so nothing lands on the middle of the
// board. Without a visible card it falls back to a band near the top of the
// screen on the sender's side (floatAnchor).
//
// The motion is on the inner element (`.emote-float`); with reduced motion
// that class drops the animation and simply shows the float until the hook
// removes it, instead of jumping to the keyframes' invisible last frame.
function anchorFor(f) {
  const seat = seatOf(f)
  const card = seat ? document.querySelector(`[data-seat-card="${seat}"]`) : null
  const rect = card ? card.getBoundingClientRect() : null
  return floatAnchor(rect, { width: window.innerWidth, height: window.innerHeight }, { kind: f.kind === 'chat' ? 'chat' : 'emote', side: sideOf(f) })
}

function FloatItem({ f }) {
  // Anchored once, when the float appears (the cards are already on screen);
  // later scrolling doesn't move it.
  const [pos] = useState(() => anchorFor(f))

  const chat = f.kind === 'chat'
  const translateX = pos.align === 'left' ? '-20%' : pos.align === 'right' ? '-80%' : '-50%'
  return (
    <div
      className="fixed"
      data-float-kind={chat ? 'chat' : 'emote'}
      data-float-by={f.by}
      style={{
        left: pos.left,
        top: pos.top,
        transform: `translate(${translateX}, ${chat ? '0' : '-100%'})`,
      }}
    >
      <div
        // re-keyed on count by the parent so a combo bump restarts the animation
        className={cn('emote-float flex flex-col items-center gap-0.5', chat && 'emote-float-chat')}
        style={{ '--float-ms': `${f.duration || 2000}ms` }}
      >
        {chat ? (
          <div className="w-max max-w-[min(70vw,16rem)] px-2.5 py-1.5 rounded-lg border-2 border-retro-p2 bg-retro-card shadow-lg">
            <span className="block font-pixel text-[7px] tracking-wider text-retro-p2 mb-0.5">{f.name}</span>
            <span className="block font-mono text-[13px] leading-snug text-retro-text break-words">{f.text}</span>
          </div>
        ) : (
          <>
            <div
              className="flex items-center gap-1"
              style={{ transform: `translateX(${f.dx || 0}px) rotate(${f.rot || 0}deg)` }}
            >
              {isQuickChat(f.glyph) ? (
                <span className="font-pixel text-base text-retro-cta text-glow-cta whitespace-nowrap">{f.glyph}</span>
              ) : pixelEmoteFor(f.glyph) ? (
                <PixelEmote id={pixelEmoteFor(f.glyph)} size={56} />
              ) : (
                <Suspense fallback={<span className="w-14 h-14" aria-hidden="true" />}>
                  <AnimatedEmoji glyph={f.glyph} className="w-14 h-14 object-contain" />
                </Suspense>
              )}
              {f.count > 1 && (
                <span
                  key={f.count}
                  className="font-pixel text-sm text-retro-cta text-glow-cta"
                  style={{ animation: 'emote-pop 0.15s ease-out' }}
                >
                  ×{f.count}
                </span>
              )}
            </div>
            {/* On the sender's own card the name is already there. */}
            {f.name && !pos.onCard && (
              <span className={cn(
                'font-pixel text-[8px] whitespace-nowrap',
                f.spectator ? 'text-retro-dim' : f.by === 'X' ? 'text-retro-p1' : f.by === 'O' ? 'text-retro-p2' : 'text-retro-dim'
              )}>
                {f.name}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Floating reactions and chat lines for the room shell (useFloats' `floats`).
// Decorative: screen readers get the same content from the room's live region.
export default function ReactionFloats({ floats }) {
  if (!floats.length) return null
  return (
    <div className="fixed inset-0 z-[90] pointer-events-none" aria-hidden="true">
      {floats.map(f => <FloatItem key={`${f.id}-${f.count}`} f={f} />)}
    </div>
  )
}
