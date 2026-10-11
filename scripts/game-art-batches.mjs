// The ART_TYPES games grouped for review: the art is drawn and reviewed one
// batch at a time (scripts/game-art-sheet.mjs --batch=<name>, and
// `npm run art:cutpaper -- --batch=<name>`).
export const BATCHES = {
  'board-a': ['tictactoe', 'sim', 'chomp', 'breakthrough', 'ataxx', 'kamisado', 'onitama', 'quarto', 'santorini', 'loa'],
  'board-b': ['yavalath', 'connectfour', 'dotsandboxes', 'sos', 'arrows', 'gomoku', 'reversi', 'chainreaction', 'blockade', 'orderchaos'],
  'board-c': ['hex', 'battleship', 'faceoff', 'mancala', 'checkers', 'lanterns', 'hunch', 'simon', 'chimp', 'numbermemory', 'visualmemory', 'pairs'],
  'word-dice': ['hangwoman', 'twotruths', 'wordduel', 'wordcoop', 'converge', 'wordrace', 'wordhunt', 'password', 'anagrams', 'dice', 'yacht', 'bluff', 'docking'],
  party: ['herd', 'trivia', 'wavelength', 'fibbage', 'spyfair', 'headsup', 'chameleon', 'sketch', 'codewords', 'justone'],
  'reflex-a': ['reaction', 'aim', 'chopchop', 'firstcut', 'bamboozle', 'sidekick', 'typing', 'math', 'updraft', 'pong'],
  'reflex-b': ['snake', 'tron', 'sumo', 'spaceduel', 'paint', 'pacmac', 'minesweeper', 'airhockey', 'puckrush', 'stickyfingers'],
  'reflex-c': ['bonkbuggies', 'quiver', 'fenderbender', 'artillery', 'darts', 'animalstack', 'birdseye', 'wirecrossed', 'lazysusan'],
}

export const ALL_BATCH_TYPES = Object.values(BATCHES).flat()

// --batch=a,b / --only=x,y → the list of types (all of them when neither is given).
export function pickTypes(argv) {
  const arg = (name) => argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3).split(',')
  const batches = arg('batch')
  const only = arg('only')
  if (only) return only
  if (batches) {
    return batches.flatMap(b => {
      if (!BATCHES[b]) throw new Error(`unknown batch ${b}; known: ${Object.keys(BATCHES).join(', ')}`)
      return BATCHES[b]
    })
  }
  return ALL_BATCH_TYPES
}
