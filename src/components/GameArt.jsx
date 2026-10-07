// Game art — pixel-art thumbnails for the full catalog in three styles
// (PIXEL SCENE default, OBJECT, CAST; Settings → LOOK & FEEL → GAME ART), or
// ICONS, which shows the mono icon underneath instead. Variants + same-family
// games resolve through ART_ALIAS (mirrors the icon fallback); <GameArt/>
// returns null for unknown types so callers need no per-game branches.
import { PIXEL_ART_SIZES, useGameArtStyle } from '../lib/gameArtStyle'

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
])

const ART_ALIAS = { chainreaction4: 'chainreaction', pairs4: 'pairs' }

const resolveArt = (type) => ART_ALIAS[type] || type

// Pixel art: 32×32 (object, cast) or 64×64 (scene) indexed PNGs drawn on a
// fixed house palette by scripts/pixel-art/ (`npm run art:pixel`), upscaled
// crisp with image-rendering: pixelated.
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

export function GameArt({ type, className }) {
  const style = useGameArtStyle()
  // ICONS: the original mono icon underneath is the look — render nothing.
  if (style === 'icons') return null
  return <GameArtPixel type={type} style={style} className={className} />
}
