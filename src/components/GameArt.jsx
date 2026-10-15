// Game art for the full catalog in four looks (Settings → LOOK & FEEL → GAME
// ART): CUT PAPER (default) and TOON, both drawn for every game and gently
// animated while on screen, PIXEL SCENE (a static 64 px sprite), or ICONS,
// which shows the mono icon underneath instead. Variants + same-family games
// resolve through ART_ALIAS (mirrors the icon fallback); <GameArt/> returns
// null for unknown types so callers need no per-game branches.
import { Suspense } from 'react'
import { PIXEL_ART_SIZES, useGameArtStyle } from '../lib/gameArtStyle'
import { lazyWithRetry } from '../lib/lazyWithRetry'
import GameArtCutPaper from './GameArtCutPaper'

const GameArtToon = lazyWithRetry(() => import('./gameArtToon/GameArtToon'))

const ART_TYPES = new Set([
  'tictactoe', 'sim', 'chomp', 'breakthrough', 'ataxx', 'kamisado', 'onitama', 'quarto',
  'santorini', 'loa', 'yavalath', 'connectfour', 'hangwoman', 'dotsandboxes', 'sos',
  'simon', 'chimp', 'numbermemory', 'reaction', 'aim', 'typing', 'math', 'arrows', 'updraft',
  'pong', 'snake', 'tron', 'sumo', 'spaceduel', 'paint', 'pacmac', 'visualmemory', 'gomoku',
  'reversi', 'chainreaction', 'blockade', 'orderchaos', 'dice', 'hex', 'minesweeper', 'herd',
  'trivia', 'battleship', 'mancala', 'checkers', 'airhockey', 'artillery', 'animalstack', 'birdseye',
  'wirecrossed', 'twotruths', 'bluff', 'lanterns', 'docking', 'wavelength', 'fibbage',
  'spyfair', 'headsup', 'chameleon', 'wordduel', 'wordcoop', 'converge', 'wordrace',
  'wordhunt', 'password', 'anagrams', 'hunch', 'pairs', 'sketch', 'codewords', 'justone',
  'puckrush', 'yacht', 'faceoff', 'chopchop', 'stickyfingers', 'fenderbender', 'lazysusan',
  'darts', 'bamboozle', 'bonkbuggies', 'firstcut', 'quiver', 'sidekick',
])

const ART_ALIAS = { chainreaction4: 'chainreaction', pairs4: 'pairs', arrowsparty: 'arrows' }

const resolveArt = (type) => ART_ALIAS[type] || type

// Pixel art: a 64×64 indexed PNG drawn on a fixed house palette by
// scripts/pixel-art/ (`npm run art:pixel`), upscaled crisp with
// image-rendering: pixelated.
export function GameArtPixel({ type, style = 'scene', className }) {
  const t = resolveArt(type)
  const size = PIXEL_ART_SIZES[style]
  if (!ART_TYPES.has(t) || !size) return null
  return (
    <img
      src={`/game-art/pixel/${style}/${t}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      width={size}
      height={size}
      className={`${className || ''} [image-rendering:pixelated]`}
    />
  )
}

// One look, whatever the player's setting (the dev ArtDemo shows them side by side).
export function GameArtOf({ type, style, className }) {
  const t = resolveArt(type)
  if (!ART_TYPES.has(t)) return null
  if (style === 'cutpaper') return <GameArtCutPaper type={t} className={className} />
  if (style === 'toon') return <Suspense fallback={null}><GameArtToon type={t} className={className} /></Suspense>
  // ICONS: the original mono icon underneath is the look — render nothing.
  if (style === 'icons') return null
  return <GameArtPixel type={t} style={style} className={className} />
}

export function GameArt({ type, className }) {
  const style = useGameArtStyle()
  return <GameArtOf type={type} style={style} className={className} />
}
