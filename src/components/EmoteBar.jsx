import { useState } from 'react'
import { motion } from 'framer-motion'
import BottomSheet from './BottomSheet'
import ChatSheet from './ChatSheet'
import { EMOTES_DOCK, EMOTES_PICKER_FACES, EMOTES_PICKER_GESTURES, EMOTES_PREMIUM, searchEmotes } from '../lib/emotes'
import LockBadge from './premium/LockBadge'
import PixelEmote from './PixelEmote'
import { pixelEmoteFor } from '../lib/pixelEmotes'
import useAccess from '../hooks/useAccess'
import { openPaywall } from '../lib/premiumUi'
import { cn } from '@/lib/utils'
import { getPlayerId } from '../lib/playerId'
import { getQuickEmotes, normalizeEmoteUsage, recordEmoteUsage } from '../lib/emoteUsage'
import { normalizeChatLog } from '../lib/chat'
import { unreadBadge, unreadCount } from '../lib/chatUiLogic'
import { useMutedMap } from '../lib/mute'
import useMotionPref from '../hooks/useMotionPref'
import MotionPrefProvider from './MotionPrefProvider'

const EMOTE_BTN_CLASS = 'glass-emote shrink-0 w-11 h-11 flex items-center justify-center text-base rounded border border-retro-border bg-retro-card hover:border-retro-p1/50 transition-colors'
const EMOTE_TAP_PROPS = {
  whileTap: { scale: 0.82, rotate: -8 },
  whileHover: { scale: 1.06 },
  transition: { type: 'spring', stiffness: 500, damping: 18 },
}

function AnimatedEmoteButton({ children, className, ...props }) {
  // Reduced motion (Settings or OS): no tap wobble / hover grow.
  const { reduced } = useMotionPref()
  return (
    <motion.button {...props} {...(reduced ? null : EMOTE_TAP_PROPS)} className={className}>
      {children}
    </motion.button>
  )
}

function EmoteGrid({ glyphs, onPick, className }) {
  return (
    <div className={cn('grid grid-cols-6 gap-2', className)}>
      {glyphs.map(g => (
        <AnimatedEmoteButton
          key={g}
          type="button"
          onClick={() => onPick(g)}
          aria-label={`Send ${g} reaction`}
          className={cn(EMOTE_BTN_CLASS, 'w-full aspect-square text-xl')}
        >
          {pixelEmoteFor(g) ? <PixelEmote id={pixelEmoteFor(g)} size={32} /> : g}
        </AnimatedEmoteButton>
      ))}
    </div>
  )
}

// The PIXEL EMOTES pack: an unlocked glyph sends like any other; a locked one
// closes the picker (sheets never nest) and opens the paywall.
function PremiumEmoteGrid({ onPick, onLocked, className }) {
  const access = useAccess()
  return (
    <div className={cn('grid grid-cols-6 gap-2', className)}>
      {EMOTES_PREMIUM.map(item => {
        const open = access.isUnlocked(item)
        return (
          <AnimatedEmoteButton
            key={item.id}
            type="button"
            onClick={() => (open ? onPick(item.glyph) : onLocked(item))}
            aria-label={open ? `Send ${item.label} reaction` : `${item.label} reaction, locked`}
            className={cn(EMOTE_BTN_CLASS, 'relative w-full aspect-square text-xl', !open && 'opacity-70')}
          >
            <PixelEmote id={item.id} size={32} />
            {!open && <LockBadge size={10} className="absolute right-0.5 bottom-0.5" />}
          </AnimatedEmoteButton>
        )
      })}
    </div>
  )
}

function readUsage(key) {
  try {
    return normalizeEmoteUsage(JSON.parse(localStorage.getItem(key) || '{}'))
  } catch {
    return {}
  }
}

const SECTION_LABEL = 'font-pixel text-[8px] text-retro-dim tracking-widest'

// Opaque sheet over a dimmed room (the old one was ~80% see-through, so the
// chat and chips behind it showed through the grid).
function EmotePicker({ onPick, onClose, recent }) {
  const [query, setQuery] = useState('')
  const pick = (g) => { onPick(g); onClose() }
  const trimmed = query.trim()
  const results = trimmed ? searchEmotes(query) : []
  return (
    <BottomSheet
      glass
      onClose={onClose}
      ariaLabel="Choose a reaction"
      backdropClassName="bg-black/40"
      className="w-full sm:max-w-md h-[min(70vh,28rem)] bg-retro-card overflow-hidden flex flex-col"
    >
      <p className="shrink-0 font-pixel text-[10px] text-retro-dim text-center tracking-widest">REACTIONS</p>
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="SEARCH…"
        aria-label="Search reactions"
        autoFocus={false}
        className="shrink-0 w-full px-2.5 py-2 mt-3 rounded border border-retro-border bg-retro-bg text-retro-text font-pixel text-[9px] tracking-widest placeholder:text-retro-dim focus:outline-none focus:border-retro-cta/60"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {trimmed ? (
          results.length > 0 ? (
            <EmoteGrid glyphs={results} onPick={pick} />
          ) : (
            <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest pt-3">NO MATCH</p>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <>
                <p className={SECTION_LABEL}>RECENT</p>
                <EmoteGrid glyphs={recent} onPick={pick} className="pt-1.5 pb-3" />
              </>
            )}
            <p className={SECTION_LABEL}>FACES</p>
            <EmoteGrid glyphs={EMOTES_PICKER_FACES} onPick={pick} className="pt-1.5" />
            <p className={cn(SECTION_LABEL, 'pt-3')}>GESTURES</p>
            <EmoteGrid glyphs={EMOTES_PICKER_GESTURES} onPick={pick} className="pt-1.5" />
            <p className={cn(SECTION_LABEL, 'pt-3')}>PIXEL EMOTES</p>
            <PremiumEmoteGrid onPick={pick} onLocked={(item) => { onClose(); openPaywall(item) }} className="pt-1.5" />
          </>
        )}
      </div>
    </BottomSheet>
  )
}

