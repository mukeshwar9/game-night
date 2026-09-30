// Dev-only preview (DEV-only route, never ships): the pixel game-art styles +
// GIF-like how-to-play clips.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GameArtPixel } from '../components/GameArt'
import RuleClip from '../components/RuleClips'
import GameCard from '../components/GameCard'
import { getGameConfig, GAME_TYPES } from '../lib/games'
import { ART_STYLES, PIXEL_ART_SIZES } from '../lib/gameArtStyle'
import { getRules } from '../lib/rules'
import FilterButton, { ViewTabs } from '../components/GameFilters'
import { passesFilters, sortGames } from '../lib/gameFilters'

const DEMO_TYPES = ['tictactoe', 'connectfour', 'pong']
const BOARD_TYPES = GAME_TYPES.filter(t => t.category === 'board').map(t => t.type)
const ALL_TYPES = GAME_TYPES.filter(t => !t.variantOf)

const ART_SNIPPET = `// Pixel art — indexed PNGs on the house palette, drawn in code.
// 1. Draw it: add a sprite per style in scripts/pixel-art/games/, then
npm run art:pixel   # → public/game-art/pixel/<style>/<type>.png
// 2. Register one line in src/components/GameArt.jsx:
const ART_TYPES = new Set([… 'sos'])`

const PIXEL_STYLES = ART_STYLES.filter(s => PIXEL_ART_SIZES[s.id])

const CLIP_SNIPPET = `// Real clips pipeline — ship muted looping MP4, NOT gif:
// a 5s gif ≈ 2–5 MB · the same clip as mp4 ≈ 150 KB, pausable, themeable.
ffmpeg -i raw-capture.mov -vf "scale=480:-1,fps=15" -c:v libx264 \\
  -pix_fmt yuv420p -an -movflags +faststart public/game-clips/<type>.mp4
// rules.js:  tictactoe: { …, clip: 'tictactoe' }
// RulesModal.jsx — one block above OBJECTIVE:
//   {rules.clip && <video autoPlay muted loop playsInline
//     src={\`/game-clips/\${rules.clip}.mp4\`} className="w-full aspect-video …" />}
// Board games can skip video entirely: RuleClips.jsx animated SVGs below
// are crisp at any size, ~1 KB, silent, looping — and freeze under the
// REDUCE MOTION setting automatically (real gifs can't).`

