import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AnimatedEmoji from '../components/AnimatedEmoji'
import AudioSettingsButton from '../components/AudioSettingsButton'
import { EMOTES_PICKER_ALL, searchEmotes } from '../lib/emotes'
import { sounds } from '../lib/sounds'

export default function EmojiLab() {
  const [selected, setSelected] = useState(EMOTES_PICKER_ALL[0])
  const [query, setQuery] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  // 'preview' — current behavior (animate in the box above).
  // 'screen' — emoji floats up center-screen like in-game reactions
  // (same emote-float keyframes Game.jsx uses).
  const [mode, setMode] = useState('preview')
  const [floats, setFloats] = useState([])
  const floatId = useRef(0)
  const emojis = query.trim() ? searchEmotes(query) : EMOTES_PICKER_ALL

  const testEmoji = (glyph) => {
    setSelected(glyph)
    if (mode === 'screen') {
      const id = ++floatId.current
      setFloats(f => [...f, { id, glyph }])
      setTimeout(() => setFloats(f => f.filter(fl => fl.id !== id)), 2000)
    } else {
      setPreviewKey(key => key + 1)
    }
    sounds.reaction(glyph)
  }

  return (
    <main className="min-h-screen bg-retro-bg p-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <div className="max-w-sm mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/" className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">
            ← HOME
          </Link>
          <AudioSettingsButton />
        </div>

        <header className="text-center space-y-2">
          <p className="font-pixel text-[11px] text-retro-cta text-glow-cta tracking-widest">EMOJI LAB</p>
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            Select any emoji to test animation and sound.
          </p>
        </header>

        {/* Display-mode toggle sits outside the preview card: PREVIEW plays
            in the box, ON SCREEN floats center-screen like in-game reactions
            (preview box hidden so the emoji doesn't show twice). */}
        <div className="flex justify-center gap-1" role="group" aria-label="Reaction display mode">
          <button
            type="button"
            onClick={() => setMode('preview')}
            aria-pressed={mode === 'preview'}
            className={`px-3 py-1.5 font-pixel text-[8px] tracking-widest rounded border transition-all active:scale-95 ${
              mode === 'preview'
                ? 'border-retro-cta text-retro-cta bg-retro-tint-cta'
                : 'border-retro-border text-retro-dim hover:text-retro-text'
            }`}
          >
            PREVIEW
          </button>
          <button
            type="button"
            onClick={() => setMode('screen')}
            aria-pressed={mode === 'screen'}
            className={`px-3 py-1.5 font-pixel text-[8px] tracking-widest rounded border transition-all active:scale-95 ${
              mode === 'screen'
                ? 'border-retro-cta text-retro-cta bg-retro-tint-cta'
                : 'border-retro-border text-retro-dim hover:text-retro-text'
            }`}
          >
            ON SCREEN
          </button>
        </div>

        <section className="flex flex-col items-center gap-3 rounded border border-retro-border bg-retro-card p-5">
          {mode === 'preview' && (
            <div className="h-28 w-28 flex items-center justify-center">
              <AnimatedEmoji key={`${selected}-${previewKey}`} glyph={selected} className="w-28 h-28 object-contain" />
            </div>
          )}
          <span className="text-3xl" aria-label={selected}>{selected}</span>
          <button
            type="button"
            onClick={() => testEmoji(selected)}
            className="px-4 py-2 border border-retro-cta text-retro-cta font-pixel text-[9px] tracking-widest rounded hover:bg-retro-tint-cta active:scale-95 transition-all"
          >
            PLAY SOUND
          </button>
        </section>

        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="SEARCH EMOJIS…"
          aria-label="Search emojis"
          className="w-full px-3 py-2.5 rounded border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-widest placeholder:text-retro-dim focus:outline-none focus:border-retro-cta/60"
        />

        {/* Fixed-height scrollable grid — all emojis reachable, page stays put. */}
        <section
          aria-label="Emoji test grid"
          className="max-h-72 overflow-y-auto rounded border border-retro-border bg-retro-bg/40 p-1.5"
        >
          <div className="grid grid-cols-7 gap-1.5">
            {emojis.map(glyph => (
              <button
                key={glyph}
                type="button"
                onClick={() => testEmoji(glyph)}
                aria-label={`Test ${glyph}`}
                aria-pressed={selected === glyph}
                className={`aspect-square flex items-center justify-center rounded border text-xl transition-all active:scale-90 ${
                  selected === glyph
                    ? 'border-retro-cta bg-retro-tint-cta'
                    : 'border-retro-border bg-retro-card hover:border-retro-p1/60'
                }`}
              >
                {glyph}
              </button>
            ))}
          </div>
          {emojis.length === 0 && (
            <p className="font-pixel text-[9px] text-retro-dim text-center tracking-widest py-4">NO MATCH</p>
          )}
        </section>
      </div>

      {/* ON SCREEN mode: reaction floats up center-screen, then fades —
          same emote-float animation the in-game EmoteFloats overlay uses. */}
      {mode === 'screen' && floats.length > 0 && (
        <div className="fixed inset-x-0 top-1/3 z-50 pointer-events-none flex flex-col items-center gap-2">
          {floats.map(f => (
            <div key={f.id} style={{ animation: 'emote-float 2s ease-out forwards' }}>
              <AnimatedEmoji glyph={f.glyph} className="w-24 h-24" />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
