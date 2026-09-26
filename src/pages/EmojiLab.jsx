import { useState } from 'react'
import { Link } from 'react-router-dom'
import AnimatedEmoji from '../components/AnimatedEmoji'
import { EMOTES_PICKER_ALL, searchEmotes } from '../lib/emotes'
import { sounds } from '../lib/sounds'

export default function EmojiLab() {
  const [selected, setSelected] = useState(EMOTES_PICKER_ALL[0])
  const [query, setQuery] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const emojis = query.trim() ? searchEmotes(query) : EMOTES_PICKER_ALL

  const testEmoji = (glyph) => {
    setSelected(glyph)
    setPreviewKey(key => key + 1)
    sounds.reaction(glyph)
  }

  return (
    <main className="min-h-screen bg-retro-bg p-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <div className="max-w-sm mx-auto space-y-5">
        {/* Settings live in the NavBar above — no second gear here. */}
        <Link to="/" className="inline-flex items-center min-h-11 font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">
          ← HOME
        </Link>

        <header className="text-center space-y-2">
          <p className="font-pixel text-[11px] text-retro-cta text-glow-cta tracking-widest">EMOJI LAB</p>
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            Select any emoji to test animation and sound.
          </p>
        </header>

        <section className="flex flex-col items-center gap-3 rounded border border-retro-border bg-retro-card p-5">
          <div className="h-28 w-28 flex items-center justify-center">
            <AnimatedEmoji key={`${selected}-${previewKey}`} glyph={selected} className="w-28 h-28 object-contain" />
          </div>
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

        <section aria-label="Emoji test grid" className="grid grid-cols-7 gap-1.5">
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
        </section>
        {emojis.length === 0 && (
          <p className="font-pixel text-[9px] text-retro-dim text-center tracking-widest">NO MATCH</p>
        )}
      </div>
    </main>
  )
}
