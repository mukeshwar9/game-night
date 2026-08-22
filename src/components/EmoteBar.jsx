import { useState } from 'react'
import BottomSheet from './BottomSheet'
import { EMOTES_PRIMARY, EMOTES_PICKER_FACES, EMOTES_PICKER_GESTURES, QUICK_CHAT, searchEmotes } from '../lib/emotes'
import { cn } from '@/lib/utils'

const EMOTE_BTN_CLASS = 'shrink-0 w-9 h-9 flex items-center justify-center text-base rounded border border-retro-border bg-retro-card hover:border-retro-p1/50 active:scale-90 transition-all'
const CHIP_BTN_CLASS = 'shrink-0 px-2.5 py-1.5 flex items-center justify-center font-pixel text-[8px] tracking-widest rounded border border-retro-border bg-retro-card hover:border-retro-cta/50 active:scale-95 transition-all'

function EmoteGrid({ glyphs, onPick, className }) {
  return (
    <div className={cn('grid grid-cols-6 gap-2', className)}>
      {glyphs.map(g => (
        <button
          key={g}
          type="button"
          onClick={() => onPick(g)}
          aria-label={`Send ${g} reaction`}
          className={cn(EMOTE_BTN_CLASS, 'w-full aspect-square text-xl')}
        >
          {g}
        </button>
      ))}
    </div>
  )
}

function EmotePicker({ onPick, onClose }) {
  const [query, setQuery] = useState('')
  const pick = (g) => { onPick(g); onClose() }
  const trimmed = query.trim()
  const results = trimmed ? searchEmotes(query) : []
  return (
    <BottomSheet onClose={onClose} ariaLabel="Choose a reaction">
      <p className="font-pixel text-[10px] text-retro-dim text-center tracking-widest">REACTIONS</p>
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="SEARCH…"
        aria-label="Search reactions"
        autoFocus={false}
        className="w-full px-2.5 py-2 mt-3 rounded border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-widest placeholder:text-retro-dim focus:outline-none focus:border-retro-cta/60"
      />
      {trimmed ? (
        results.length > 0 ? (
          <EmoteGrid glyphs={results} onPick={pick} className="pt-3" />
        ) : (
          <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest pt-6">NO MATCH</p>
        )
      ) : (
        <>
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest pt-3">FACES</p>
          <EmoteGrid glyphs={EMOTES_PICKER_FACES} onPick={pick} className="pt-1.5" />
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest pt-3">GESTURES</p>
          <EmoteGrid glyphs={EMOTES_PICKER_GESTURES} onPick={pick} className="pt-1.5" />
        </>
      )}
    </BottomSheet>
  )
}

export default function EmoteBar({ onSend, onSendChip, cooldown }) {
  const [showPicker, setShowPicker] = useState(false)
  const handleEmote = (g) => onSend(g)
  const handleChip = (t) => (onSendChip || onSend)(t)
  return (
    <>
      <div className="flex flex-col items-center gap-1.5 pt-1">
        <div className="flex justify-center gap-1.5">
          {EMOTES_PRIMARY.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => handleEmote(g)}
              disabled={cooldown}
              aria-label={`Send ${g} reaction`}
              className={cn(EMOTE_BTN_CLASS, cooldown && 'opacity-50')}
            >
              {g}
            </button>
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
      </div>
      {showPicker && (
        <EmotePicker onPick={handleEmote} onClose={() => setShowPicker(false)} />
      )}
    </>
  )
}
