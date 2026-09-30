// Dev-only preview of selected art styles across the full game catalog.
import { Link } from 'react-router-dom'
import { GameArtImg, GameArtSvg } from '../components/GameArt'
import { GAME_TYPES } from '../lib/games'

const GAMES = GAME_TYPES.filter(game => !game.variantOf)

function GameArtChoice({ game }) {
  const artType = game.type
  return (
    <article className="min-w-0 rounded-xl border border-retro-border bg-retro-card p-2">
      <h2 className="font-pixel text-[8px] text-retro-text text-center truncate mb-2">{game.label}</h2>
      <div className="grid grid-cols-2 gap-1.5">
        <figure className="min-w-0">
          <figcaption className="font-pixel text-[7px] text-retro-cta text-center mb-1">PIXEL STICKER · PNG</figcaption>
          <div className="overflow-hidden rounded-lg border border-retro-border bg-retro-surface">
            <GameArtImg type={artType} className="block w-full aspect-square" />
          </div>
        </figure>
        <figure className="min-w-0">
          <figcaption className="font-pixel text-[7px] text-retro-p2 text-center mb-1">EXISTING SOFT · SVG</figcaption>
          <div className="overflow-hidden rounded-lg border border-retro-p2/50 bg-retro-surface">
            <GameArtSvg type={artType} className="block w-full aspect-square" />
          </div>
        </figure>
      </div>
    </article>
  )
}

export default function ArtDemo() {
  return (
    <main className="min-h-screen bg-retro-bg p-4">
      <div className="w-full max-w-5xl mx-auto space-y-5 py-4">
        <header>
          <p className="font-pixel text-[10px] text-retro-cta tracking-[0.2em]">PIXEL STICKER + SOFT SVG · FULL CATALOG</p>
          <h1 className="font-pixel text-xl text-retro-text mt-2">SELECTED GAME ART</h1>
          <p className="font-mono text-xs text-retro-dim mt-2 max-w-3xl">
            Pixel Sticker is default PNG art. SOFT keeps original theme-aware SVG illustrations. Other style experiments removed.
            Showing {GAMES.length} catalog entries; variants share their base game's art.
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {GAMES.map(game => <GameArtChoice key={game.type} game={game} />)}
        </div>

        <Link
          to="/games"
          className="inline-flex min-h-11 px-4 items-center justify-center border border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider rounded hover:bg-retro-tint-cta transition-colors"
        >
          OPEN THE REAL CATALOG
        </Link>
      </div>
    </main>
  )
}
