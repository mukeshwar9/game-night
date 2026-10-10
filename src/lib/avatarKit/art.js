// @ts-check
// Part art for the avatar kit, authored as ASCII pixel grids (legend: compose.js).
// One head kit (skin, eyes, brows, nose, mouth, marks, beard, hair, headwear,
// glasses, earrings) is drawn once and framed two ways by character.js: a bust
// (24x24 tile, head-and-shoulders) and a full-body hero. Every part carries a
// `tier` - 'free' | 'earn' (unlocked by play, never sold) | 'pass' | 'pack' (+ `pack`)
// - so premium items are flagged in the data model. Nothing is gated yet.
//
// Catalog ORDER is wire format (catalog.js stores indices): append, never reorder.

const tex = (rows, fn) => rows.map((r, y) => r.split('').map((c, x) => (c === 'h' && fn(x, y) ? 'H' : c)).join(''))
const rep = (n, row) => Array.from({ length: n }, () => row)

// ── Head (14 wide, 11 tall). Face cols 1..12, ears cols 0 and 13 on rows 5-6.
export const HEAD = {
  rows: [
    '...kkkkkkkk...',
    '..kkkkkkkkkk..',
    '.kkkkkkkkkkkk.',
    '.kkkkkkkkkkkk.',
    '.kkkkkkkkkkkk.',
    'kkkkkkkkkkkkkk',
    'jkkkkkkkkkkkkj',
    '.kkkkkkkkkkkk.',
    '..kkkkkkkkkk..',
    '...kkkkkkkk...',
    '....kkkkkk....',
  ],
}

const at = (y, rows, extra = {}) => ({ y, rows, ...extra })
export const eyes = {
  bright:  { label: 'BRIGHT', tier: 'free', ...at(5, ['...yx....yx...', '...vv....vv...']) },
  dots:    { label: 'DOTS', tier: 'free', ...at(5, ['....x....x....', '....x....x....']) },
  calm:    { label: 'CALM', tier: 'free', ...at(5, ['...nn....nn...', '...xv....xv...']) },
  happy:   { label: 'HAPPY', tier: 'free', ...at(5, ['....x....x....', '...x.x..x.x...']) },
  closed:  { label: 'CLOSED', tier: 'free', ...at(6, ['...xx....xx...']) },
  wink:    { label: 'WINK', tier: 'free', ...at(5, ['...yx....x....', '...vv...x.x...']) },
  lashes:  { label: 'LASHES', tier: 'free', ...at(4, ['..x........x..', '...xx....xx...', '...yv....yv...']) },
  shook:   { label: 'SHOOK', tier: 'free', ...at(4, ['...ww....ww...', '...wx....xw...', '...ww....ww...']) },
  teary:   { label: 'TEARY', tier: 'earn', note: 'Lose a match 0-3', ...at(5, ['...yx....yx...', '...vv....vv...', '...w......w...']) },
  heart:   { label: 'SMITTEN', tier: 'free', ...at(4, ['...t.t..t.t...', '...ttt..ttt...', '....t....t....']) },
  starry:  { label: 'STARRY', tier: 'pass', anim: 1, ...at(5, ['...*x....*x...', '...vv....vv...']) },
  laser:   { label: 'LASER', tier: 'pass', anim: 1, map: { N: { ramp: 'neon', s: 3 }, M: { ramp: 'neon', s: 4 } }, ...at(5, ['...MN....MN...', '...NN....NN...']) },
}
export const brows = {
  none:    { label: 'NONE', tier: 'free' },
  soft:    { label: 'SOFT', tier: 'free', ...at(3, ['...HH....HH...']) },
  thick:   { label: 'THICK', tier: 'free', ...at(3, ['..HHH....HHH..']) },
  angry:   { label: 'FIERCE', tier: 'free', ...at(3, ['..H........H..', '...HH....HH...']) },
  worried: { label: 'WORRIED', tier: 'free', ...at(3, ['....H....H....', '..HH......HH..']) },
  raised:  { label: 'RAISED', tier: 'free', ...at(2, ['...HH....HH...']) },
}
export const nose = {
  none:   { label: 'NONE', tier: 'free' },
  dot:    { label: 'DOT', tier: 'free', ...at(7, ['......j.......']) },
  button: { label: 'BUTTON', tier: 'free', ...at(7, ['......jj......']) },
  line:   { label: 'LINE', tier: 'free', ...at(6, ['.......j......', '......jj......']) },
}
export const mouth = {
  smile:  { label: 'SMILE', tier: 'free', ...at(8, ['.....n..n.....', '......nn......']) },
  grin:   { label: 'GRIN', tier: 'free', ...at(8, ['....zzzzzz....', '.....zttz.....']) },
  flat:   { label: 'CHILL', tier: 'free', ...at(8, ['.....nnnn.....']) },
  o:      { label: 'OOH', tier: 'free', ...at(8, ['......zz......', '......zz......']) },
  smirk:  { label: 'SMIRK', tier: 'free', ...at(8, ['........n.....', '.....nnn......']) },
  frown:  { label: 'FROWN', tier: 'free', ...at(8, ['......nn......', '.....n..n.....']) },
  teeth:  { label: 'YIKES', tier: 'free', ...at(8, ['....nnnnnn....', '....nTTTTn....']) },
  tongue: { label: 'BLEH', tier: 'free', ...at(8, ['.....nnnn.....', '......tt......']) },
  cat:    { label: 'KITTY', tier: 'free', ...at(8, ['....n.nn.n....', '.....n..n.....']) },
  lips:   { label: 'LIPS', tier: 'free', ...at(8, ['.....tttt.....', '......tt......']) },
  laugh:  { label: 'LOL', tier: 'earn', note: 'Win a party round', ...at(8, ['....zzzzzz....', '....zzzzzz....', '.....tttt.....']) },
}
export const marks = {
  none:     { label: 'NONE', tier: 'free' },
  blush:    { label: 'BLUSH', tier: 'free', ...at(7, ['..rr......rr..']) },
  freckles: { label: 'FRECKLES', tier: 'free', ...at(6, ['..............', '..j.j....j.j..']) },
  both:     { label: 'BLUSH+FRECKLE', tier: 'free', ...at(7, ['.rjr......rjr.']) },
  bandaid:  { label: 'BANDAID', tier: 'free', map: { W: { ramp: 'white', s: 3 }, B: { ramp: 'orange', s: 3 } }, ...at(6, ['.........WBW..']) },
  paint:    { label: 'WAR PAINT', tier: 'free', map: { P: { ramp: 'red', s: 2 } }, ...at(6, ['.PP.......PP..', '..PP......PP..']) },
  sticker:  { label: 'STAR STICKER', tier: 'pass', anim: 1, map: { S: { ramp: 'goldfx', s: 3 } }, ...at(6, ['..S...........', '.SSS..........', '..S...........']) },
}
export const beard = {
  none:     { label: 'NONE', tier: 'free' },
  stubble:  { label: 'STUBBLE', tier: 'free', ...at(7, ['.u..........u.', '.uu........uu.', '..uuuuuuuuuu..', '...uuuuuuuu...']) },
  mustache: { label: 'MUSTACHE', tier: 'free', ...at(7, ['....hhhhhh....', '...h......h...']) },
  goatee:   { label: 'GOATEE', tier: 'free', ...at(9, ['.....hhhh.....', '.....hhhh.....']) },
  beard:    { label: 'BEARD', tier: 'free', ...at(5, ['.h..........h.', '.h..........h.', '.hh........hh.', '.hhh......hhh.', '..hhhhhhhhhh..', '...hhhhhhhh...', '....hhhhhh....']) },
}