function newestTs(entries) {
  return entries[entries.length - 1]?.[1]?.ts || 0
}

// The room's reaction and chat dock: one row of fixed reaction slots, the
// picker, and (unless the game is `quiet`) a chat button with an unread badge
// that opens the chat sheet. Typed chat, quick phrases, history and
// block/report live in the sheet, so the dock stays one 44px row under the
// board.
//
// `chatLock` (a reason string, or null) replaces the sheet's input — e.g. the
// Sketch artist mid-round.
export default function EmoteBar({ onSend, cooldown, onSendText, textCooldown, quiet = false, chatLog, myUid, chatLock = null }) {
  const [showPicker, setShowPicker] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [usageKey] = useState(() => `emoteUsage:${getPlayerId()}`)
  const [usage, setUsage] = useState(() => readUsage(usageKey))
  const muted = useMutedMap()
  const entries = normalizeChatLog(chatLog)
  const latest = newestTs(entries)
  // The history already in the room on arrival is not "unread": latch the
  // newest message at mount; closing the sheet marks everything read.
  const [lastSeenTs, setLastSeenTs] = useState(latest)
  const closeChat = () => {
    setLastSeenTs(ts => Math.max(ts, latest))
    setShowChat(false)
  }
  const chatEnabled = !quiet && !!onSendText
  const unread = chatEnabled && !showChat ? unreadCount(entries, { lastSeenTs, myUid, muted }) : 0
  const badge = unreadBadge(unread)
  const recent = getQuickEmotes(usage, [], 6)

  const handleEmote = async (g) => {
    const sent = await onSend(g)
    if (sent === false) return
    setUsage(previous => {
      const next = recordEmoteUsage(previous, g, Date.now())
      try { localStorage.setItem(usageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // MotionPrefProvider renders no DOM; it points framer-motion's own
  // reduced-motion handling at the Settings choice for the bar and picker.
  return (
    <MotionPrefProvider>
      <div className="w-full max-w-sm mx-auto pt-1" data-testid="reaction-dock">
        {/* the room dock: a glass pill on the GLASS themes */}
        <div data-lens className="glass glass-tx glass-dock flex items-center justify-center gap-1.5 px-1">
          {EMOTES_DOCK.map(g => (
            <AnimatedEmoteButton
              key={g}
              type="button"
              onClick={() => handleEmote(g)}
              disabled={cooldown}
              aria-label={`Send ${g} reaction`}
              className={cn(EMOTE_BTN_CLASS, cooldown && 'opacity-50')}
            >
              {g}
            </AnimatedEmoteButton>
          ))}
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            aria-label="More reactions"
            className={cn(EMOTE_BTN_CLASS, 'text-retro-dim')}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="7.2" cy="8.2" r="1.2" fill="currentColor" />
              <circle cx="12.8" cy="8.2" r="1.2" fill="currentColor" />
              <path d="M7 12.2 Q10 14.2 13 12.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              <circle cx="16.2" cy="16.2" r="3.2" className="fill-retro-card" stroke="currentColor" strokeWidth="1.2" />
              <path d="M16.2 14.4 V18 M14.4 16.2 H18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          {chatEnabled && (
            <button
              type="button"
              onClick={() => setShowChat(true)}
              aria-label={unread ? `Open chat, ${unread} unread` : 'Open chat'}
              className={cn(EMOTE_BTN_CLASS, 'relative text-retro-text', unread > 0 && 'border-retro-p2 bg-retro-tint-p2')}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 4.5 h14 v9 h-8 l-4 3 v-3 h-2 z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M6.5 8 h7 M6.5 10.5 h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {badge && (
                <span
                  data-testid="chat-unread"
                  className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-retro-danger text-retro-bg font-mono text-[10px] font-bold leading-[18px] text-center"
                >
                  {badge}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
      {showPicker && (
        <EmotePicker onPick={handleEmote} onClose={() => setShowPicker(false)} recent={recent} />
      )}
      {showChat && (
        <ChatSheet
          chatLog={chatLog}
          myUid={myUid}
          onSendText={onSendText}
          textCooldown={textCooldown}
          chatLock={chatLock}
          onClose={closeChat}
        />
      )}
    </MotionPrefProvider>
  )
}
