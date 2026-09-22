import { useState } from 'react'
import { motion } from 'framer-motion'
import BottomSheet from './BottomSheet'
import { EMOTES_PRIMARY, EMOTES_PICKER_FACES, EMOTES_PICKER_GESTURES, QUICK_CHAT, searchEmotes } from '../lib/emotes'
import { CHAT_MAX_LENGTH } from '../lib/chat'
import { cn } from '@/lib/utils'
import { getPlayerId } from '../lib/playerId'
import { getQuickEmotes, normalizeEmoteUsage, recordEmoteUsage } from '../lib/emoteUsage'

const EMOTE_BTN_CLASS = 'shrink-0 w-11 h-11 flex items-center justify-center text-base rounded border border-retro-border bg-retro-card hover:border-retro-p1/50 transition-colors'
const EMOTE_TAP_PROPS = {
  whileTap: { scale: 0.82, rotate: -8 },
  whileHover: { scale: 1.06 },
  transition: { type: 'spring', stiffness: 500, damping: 18 },
}

function AnimatedEmoteButton({ children, className, ...props }) {
  return (
    <motion.button {...props} {...EMOTE_TAP_PROPS} className={className}>
      {children}
    </motion.button>
  )
}
const CHIP_BTN_CLASS = 'shrink-0 px-2.5 min-h-11 flex items-center justify-center font-pixel text-[8px] tracking-widest rounded border border-retro-border bg-retro-card hover:border-retro-cta/50 active:scale-95 transition-all'

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
          {g}
        </AnimatedEmoteButton>
      ))}
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

function EmotePicker({ onPick, onClose }) {
  const [query, setQuery] = useState('')
  const pick = (g) => { onPick(g); onClose() }
  const trimmed = query.trim()
  const results = trimmed ? searchEmotes(query) : []
  return (
    <BottomSheet
      onClose={onClose}
      ariaLabel="Choose a reaction"
      backdropClassName="bg-transparent"
      className="w-full max-w-none sm:max-w-none h-[min(70vh,28rem)] bg-retro-bg/20 overflow-hidden flex flex-col"
    >
      <p className="shrink-0 font-pixel text-[10px] text-retro-dim text-center tracking-widest">REACTIONS</p>
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="SEARCH…"
        aria-label="Search reactions"
        autoFocus={false}
        className="shrink-0 w-full px-2.5 py-2 mt-3 rounded border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-widest placeholder:text-retro-dim focus:outline-none focus:border-retro-cta/60"
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
            <p className="font-pixel text-[8px] text-retro-dim tracking-widest">FACES</p>
            <EmoteGrid glyphs={EMOTES_PICKER_FACES} onPick={pick} className="pt-1.5" />
            <p className="font-pixel text-[8px] text-retro-dim tracking-widest pt-3">GESTURES</p>
            <EmoteGrid glyphs={EMOTES_PICKER_GESTURES} onPick={pick} className="pt-1.5" />
          </>
        )}
      </div>
    </BottomSheet>
  )
}

export default function EmoteBar({ onSend, onSendChip, cooldown, onSendText, textCooldown }) {
  const [showPicker, setShowPicker] = useState(false)
  const [text, setText] = useState('')
  const [usageKey] = useState(() => `emoteUsage:${getPlayerId()}`)
  const [usage, setUsage] = useState(() => readUsage(usageKey))
  const quickEmotes = getQuickEmotes(usage, EMOTES_PRIMARY)
  const handleEmote = async (g) => {
    const sent = await onSend(g)
    if (sent === false) return
    setUsage(previous => {
      const next = recordEmoteUsage(previous, g, Date.now())
      try { localStorage.setItem(usageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const handleChip = (t) => (onSendChip || onSend)(t)
  const handleSubmitText = async (e) => {
    e.preventDefault()
    const ok = await onSendText(text)
    if (ok) setText('')
  }
  return (
    <>
      <div className="flex flex-col items-center gap-1.5 pt-1">
        {Object.keys(usage).length > 0 && (
          <p className="font-pixel text-[7px] text-retro-dim tracking-widest">YOUR REACTIONS</p>
        )}
        <div className="flex justify-center gap-1.5 flex-wrap max-w-full px-2">
          {quickEmotes.map(g => (
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
              <circle cx="16.2" cy="16.2" r="3.2" fill="rgb(var(--c-card))" stroke="currentColor" strokeWidth="1.2" />
              <path d="M16.2 14.4 V18 M14.4 16.2 H18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex justify-center gap-1 flex-wrap max-w-[280px]">
          {QUICK_CHAT.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => handleChip(t)}
              disabled={cooldown}
              aria-label={`Send ${t}`}
              className={cn(CHIP_BTN_CLASS, cooldown && 'opacity-50')}
            >
              {t}
            </button>
          ))}
        </div>
        {onSendText && (
          <form onSubmit={handleSubmitText} className="flex gap-2 w-full max-w-[280px]">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={CHAT_MAX_LENGTH}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="SAY SOMETHING…"
              aria-label="Chat message"
              className="flex-1 min-w-0 min-h-11 bg-retro-card border-2 border-retro-border text-retro-text
                font-pixel text-xs placeholder-retro-border placeholder:text-[10px] placeholder:tracking-normal rounded px-3 py-2
                focus:outline-none focus:border-retro-p1 tracking-widest transition-colors"
            />
            <button
              type="submit"
              disabled={!text.trim() || textCooldown}
              className={cn(
                'min-h-11 px-4 flex items-center justify-center bg-retro-card border-2 border-retro-border text-retro-text',
                'font-pixel text-[10px] rounded hover:border-retro-p1/50 transition-colors active:scale-95',
                (!text.trim() || textCooldown) && 'opacity-50'
              )}
            >
              SEND
            </button>
          </form>
        )}
      </div>
      {showPicker && (
        <EmotePicker onPick={handleEmote} onClose={() => setShowPicker(false)} />
      )}
    </>
  )
}