// ── Hair: 16-wide box at head (-1, -3). Head sits at box rows 3..13, ears box 1/14.
const box = (front, back, extra = {}) => ({ front: front && { rows: front, cast: true, shade: 'rim' }, back: back && { rows: back }, ...extra })
export const hair = {
  bald: { label: 'BALD', tier: 'free', ...box(null, null) },
  buzz: { label: 'BUZZ', tier: 'free', ...box(['', '', '', '....uuuuuuuu....', '...uuuuuuuuuu...', '..uu........uu..', '..u..........u..']) },
  crop: { label: 'CROP', tier: 'free', ...box(['', '', '.....hhhhhh.....', '...hhhhhhhhhh...', '..hhhhHhhhhhhh..', '..hhHhhhhhHhhh..', '..h..........h..', '..h..........h..']) },
  spiky: { label: 'SPIKY', tier: 'free', ...box(['....h..h..h.....', '...hh.hhh.hhh...', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '..hhhhhhhhhhhh..', '..hhh.hhhh.hhh..', '..h..h....h..h..']) },
  sweep: { label: 'SWEEP', tier: 'free', ...box(['', '', '....hhhhhhh.....', '..hhhhhhhhhhh...', '.hhhhhhhhhhhhh..', '.hhhhhhhhhh.hhh.', '.hhhhhhh.....hh.', '.hhh.........hh.', '.hh.............']) },
  mohawk: { label: 'MOHAWK', tier: 'free', ...box(['.......hh.......', '......hhhh......', '......hhhh......', '....uuhhhhuu....', '...uuuhhhhuuu...', '..uu........uu..']) },
  curly: {
    label: 'CURLS', tier: 'free',
    ...box(tex(['....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', 'hhhhhhhhhhhhhhhh', 'hhhhhhhhhhhhhhhh', 'hhhhhhhhhhhhhhhh', 'hhhh........hhhh', 'hhh..........hhh', 'hh............hh', 'hh............hh', 'hhh..........hhh', '.hh..........hh.'], (x, y) => (x * 3 + y * 5) % 7 === 0)),
  },
  puff: { label: 'HIGH PUFF', tier: 'free', ...box(tex(['...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..hhhhhhhhhhhh..', '...hhhhhhhhhh...', '...hhhhhhhhhh...', '..hh........hh..'], (x, y) => (x + y * 3) % 5 === 0)) },
  bob: { label: 'BOB', tier: 'free', ...box(['', '', '....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '.hhhhhhhhhhhhhh.', '.hhHhhhhhhhHhhh.', '.hh..........hh.', '.hh..........hh.', '.hh..........hh.', '.hh..........hh.', '.hhh........hhh.', '..hh........hh..']) },
  pixie: { label: 'PIXIE', tier: 'free', ...box(['', '', '.....hhhhhh.....', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..hhhhhhhhhhhhh.', '..hhhhhh.....hh.', '..hh.........h..', '..h.............']) },
  curtains: { label: 'CURTAINS', tier: 'free', ...box(['', '', '....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '.hhhhhh..hhhhhh.', '.hhhh......hhhh.', '.hhh........hhh.', '.hh..........hh.', '.hh..........hh.']) },
  long: {
    label: 'LONG', tier: 'free',
    ...box(['', '', '....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '.hhhhhh..hhhhhh.', '.hhhh......hhhh.', '.hhh........hhh.', ...rep(6, '.hh..........hh.')],
      ['', '', '', '', ...rep(12, 'hhhhhhhhhhhhhhhh'), '.hhhhhhhhhhhhhh.', '.hhhhh....hhhhh.', '..hhh......hhh..']),
  },
  wavy: {
    label: 'WAVES', tier: 'free',
    ...box(['', '', '....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '.hhhhhhhh.hhhhh.', 'hhhhh......hhhhh', 'hhh..........hhh', '.hh..........hh.', 'hh............hh', 'hhh..........hhh', '.hh..........hh.', 'hh............hh'],
      ['', '', '', '', ...rep(4, 'hhhhhhhhhhhhhhhh'), '.hhhhhhhhhhhhhh.', 'hhhhhhhhhhhhhhhh', 'hhhhhhhhhhhhhhhh', '.hhhhhhhhhhhhhh.', 'hhhhhhhhhhhhhhhh', 'hhhhhh....hhhhhh', '.hhh........hhh.', 'hhh..........hhh']),
  },
  bun: { label: 'BUN', tier: 'free', ...box(['......hhhh......', '.....hhHHhh.....', '......hhhh......', '....hhhhhhhh....', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..h..........h..']) },
  spacebuns: { label: 'SPACE BUNS', tier: 'free', ...box(['.hhh........hhh.', 'hhHhh......hhHhh', 'hhhhhhhhhhhhhhhh', '.hhhhhhhhhhhhhh.', '..hhhhhhhhhhhh..', '..hhhhhhhhhhhh..', '..h..........h..']) },
  ponytail: {
    label: 'PONYTAIL', tier: 'free',
    ...box(['', '', '.....hhhhhh.....', '...hhhhhhhhhh...', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhh..', '..h..........h..'],
      ['', '', '', '', '..............hh', '.............hhh', '.............hhh', '..............hh', '..............hh', '.............hhh', '.............hh.', '............hhh.', '............hh..']),
  },
  twintails: {
    label: 'TWIN TAILS', tier: 'free', map: { B: { ramp: 'pink', s: 3 } },
    ...box(['', '', '....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '.hhhhhhhhhhhhhh.', '.Bh..........hB.', '..h..........h..'],
      ['', '', '', '', '', '', 'hh............hh', 'hhh..........hhh', 'hhh..........hhh', 'hhh..........hhh', 'hhh..........hhh', '.hh..........hh.', '.hhh........hhh.', '..hh........hh..', '..hh........hh..', '...h........h...']),
  },
  braids: {
    label: 'BRAIDS', tier: 'free',
    ...box(['', '', '....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '.hhhhhh..hhhhhh.', '.hh..........hh.', '.hh..........hh.'],
      tex(['', '', '', '', '', '', ...rep(12, 'hhh..........hhh'), '.hh..........hh.', '.h............h.'], (x, y) => (y % 2 === 0) !== (x % 2 === 0))),
  },
  locs: {
    label: 'LOCS', tier: 'free',
    ...box(tex(['', '....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', 'hhhhhhhhhhhhhhhh', 'hhhhhh....hhhhhh', 'hhhh........hhhh', 'hhh..........hhh', 'hh............hh', 'hh............hh', 'hh............hh', 'hh............hh', 'h.h..........h.h'], (x) => x % 2 === 1),
      tex(['', '', '', '', ...rep(12, 'hhhhhhhhhhhhhhhh'), 'h.hhhhhhhhhhhh.h', 'h.h.hh....hh.h.h'], (x) => x % 2 === 1)),
  },
}

// ── Headwear, same box. hide: 'front' drops the hair front, 'all' drops all hair.
export const hat = {
  none: { label: 'NONE', tier: 'free' },
  cap: { label: 'CAP', tier: 'free', cast: true, rows: ['', '.....######.....', '...##########...', '..####@@######..', '..############..', '..##############'] },
  beanie: { label: 'BEANIE', tier: 'free', cast: true, hide: 'top', rows: ['.......@@.......', '.....######.....', '...##########...', '..############..', '..############..', '.cbcbcbcbcbcbcb.'] },
  crown: { label: 'CROWN', tier: 'free', cast: true, map: { '#': { ramp: 'gold', s: 'auto' }, R: { ramp: 'red', s: 3 } }, rows: ['...#...##...#...', '...##.####.##...', '...##########...', '...#R#R##R#R#...', '...##########...'] },
  headband: { label: 'SPORT BAND', tier: 'free', rows: ['', '', '', '', '', '..############..', '..@@@@@@@@@@@@..'] },
  bandana: { label: 'BANDANA', tier: 'free', cast: true, hide: 'top', rows: ['', '', '.....######.....', '...####@#####...', '..##@######@##..', '..############.#', '..............##'] },
  flowers: { label: 'FLOWER CROWN', tier: 'free', map: { R: { ramp: 'pink', s: 3 }, Y: { ramp: 'yellow', s: 3 }, P: { ramp: 'purple', s: 3 }, G: { ramp: 'green', s: 2 } }, rows: ['', '', '', '..RR.YY.PP.RR...', '.RRGYYGPPGRRG...', '..GG.GG.GG.GG...'] },
  catears: { label: 'CAT EARS', tier: 'free', map: { P: { ramp: 'pink', s: 3 } }, rows: ['..##........##..', '..#P#......#P#..', '..###......###..', '...##########...'] },
  beret: { label: 'BERET', tier: 'free', cast: true, rows: ['......#.........', '.....######.....', '..##########....', '.############...', '..##########....'] },
  cowboy: { label: 'COWBOY', tier: 'free', cast: true, rows: ['.....##..##.....', '....########....', '....########....', '....@@@@@@@@....', '################', '.#............#.'] },
  wizard: { label: 'WIZARD', tier: 'free', cast: true, rows: ['.........##.....', '........###.....', '.......###......', '......##@##.....', '....##@#####....', '################'] },
  party: { label: 'PARTY', tier: 'free', rows: ['.......@@.......', '.......##.......', '......#@##......', '......##@#......', '.....#@##@#.....'] },
  hijab: {
    label: 'HIJAB', tier: 'free', hide: 'all', layer: 'over',
    rows: ['', '.....######.....', '...##########...', '..############..', '.##############.', '.###........###.', '.##..........##.', '##............##', '##............##', '##............##', '.##..........##.', '.###........###.', '..###......###..', '...####..####...', '....########....', '..############..', '.##############.', '################', '################', '################', '################'],
  },
  headphones: { label: 'HEADPHONES', tier: 'free', rows: ['', '', '...##########...', '..#..........#..', '.#............#.', '.#............#.', '@@............@@', '@@............@@', '@@............@@'] },
  propeller: {
    label: 'PROPELLER', tier: 'earn', note: 'Play 10 different games', anim: 6, cast: true, map: { P: { ramp: 'yellow', s: 3 }, Q: { ramp: 'red', s: 2 } },
    frames: [
      ['....PPPPQQQQ....', '.......##.......', '.....#@#@#@.....', '....#@#@#@#@....', '...##########...'],
      ['.......PQ.......', '.......##.......', '.....#@#@#@.....', '....#@#@#@#@....', '...##########...'],
      ['....QQQQPPPP....', '.......##.......', '.....#@#@#@.....', '....#@#@#@#@....', '...##########...'],
      ['.......QP.......', '.......##.......', '.....#@#@#@.....', '....#@#@#@#@....', '...##########...'],
    ],
  },
  halo: {
    label: 'HALO', tier: 'pass', anim: 3, map: { '#': { ramp: 'goldfx', s: 3 }, O: { ramp: 'goldfx', s: 1 } },
    frames: [['....########....', '...#........#...', '....OOOOOOOO....'], ['', '....########....', '...#........#...', '....OOOOOOOO....']],
  },
  flame: {
    label: 'ON FIRE', tier: 'pass', anim: 8, map: { 1: { ramp: 'lava', s: 1 }, 2: { ramp: 'lava', s: 2 }, 3: { ramp: 'lava', s: 3 }, 4: { ramp: 'lava', s: 4 } },
    frames: [
      ['......2..2......', '.2...22.322..2..', '.22.2332332.22..', '..22333443332...', '...23334444332..'],
      ['.....2....2.....', '..2...22..322...', '..22.23322332.2.', '...22333444332..', '...23334444332..'],
      ['.......2.2......', '...2..322.22....', '.2.22.33233322..', '..22.23334433...', '...23334444332..'],
    ],
  },
  royal: {
    label: 'ROYAL CROWN', tier: 'pack', pack: 'royal', anim: 1, cast: true,
    map: { '#': { ramp: 'goldfx', s: 'auto' }, R: { ramp: 'red', s: 3 }, B: { ramp: 'sky', s: 3 }, G: { ramp: 'green', s: 3 }, W: { ramp: 'white', s: 4 } },
    rows: ['..W....WW....W..', '..#...####...#..', '..##.##BB##.##..', '..###.#BB#.###..', '..############..', '..#R#G#RR#G#R#..', '..############..'],
  },
  astro: {
    label: 'ASTRO HELMET', tier: 'pass', layer: 'over', anim: 1, map: { '#': { ramp: 'white', s: 'auto' }, A: { ramp: 'ice', s: 3 } },
    rows: ['.....######.....', '...##LLLLLL##...', '..#LyLLLLLLLL#..', '.#LyLLLLLLLLLL#.', '#LLLLLLLLLLLLLL#', '#LLLLLLLLLLLLLL#', '#LLLLLLLLLLLLLL#', '#LLLLLLLLLLLLLL#', '#LLLLLLLLLLLLLL#', '#LLLLLLLLLLLLLL#', '#LLLLLLLLLLLLLL#', '.#LLLLLLLLLLLL#.', '..#LLLLLLLLLL#..', '.AA##########AA.', '..AAAAAAAAAAAA..'],
  },
  devil: { label: 'DEVIL HORNS', tier: 'pass', anim: 1, map: { '#': { ramp: 'lava', s: 'auto' } }, rows: ['', '.#............#.', '.##..........##.', '..##........##..'] },
  dino: {
    label: 'DINO HOOD', tier: 'pack', pack: 'dragon', hide: 'all', layer: 'over', cast: true, map: { S: { ramp: 'yellow', s: 3 }, W: { ramp: 'white', s: 4 } },
    rows: ['......S.S.......', '....#S#S#S##....', '..############..', '.##############.', '.#W.W.W.W.W.W.#.', '.##..........##.', '##............##', '##............##', '##............##', '.#............#.'],
  },
}

export const glasses = {
  none:   { label: 'NONE', tier: 'free' },
  round:  { label: 'ROUND', tier: 'free', map: { 0: { ramp: 'black', s: 1 } }, ...at(4, ['...00....00...', '..0LL0000LL0..', '..0LL0..0LL0..', '...00....00...']) },
  square: { label: 'NERD', tier: 'free', map: { 0: { ramp: 'black', s: 1 } }, ...at(4, ['..0000..0000..', '..0LL0000LL0..', '..0LL0..0LL0..', '..0000..0000..']) },
  shades: { label: 'SHADES', tier: 'free', ...at(4, ['..DDDDDDDDDD..', '..DyDD..DyDD..', '...DD....DD...']) },
  threed: { label: '3D', tier: 'free', map: { 0: { ramp: 'white', s: 3 }, R: { ramp: 'red', s: 3 }, B: { ramp: 'sky', s: 3 } }, ...at(4, ['..0000000000..', '..0RR0000BB0..', '..0RR0..0BB0..', '..0000..0000..']) },
  monocle:{ label: 'MONOCLE', tier: 'free', map: { 0: { ramp: 'gold', s: 2 } }, ...at(4, ['.........000..', '........0LL0..', '........0LL0..', '.........000..']) },
  patch:  { label: 'PATCH', tier: 'free', ...at(4, ['.xxxxxxxxxxxx.', '..DDD.........', '..DDD.........', '...D..........']) },
  visor:  { label: 'CYBER VISOR', tier: 'pass', anim: 1, map: { N: { ramp: 'neon', s: 3 }, M: { ramp: 'neon', s: 2 } }, ...at(5, ['.NNNNNNNNNNNN.', '.MMMMMMMMMMMM.']) },
  hearts: { label: 'HEART SHADES', tier: 'pack', pack: 'party', map: { P: { ramp: 'pink', s: 3 }, Q: { ramp: 'pink', s: 1 } }, ...at(4, ['..PP.P..PP.P..', '..PPPPQQPPPP..', '...PPP..PPP...', '....P....P....']) },
  stars:  { label: 'STAR SHADES', tier: 'pack', pack: 'party', anim: 1, map: { '#': { ramp: 'holo', s: 3 } }, ...at(4, ['...#......#...', '..###....###..', '...#......#...', '..#.#....#.#..']) },
}

export const extra = {
  none:   { label: 'NONE', tier: 'free' },
  studs:  { label: 'STUDS', tier: 'free', map: { G: { ramp: 'gold', s: 3 } }, ...at(7, ['G............G']) },
  hoops:  { label: 'HOOPS', tier: 'free', map: { G: { ramp: 'gold', s: 3 } }, ...at(7, ['G............G', 'G............G']) },
  pearls: { label: 'PEARLS', tier: 'pack', pack: 'royal', map: { W: { ramp: 'white', s: 4 } }, ...at(7, ['W............W', 'W............W']) },
}

// ── PORTRAIT tops (bust, tile rows 15..23)
const neck = ['..........kkkk..........', '..........jkkj..........']
export const tops = {
  tee: { label: 'TEE', tier: 'free', y: 15, rows: [...neck, '......####@jj@####......', '....######@@@@######....', '...##################...', '..####################..', '..####################..', '.######################.', '.######################.'] },
  hoodie: { label: 'HOODIE', tier: 'free', y: 15, map: { W: { ramp: 'white', s: 3 } }, rows: ['........@@kkkk@@........', '.......@@@jkkj@@@.......', '.....####@@jj@@####.....', '....######@@@@######....', '...#######W##W#######...', '..########W##W########..', '..####################..', '.#####111111111111#####.', '.######################.'] },
  shirt: { label: 'BUTTON-UP', tier: 'free', y: 15, map: { W: { ramp: 'white', s: 3 } }, rows: [...neck, '......####WjjW####......', '....#######@@#######....', '...########@@########...', '..#########@@#########..', '..#########@@#########..', '.##########@@##########.', '.##########@@##########.'] },
  jacket: { label: 'JACKET', tier: 'free', y: 15, rows: [...neck, '......####@jj@####......', '....#####@@@@@@#####....', '...######1@@@@1######...', '..#######1@@@@1#######..', '..#######1@@@@1#######..', '.########1@@@@1########.', '.########1@@@@1########.'] },
  sweater: { label: 'SWEATER', tier: 'free', y: 15, rows: ['..........####..........', '..........####..........', '......############......', '....################....', '...##################...', '..@@@@@@@@@@@@@@@@@@@@..', '..####################..', '.@@@@@@@@@@@@@@@@@@@@@@.', '.######################.'] },
  overalls: { label: 'OVERALLS', tier: 'free', y: 15, map: { Y: { ramp: 'yellow', s: 3 } }, rows: [...neck, '......@@@@@jj@@@@@......', '....@@@#@@@@@@@@#@@@....', '...@@@@#@@@@@@@@#@@@@...', '..@@@@@##########@@@@@..', '..@@@@@###Y##Y###@@@@@..', '.@@@@@@##########@@@@@@.', '.@@@@@@##########@@@@@@.'] },
  cape: { label: 'HERO CAPE', tier: 'free', y: 15, rows: [...neck, '....@@####@jj@####@@....', '...@@######@@######@@...', '..@@################@@..', '.@@##################@@.', '.@@##################@@.', '@@####################@@', '@@####################@@'] },
  tux: { label: 'TUXEDO', tier: 'pack', pack: 'royal', y: 15, map: { '#': { ramp: 'black', s: 'auto' }, W: { ramp: 'white', s: 3 }, G: { ramp: 'goldfx', s: 3 } }, anim: 1, rows: [...neck, '......####WGGW####......', '....#####WGGGGW#####....', '...######1WWWW1######...', '..#######1WWWW1#######..', '..#######1WWWW1#######..', '.########1WWWW1########.', '.########1WWWW1########.'] },
  space: { label: 'SPACE SUIT', tier: 'pass', y: 15, anim: 1, map: { '#': { ramp: 'white', s: 'auto' }, S: { ramp: 'silver', s: 'auto' }, R: { ramp: 'red', s: 2 }, G: { ramp: 'lime', s: 3 } }, rows: ['........SSkkkkSS........', '.......SSSjkkjSSS.......', '.....###SSSSSSSS###.....', '....################....', '...######@@@@@@######...', '..#######@*R*G@#######..', '..#######@@@@@@#######..', '.######################.', '.#####1##########1#####.'] },
  robe: { label: 'ROYAL ROBE', tier: 'pack', pack: 'royal', y: 15, anim: 1, map: { W: { ramp: 'white', s: 4 }, X: { rgb: [27, 20, 38] }, G: { ramp: 'goldfx', s: 3 } }, rows: [...neck, '....WWWWXWjjWXWWWW......'.slice(0, 24), '...WXWWWWW@@WWWWWXW.....'.slice(0, 24), '..WWW#####G@@G####WWW...'.slice(0, 24), '..W#######@@@@#######W..', '.W########@GG@########W.', '.#########@@@@#########.', '##########@@@@##########'] },
}

// ── HERO bodies (chibi, tile rows 14..21). '#' top, '@' bottom, '%' shoes.
const C = { '%': { slot: 'shoes', s: 'auto' } }
export const outfits = {
  casual: { label: 'TEE + JEANS', tier: 'free', y: 14, map: C, rows: ['.........#kkkk#.........', '.......##########.......', '......#1########1#......', '......k##########k......', '........@@@@@@@@........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'] },
  hoodie: { label: 'HOODIE', tier: 'free', y: 14, map: { ...C, W: { ramp: 'white', s: 3 } }, rows: ['........##kkkk##........', '.......####WW####.......', '......#1###WW###1#......', '......k####WW####k......', '........@@@@@@@@........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'] },
  overalls: { label: 'OVERALLS', tier: 'free', y: 14, map: { ...C, Y: { ramp: 'yellow', s: 3 } }, rows: ['.........@kkkk@.........', '.......@@#@@@@#@@.......', '......@1@######@1@......', '......k@##Y##Y##@k......', '........########........', '........###..###........', '........###..###........', '.......%%%%..%%%%.......'] },
  dress: { label: 'DRESS', tier: 'free', y: 14, map: C, rows: ['.........#kkkk#.........', '.......##########.......', '......#1###@@###1#......', '......k####@@####k......', '.......##########.......', '......############......', '........kk....kk........', '.......%%%%..%%%%.......'] },
  suit: { label: 'SUIT', tier: 'free', y: 14, map: { ...C, W: { ramp: 'white', s: 3 }, T: { ramp: 'red', s: 2 } }, rows: ['.........#WkkW#.........', '.......####TT####.......', '......#1##1TT1##1#......', '......k###1TT1###k......', '........@@@@@@@@........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'] },
  robe: { label: 'WIZARD ROBE', tier: 'free', y: 14, map: { ...C, S: { ramp: 'yellow', s: 4 } }, rows: ['.........#kkkk#.........', '.......##########.......', '......#1##S#####1#......', '......k##########k......', '.......#####S####.......', '......############......', '......###S#####S##......', '.......%%%%..%%%%.......'] },
  pjs: { label: 'PAJAMAS', tier: 'earn', note: 'Play after midnight', y: 14, map: C, rows: ['.........#kkkk#.........', '.......#@#@#@#@#@.......', '......#1@#@#@#@#1#......', '......k#@#@#@#@#@k......', '........#@#@#@#@........', '........#@#..#@#........', '........#@#..#@#........', '.......%%%%..%%%%.......'] },
  astro: { label: 'ASTRONAUT', tier: 'pass', anim: 1, y: 14, map: { '#': { ramp: 'white', s: 'auto' }, '@': { ramp: 'white', s: 'auto', group: 'b' }, '%': { ramp: 'grey', s: 'auto' }, S: { ramp: 'silver', s: 2 }, R: { ramp: 'red', s: 2 }, G: { ramp: 'lime', s: 3 } }, rows: ['........SSSSSSSS........', '.......##########.......', '......#1#S*R*G##1#......', '......S##########S......', '........SSSSSSSS........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'] },
  knight: { label: 'KNIGHT', tier: 'pack', pack: 'royal', anim: 1, y: 14, map: { '#': { ramp: 'silver', s: 'auto' }, '@': { ramp: 'silver', s: 'auto', group: 'b' }, '%': { ramp: 'grey', s: 'auto' }, R: { ramp: 'red', s: 2 }, G: { ramp: 'goldfx', s: 3 } }, rows: ['.........#GGGG#.........', '.......####RR####.......', '......#1##RRRR##1#......', '......#####RR#####......', '........@@GGGG@@........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'] },
  dino: { label: 'DINO ONESIE', tier: 'pack', pack: 'dragon', y: 14, map: { '%': { ramp: 'yellow', s: 'auto' }, Y: { ramp: 'yellow', s: 3 } }, rows: ['.........#kkkk#.........', '.......#########........', '......#1#YYYY##1#.......', '......####YYYY####......', '........######.###......', '........###..#####......', '........###..###.##.....', '.......%%%%..%%%%.......'] },
}

// Pose overlays for HERO: arms and a jump offset. 'E' erases the idle arm.
export const POSES = {
  idle: { label: 'IDLE', tier: 'free', frames: [[]] },
  wave: {
    label: 'WAVE', tier: 'free', frames: [
      [{ y: 7, rows: ['...................kk...', '...................##...', '...................##...', '..................##....', '..................##....', '.................##.....', '.................##.....', '................##......', '................##......', '................#E......', '.................E......'] }],
      [{ y: 7, rows: ['....................kk..', '...................##...', '...................##...', '..................##....', '..................##....', '.................##.....', '.................##.....', '................##......', '................##......', '................#E......', '.................E......'] }],
    ],
  },
  cheer: {
    label: 'CHEER', tier: 'free', frames: [
      [{ y: 7, rows: ['...kk..............kk...', '...##..............##...', '...##..............##...', '....##............##....', '....##............##....', '.....##..........##.....', '.....##..........##.....', '......##........##......', '......##........##......', '......E#........#E......', '......E..........E......'] }],
      [{ y: 6, rows: ['...kk..............kk...', '...##..............##...', '...##..............##...', '....##............##....', '....##............##....', '.....##..........##.....', '.....##..........##.....', '......##........##......', '......##........##......', '......##........##......', '......E#........#E......', '......E..........E......'] }],
    ],
    dy: [0, -1],
  },
  hop: { label: 'HOP', tier: 'free', frames: [[]], dy: [0, -1, -2, -1] },
  dance: { label: 'DANCE', tier: 'pass', frames: [[]], dx: [0, 1, 0, -1] },
}

// Companions sit bottom-right, in front of the body.
const P = (rows, extra = {}) => ({ x: 17, y: 17, rows, ...extra })
export const pets = {
  none:  { label: 'NONE', tier: 'free' },
  duck:  { label: 'DUCK', tier: 'free', ...P(['.##....', '#x#O...', '###....', '######.', '#######', '.#####.'], { map: { '#': { ramp: 'yellow', s: 'auto' }, O: { ramp: 'orange', s: 2 } } }) },
  kitten:{ label: 'KITTEN', tier: 'free', ...P(['.......', '#...#..', '#####..', '#x#x#.#', '#####.#', '.#.#.#.'], { map: { '#': { ramp: 'orange', s: 'auto' } } }) },
  slime: { label: 'SLIME', tier: 'earn', note: 'Play 100 games', ...P(['.......', '..###..', '.#####.', '##x#x##', '#######', '.#####.'], { map: { '#': { ramp: 'lime', s: 'auto' } } }) },
  ghost: {
    label: 'BOO', tier: 'pass', anim: 3, map: { '#': { ramp: 'white', s: 'auto' } },
    frames: [
      P(['.......', '..###..', '.#####.', '.#x#x#.', '.#####.', '.#.#.#.']).rows,
      P(['..###..', '.#####.', '.#x#x#.', '.#####.', '.#.#.#.', '.......']).rows,
    ], x: 17, y: 17,
  },
  ufo: {
    label: 'UFO', tier: 'pass', anim: 4, x: 17, y: 16, map: { '#': { ramp: 'silver', s: 'auto' }, G: { ramp: 'lime', s: 3 }, Y: { ramp: 'yellow', s: 4 } },
    frames: [
      ['..GG...', '.#GG#..', '#######', '.#Y#Y#.', '..Y.Y..', '.......', '.......'],
      ['..GG...', '.#GG#..', '#######', '.#Y#Y#.', '.......', '..Y.Y..', '.Y...Y.'],
    ],
  },
  drake: {
    label: 'MINI DRAKE', tier: 'pack', pack: 'dragon', anim: 4, x: 17, y: 16, map: { '#': { ramp: 'purple', s: 'auto' }, W: { ramp: 'pink', s: 3 }, F: { ramp: 'lava', s: 3 } },
    frames: [
      ['W......', 'WW.##..', '.W####x', '..#####', '.####F.', '.#..#..', '.......'],
      ['.......', '...##..', 'WW####x', '.W#####', '.####..', '.#..#..', '.......'],
    ],
  },
}


// ── Extra hero bodies and busts for the unified outfit list ─────────────────
outfits.shirt = { label: 'BUTTON-UP', tier: 'free', y: 14, map: { ...C, W: { ramp: 'white', s: 3 } }, rows: ['.........#WkkW#.........', '.......#####W####.......', '......#1####W###1#......', '......k#####W####k......', '........@@@@@@@@........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'] }
outfits.sweater = { label: 'SWEATER', tier: 'free', y: 14, map: C, rows: ['.........@kkkk@.........', '.......##########.......', '......#1########1#......', '......k@@@@@@@@@@k......', '........@@@@@@@@........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'] }
outfits.cape = { label: 'HERO CAPE', tier: 'free', y: 14, map: { ...C, C: { ramp: 'red', s: 'auto' } }, rows: ['.........#kkkk#.........', '.....CC##########CC.....', '....CC#1########1#CC....', '....CCk##########kCC....', '....CC..@@@@@@@@..CC....', '....C...@@@..@@@...C....', '........@@@..@@@........', '.......%%%%..%%%%.......'] }
tops.armor = { label: 'ARMOUR', tier: 'pack', pack: 'royal', y: 15, anim: 1, map: { '#': { ramp: 'silver', s: 'auto' }, '@': { ramp: 'grey', s: 'auto' }, 1: { ramp: 'silver', s: 1 } }, rows: [...neck, '......####@jj@####......', '....#####@@@@@@#####....', '...######1@@@@1######...', '..#######1@@@@1#######..', '..#######1@@@@1#######..', '.########1@@@@1########.', '.########1@@@@1########.'] }
tops.cape.map = { '@': { ramp: 'red', s: 'auto' } }

// ── Outfits: one id, two framings. `body` is the full-body hero art, `bust` the
// head-and-shoulders art, so a player dresses once and both views agree. `bodyMap`
// and `bustMap` re-point glyphs for fixed-look premium costumes.
export const OUTFITS = {
  casual: { label: 'TEE + JEANS', tier: 'free', body: 'casual', bust: 'tee' },
  hoodie: { label: 'HOODIE', tier: 'free', body: 'hoodie', bust: 'hoodie' },
  shirt: { label: 'BUTTON-UP', tier: 'free', body: 'shirt', bust: 'shirt' },
  suit: { label: 'SUIT', tier: 'free', body: 'suit', bust: 'jacket' },
  sweater: { label: 'SWEATER', tier: 'free', body: 'sweater', bust: 'sweater' },
  overalls: { label: 'OVERALLS', tier: 'free', body: 'overalls', bust: 'overalls' },
  dress: { label: 'DRESS', tier: 'free', body: 'dress', bust: 'tee' },
  cape: { label: 'HERO CAPE', tier: 'free', body: 'cape', bust: 'cape' },
  wizard: { label: 'WIZARD ROBE', tier: 'free', body: 'robe', bust: 'sweater' },
  pjs: { label: 'PAJAMAS', tier: 'earn', note: 'Play after midnight', body: 'pjs', bust: 'shirt' },
  astro: { label: 'ASTRONAUT', tier: 'pass', anim: 1, body: 'astro', bust: 'space' },
  knight: { label: 'KNIGHT', tier: 'pack', pack: 'royal', anim: 1, body: 'knight', bust: 'armor' },
  tux: {
    label: 'TUXEDO', tier: 'pack', pack: 'royal', anim: 1, body: 'suit', bust: 'tux',
    bodyMap: { '#': { ramp: 'black', s: 'auto' }, '@': { ramp: 'black', s: 'auto', group: 'b' }, T: { ramp: 'goldfx', s: 3 } },
  },
  royalrobe: {
    label: 'ROYAL ROBE', tier: 'pack', pack: 'royal', anim: 1, body: 'robe', bust: 'robe',
    bodyMap: { '#': { ramp: 'white', s: 'auto' }, S: { ramp: 'goldfx', s: 3 } },
  },
  dino: { label: 'DINO ONESIE', tier: 'pack', pack: 'dragon', body: 'dino', bust: 'hoodie', bustMap: { W: { ramp: 'yellow', s: 3 } } },
}

// ── Arrows campaign rewards ─────────────────────────────────────────────────
// Earned by campaign stars in Arrows (src/lib/arrowsRewardsLogic.js is the ladder
// and must agree with the `earn` stars below; its test checks). All APPENDED to the
// catalogs above. The backdrops and frames live in compose.js.
const arrowsEarn = (stars, more = '') => ({ tier: 'earn', note: `${stars}★ in Arrows${more}`, earn: { game: 'arrows', stars } })

hat.arrowband = {
  label: 'ARROW BAND', ...arrowsEarn(200), map: { W: { ramp: 'white', s: 4 } },
  rows: ['', '', '', '', '.##############.', '.#W##W##W##W##W#', '.##############.'],
}
hat.arrowcrown = {
  label: 'ARROW CROWN', ...arrowsEarn(400), anim: 1, cast: true, map: { '#': { ramp: 'goldfx', s: 'auto' }, G: { ramp: 'lime', s: 3 } },
  rows: ['...#....#....#..', '..###..###..###.', '.#####.###.#####', '...#....#....#..', '..############..', '..#G##G##G##G#..', '..############..'],
}
glasses.portal = {
  label: 'PORTAL GOGGLES', ...arrowsEarn(300), map: { 0: { ramp: 'black', s: 1 }, B: { ramp: 'sky', s: 3 }, O: { ramp: 'orange', s: 3 }, b: { ramp: 'sky', s: 4 }, o: { ramp: 'orange', s: 4 } },
  y: 4, rows: ['..0000..0000..', '..0bB0000oO0..', '..0BB0..0OO0..', '..0000..0000..'],
}

// An up-arrow on the chest, in both framings.
tops.arrowtee = {
  label: 'ARROW TEE', tier: 'earn', y: 15, map: { W: { ramp: 'white', s: 4 } },
  rows: [...neck, '......####@jj@####......', '....######@@@@######....', '...########WW########...', '..########WWWW########..', '..#######WWWWWW#######..', '.##########WW##########.', '.##########WW##########.'],
}
outfits.arrowtee = {
  label: 'ARROW TEE', tier: 'earn', y: 14, map: { ...C, W: { ramp: 'white', s: 4 } },
  rows: ['.........#kkkk#.........', '.......#####W####.......', '......#1###WWW##1#......', '......k#####W####k......', '........@@@@@@@@........', '........@@@..@@@........', '........@@@..@@@........', '.......%%%%..%%%%.......'],
}
OUTFITS.arrowtee = { label: 'ARROW TEE', ...arrowsEarn(100), body: 'arrowtee', bust: 'arrowtee' }

// Pets: 7x7, bottom-right of the hero, like the ones above.
const AP = (extra) => ({ x: 17, y: 17, ...extra })
const snakeFrames = [
  ['...G...', '...GG..', '..#GxG.', '.#.GG..', '#..G...', '#......', '.#.....'],
  ['...G...', '...GG..', '..#GxG.', '..#GG..', '.#.G...', '#......', '#......'],
]
pets.snakeegg = AP({
  label: 'SNAKE EGG', ...arrowsEarn(150, ' · hatches at 250★'), anim: 3, map: { '#': { ramp: 'white', s: 'auto' }, G: { ramp: 'lime', s: 3 } },
  frames: [
    ['.......', '..###..', '.#####.', '.#G#G#.', '#G#G#G#', '#######', '.#####.'],
    ['.......', '...###.', '..#####', '..#G#G#', '.#G#G#G', '.######', '..#####'],
    ['.......', '..###..', '.#####.', '.#G#G#.', '#G#G#G#', '#######', '.#####.'],
    ['.......', '.###...', '#####..', '#G#G#..', 'G#G#G#.', '######.', '#####..'],
  ],
})
pets.arrowsnake = AP({ label: 'ARROW SNAKE', ...arrowsEarn(250), anim: 3, map: { '#': { ramp: 'lime', s: 'auto' }, G: { ramp: 'green', s: 'auto' } }, frames: snakeFrames })
pets.portalpy = AP({
  label: 'PORTAL PYTHON', ...arrowsEarn(325), anim: 3, map: { O: { ramp: 'sky', s: 3 }, B: { ramp: 'sky', s: 1 }, '#': { ramp: 'orange', s: 'auto' }, G: { ramp: 'orange', s: 1 } },
  frames: [
    ['.O.....', 'OBO....', 'OBO.G..', 'OB##GG.', 'OBO.G..', 'OBO....', '.O.....'],
    ['.O.....', 'OBO....', 'OBO..G.', 'OB###GG', 'OBO..G.', 'OBO....', '.O.....'],
    ['.O.....', 'OBO....', 'OBOG...', 'OB#GG..', 'OBOG...', 'OBO....', '.O.....'],
  ],
})
pets.hooky = AP({
  label: 'HOOKY', ...arrowsEarn(350), anim: 2, map: { '#': { ramp: 'teal', s: 'auto' }, A: { ramp: 'teal', s: 1 } },
  frames: [
    ['...A...', '..AxA..', '...#...', '...#...', '#..#...', '#..#...', '.##....'],
    ['...A...', '..AxA..', '...#...', '...#...', '...#...', '#..#...', '.##....'],
  ],
})
pets.goldsnake = AP({ label: 'GOLDEN ARROW', ...arrowsEarn(400), anim: 3, map: { '#': { ramp: 'goldfx', s: 'auto' }, G: { ramp: 'goldfx', s: 3 } }, frames: snakeFrames })