function TileRow({ title, blurb, render }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">{title}</h2>
        <p className="font-mono text-[11px] text-retro-dim mt-1">{blurb}</p>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
        {ALL_TYPES.map(g => (
          <figure key={g.type} className="min-w-0">
            <div className="rounded-xl border border-retro-border overflow-hidden bg-retro-card">
              {render(g.type)}
            </div>
            <figcaption className="font-pixel text-[7px] text-retro-dim tracking-wide text-center mt-1 truncate">
              {g.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

// Compact mock of the rules sheet for every board game: the looping clip
// on top, the live OBJECTIVE text below. Small by design — the sheet itself
// carries the full HOW TO PLAY steps.
function ClipCard({ type }) {
  const game = getGameConfig(type)
  const rules = getRules(type)
  if (!game || !rules) return null
  return (
    <div className="border border-retro-border bg-retro-card rounded-2xl overflow-hidden">
      <RuleClip type={type} className="w-full aspect-square block" />
      <div className="p-2 space-y-1.5">
        <p className="font-pixel text-[9px] text-retro-text tracking-wider truncate">{game.label}</p>
        <p className="font-mono text-[10px] leading-snug text-retro-dim line-clamp-3">{rules.objective}</p>
      </div>
    </div>
  )
}

// Working mock of the proposed filter redesign: categories keep their chips
// (visual only here), facets move into the FILTERS sheet — fully functional.
// The grid below filters live, and the view tabs switch its layout.
function FilterPreview() {
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState('curated')
  const [view, setView] = useState('detailed')
  const toggle = (key) => setFilters(f => ({ ...f, [key]: !f[key] }))
  const matches = sortGames(GAME_TYPES.filter(t => !t.variantOf && passesFilters(t, filters)), sort)
  const shown = matches.slice(0, 12)
  const gridClass = view === 'detailed'
    ? 'grid grid-cols-3 gap-2'
    : view === 'mini'
      ? 'flex flex-col gap-1'
      : 'grid grid-cols-2 gap-2'
  return (
    <div className="space-y-2 max-w-md">
      <div>
        <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">FILTERS, REDESIGNED (WORKING MOCK)</h2>
        <p className="font-mono text-[11px] text-retro-dim mt-1">
          Categories keep their chips. Facets move into the sheet — tap FILTERS, toggle, watch the grid.
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {['ALL 71', 'BOARD 26', 'REFLEX 18', 'MEMORY 5'].map((c, i) => (
          <span
            key={c}
            aria-hidden="true"
            className={i === 0
              ? 'shrink-0 min-h-11 px-3.5 inline-flex items-center rounded border border-retro-cta font-pixel text-[9px] text-retro-cta bg-retro-tint-cta'
              : 'shrink-0 min-h-11 px-3.5 inline-flex items-center rounded border border-retro-border font-pixel text-[9px] text-retro-dim'}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <FilterButton filters={filters} onToggle={toggle} onReset={() => { setFilters({}); setSort('curated') }} resultCount={matches.length} sort={sort} onSort={setSort} />
        <ViewTabs view={view} onSelect={setView} />
      </div>
      {matches.length === 0 ? (
        <p className="font-pixel text-[9px] text-retro-dim border border-retro-border rounded p-4 text-center">NO GAMES MATCH THESE FILTERS</p>
      ) : (
        <div className={gridClass}>
          {shown.map(g => (
            <GameCard key={g.type} game={g} onTap={() => {}} layout={view === 'detailed' ? 'tile' : view === 'mini' ? 'mini' : 'row'} />
          ))}
        </div>
      )}
      {matches.length > shown.length && (
        <p className="font-mono text-[11px] text-retro-dim">+ {matches.length - shown.length} more match</p>
      )}
    </div>
  )
}

export default function ArtDemo() {
  return (
    <main className="min-h-screen bg-retro-bg p-4">
      <div className="w-full max-w-5xl mx-auto space-y-6 py-4">
        <div>
          <p className="font-pixel text-[10px] text-retro-cta tracking-[0.2em]">ART + RULES PREVIEW</p>
          <h1 className="font-pixel text-xl text-retro-text mt-2">PIXEL ART · HOW-TO-PLAY CLIPS</h1>
          <p className="font-mono text-xs text-retro-dim mt-2">
            Catalog art defaults to PIXEL SCENE — flip it live in Settings → LOOK &amp; FEEL → GAME ART
            and watch the catalog cards below follow. Same page, second half: motion for the rules sheet.
          </p>
        </div>

        {PIXEL_STYLES.map(({ id, label }) => (
          <TileRow
            key={id}
            title={`${label} · ALL ${ALL_TYPES.length} GAMES`}
            blurb={`${PIXEL_ART_SIZES[id]}×${PIXEL_ART_SIZES[id]} sprite on the house palette, upscaled crisp.`}
            render={(t) => <GameArtPixel type={t} style={id} className="w-full aspect-square block" />}
          />
        ))}

        <div className="space-y-2">
          <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">IN THE CATALOG (FOLLOWS YOUR SETTING)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md">
            {DEMO_TYPES.map(t => (
              <GameCard key={t} game={getGameConfig(t)} onTap={() => {}} />
            ))}
          </div>
        </div>

        <FilterPreview />

        <div className="space-y-2 max-w-md">
          <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">HOW TO ADD THE NEXT GAME</h2>
          <pre className="font-mono text-[11px] leading-relaxed text-retro-text bg-retro-card border border-retro-border rounded-2xl p-4 overflow-x-auto whitespace-pre">
            {ART_SNIPPET}
          </pre>
        </div>

        <div className="space-y-2">
          <div>
            <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">HOW-TO-PLAY CLIPS · ALL BOARD GAMES</h2>
            <p className="font-mono text-[11px] text-retro-dim mt-1">
              A looping silent demo above the rules text — shows the move, not just describes it.
              Variants reuse their base game&apos;s clip. ↻ loops · silent · freezes under REDUCE MOTION.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {BOARD_TYPES.map(t => <ClipCard key={t} type={t} />)}
          </div>
        </div>

        <div className="space-y-2 max-w-md">
          <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">CLIP PIPELINE (GIFs NOT INCLUDED)</h2>
          <pre className="font-mono text-[11px] leading-relaxed text-retro-text bg-retro-card border border-retro-border rounded-2xl p-4 overflow-x-auto whitespace-pre">
            {CLIP_SNIPPET}
          </pre>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Proposal: animated SVG clips (like above) for every board/dice game — free, crisp, motion-safe —
            real captured MP4s only where fingers/timing matter (pong, snake, aim). Say go and I&apos;ll wire
            RuleClip into the real RulesModal + batch the next games.
          </p>
          <Link
            to="/games"
            className="inline-flex min-h-11 px-4 items-center justify-center border border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider rounded hover:bg-retro-tint-cta transition-colors"
          >
            OPEN THE REAL CATALOG →
          </Link>
        </div>
      </div>
    </main>
  )
}
