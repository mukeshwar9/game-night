// Dev-only preview (DEV-only route, never ships): game art options A/B +
// GIF-like how-to-play clips, all on the same 3 games.
import { Link } from 'react-router-dom'
import { GameArtImg, GameArtSvg } from '../components/GameArt'
import RuleClip from '../components/RuleClips'
import GameCard from '../components/GameCard'
import { getGameConfig, GAME_TYPES } from '../lib/games'
import { getRules } from '../lib/rules'

const DEMO_TYPES = ['tictactoe', 'connectfour', 'pong']
const BOARD_TYPES = GAME_TYPES.filter(t => t.category === 'board').map(t => t.type)
const ALL_TYPES = GAME_TYPES.filter(t => !t.variantOf)

const PNG_SNIPPET = `// OPTION A — image file (fixed colors, ~3 KB each). DEFAULT.
// 1. Draw it: extend scripts/make-game-art.mjs, then
npm run art   # → public/game-art/<type>.png
// 2. Register one line in src/components/GameArt.jsx:
const ART_TYPES = new Set([… 'sos'])`

const SVG_SNIPPET = `// OPTION B — soft SVG (theme-aware, zero bytes).
// Switch anytime: Settings → LOOK & FEEL → GAME ART → SOFT.
// 1. Add one small SVG in src/components/GameArt.jsx
//    (viewBox 0 0 96 96, ONLY fill-retro-*/stroke-retro-* — never hex):
function SosSoft({ className }) { /* …tint wash + thin strokes… */ }
// 2. Register one line:
const SOFT_ART = { … sos: SosSoft }`

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

export default function ArtDemo() {
  return (
    <main className="min-h-screen bg-retro-bg p-4">
      <div className="w-full max-w-5xl mx-auto space-y-6 py-4">
        <div>
          <p className="font-pixel text-[10px] text-retro-cta tracking-[0.2em]">ART + RULES PREVIEW · 3 GAMES</p>
          <h1 className="font-pixel text-xl text-retro-text mt-2">PNG vs SVG · HOW-TO-PLAY CLIPS</h1>
          <p className="font-mono text-xs text-retro-dim mt-2">
            Catalog art defaults to BOLD (PNG) — flip it live in Settings → LOOK &amp; FEEL → GAME ART
            and watch the rows below re-theme. Same page, second half: motion for the rules sheet.
          </p>
        </div>

        <TileRow
          title="OPTION A — IMAGE FILES (DEFAULT) · ALL 71 GAMES"
          blurb="Fixed bright palette, dark sticker outline. ~280 KB for the whole set."
          render={(t) => <GameArtImg type={t} className="w-full aspect-square block" />}
        />

        <TileRow
          title="OPTION B — SVG, SOOTHING · ALL 71 GAMES"
          blurb="Tint washes, thin round strokes. Zero bytes, theme-aware. Flip via Settings → GAME ART."
          render={(t) => <GameArtSvg type={t} className="w-full aspect-square block" />}
        />

        <div className="space-y-2">
          <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">IN THE CATALOG (FOLLOWS YOUR SETTING)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md">
            {DEMO_TYPES.map(t => (
              <GameCard key={t} game={getGameConfig(t)} onTap={() => {}} />
            ))}
          </div>
        </div>

        <div className="space-y-2 max-w-md">
          <h2 className="font-pixel text-[9px] text-retro-cta tracking-widest">HOW TO ADD THE NEXT GAME</h2>
          <pre className="font-mono text-[11px] leading-relaxed text-retro-text bg-retro-card border border-retro-border rounded-2xl p-4 overflow-x-auto whitespace-pre">
            {PNG_SNIPPET}
          </pre>
          <pre className="font-mono text-[11px] leading-relaxed text-retro-text bg-retro-card border border-retro-border rounded-2xl p-4 overflow-x-auto whitespace-pre">
            {SVG_SNIPPET}
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
