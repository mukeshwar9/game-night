// BIRDSEYE pixel art (rendering only). Each bird has a SIDE view (side and
// crash cams) and a BACK view (what the chase and aim cams see), wing-up and
// wing-down frames, and DART has a tucked dive pose. Sprites are layered so
// wings animate without redrawing bodies; back views are authored as a left
// half and mirrored. Shapes follow the bird's job: PIP round (friendly),
// DART triangular (fast, pierces), TRIO a cluster (splits).
// Colours are theme-token specs: 'tok' | ['tok', k] | ['mix', a, b, t] | 'white' | 'black'.

const mirror = (rows) => rows.map(r => r + [...r.slice(0, -1)].reverse().join(''))

const pipBody = [
  '........BBBB....',
  '......BBBBBBB...',
  '.....BBBBBEEB...',
  '.....BBBBBEKBOO.',
  '..T..BBBBBBBBOOO',
  '.TTTBBBBBCCBBB..',
  'TTTBBBBBBBBBBB..',
  '.TTBBLLLLLLLBB..',
  '...BBLLLLLLLLB..',
  '....BLLLLLLLB...',
  '......LLLLL.....',
  '.......D..D.....',
]
const dartBody = [
  '.........BBBB.......',
  '.......BBBBBBB......',
  '......BBBBBEEBOOOO..',
  '..TT.BBBBBBEKOOOOOOO',
  '.TTTBBBBBBBBXX......',
  'TTTBBBBBBBLLLL......',
  '.TBBBBBLLLLLLL......',
  '...BBLLLLLLLL.......',
  '.....LLLLLL.........',
  '.......D..D.........',
]
const chick = ['....P....', '...BBB...', '..BBBEB..', '..BBBKBO.', '.BBBBBBB.', 'BBLLLLBB.', '.BLLDLLB.', '..LLLLL..', '...D.D...']
const chickBack = mirror(['....P', '...BB', '..BBB', 'SSBBB', '.SBBB', '..BBB', '...TT'])
const chickBackDn = mirror(['....P', '...BB', '..BBB', '..BBB', 'SSBBB', '.SBBB', '...TT'])
const EYE = { E: 'white', K: 'black' }

export const BIRD_ART = {
  pip: {
    pal: { B: 'kam0', L: ['mix', 'kam3', 'white', 0.65], S: ['kam0', 0.72], D: ['kam0', 0.45], T: ['kam0', 0.6], C: 'kam4', O: 'kam7', ...EYE },
    side: [{ art: pipBody }],
    wingUp: [{ art: ['....SS', '...SSS', '..SSDS', '.SSDD.', 'SSDD..', 'SDD...'], dx: 3, dy: -3 }],
    wingDn: [{ art: ['SSSSSS', '.SSSDD', '..SDD.', '...D..'], dx: 3, dy: 6 }],
    back: [{ art: mirror(['.......', '......B', '.....BB', '.....BB', '.....BB', '.....BB', '.....BB', '....BBB', '.....BB', '......T', '.....TT', '....TTT']) }],
    backWing: { art: mirror(['S......', 'SSS....', 'DSSS...', '.DDSS..', '...DS..']), dx: 0, dy: 3 },
  },
  dart: {
    pal: { B: 'kam6', L: 'kam7', S: ['kam6', 0.7], D: ['kam6', 0.45], T: ['kam6', 0.6], X: 'white', O: ['mix', 'text', 'black', 0.5], ...EYE },
    side: [{ art: dartBody }],
    wingUp: [{ art: ['.....SS', '...SSSS', '.SSSSD.', 'SSSDD..'], dx: 4, dy: -3 }],
    wingDn: [{ art: ['SSSSSSS', '..SSSDD', '....DD.'], dx: 4, dy: 5 }],
    back: [{ art: mirror(['.........', '........B', '.......BB', '.......BB', '......BBB', '......BBB', '......BBB', '......BBB', '.......BB', '.......TT', '......TTT']) }],
    backWing: { art: mirror(['S........', 'SSS......', 'DSSSS....', '.DDSSS...', '...DDS...']), dx: 0, dy: 3 },
  },
  trio: {
    pal: { B: 'kam3', L: ['mix', 'kam3', 'white', 0.55], S: ['kam3', 0.7], D: ['kam0', 0.6], P: ['kam0', 0.5], T: ['kam0', 0.6], O: 'kam7', ...EYE },
    side: [{ art: chick, dx: 9, dy: 0 }, { art: chick, dx: 0, dy: 4 }, { art: chick, dx: 8, dy: 7 }],
    wingUp: [{ art: ['.SS', 'SSD'], dx: 10, dy: 4 }, { art: ['.SS', 'SSD'], dx: 1, dy: 8 }, { art: ['.SS', 'SSD'], dx: 9, dy: 11 }],
    wingDn: [{ art: ['SSS', '.SD'], dx: 10, dy: 5 }, { art: ['SSS', '.SD'], dx: 1, dy: 9 }, { art: ['SSS', '.SD'], dx: 9, dy: 12 }],
    back: [{ art: chickBack, dx: 9, dy: 0 }, { art: chickBack, dx: 0, dy: 4 }, { art: chickBack, dx: 8, dy: 7 }],
    backDn: [{ art: chickBackDn, dx: 9, dy: 0 }, { art: chickBackDn, dx: 0, dy: 4 }, { art: chickBackDn, dx: 8, dy: 7 }],
  },
}

// Scarecrow: burlap head, stitched grin, straw hat, plaid shirt, cross-post.
export const CROW_ART = {
  pal: { H: ['kam0', 0.6], S: ['mix', 'kam3', 'white', 0.45], K: 'black', M: ['kam0', 0.5], Y: 'kam3', P: 'p2', G: ['p2', 0.6], T: 'kam0' },
  layers: [{
    art: [
      '.....HHH.....', '....HHHHH....', '..HHHHHHHHH..', '.HHHHHHHHHHH.',
      '...SSSSSSS...', '...SKSSSKS...', '...SSSSSSS...', '...SMSMSMS...', '....SSSSS....',
      'YYYPPPPPPPYYY', 'YYPPPGPPPPPYY', '...PPPGPPP...', '...PPPGPPP...', '....PPPPP....',
      '......T......', '......T......', '......T......',
    ],
  }],
}

/** Layers for a bird in a view ('side' | 'back' | 'tuck' | 'backtuck'), frame 0 wings up / 1 wings down. */
export function birdLayers(id, view, frame) {
  const b = BIRD_ART[id]
  if (view === 'backtuck') return b.back
  if (view === 'back') {
    if (b.backWing) return [{ ...b.backWing, dy: b.backWing.dy + (frame ? 3 : 0) }, ...b.back]
    return frame && b.backDn ? b.backDn : b.back
  }
  if (view === 'tuck') return b.side
  return frame ? [...b.side, ...b.wingDn] : [...b.wingUp, ...b.side]
}
