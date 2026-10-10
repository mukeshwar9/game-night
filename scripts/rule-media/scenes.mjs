// Capture scenes use real demo controls. Captions are indexes into GAME_RULES.
// Browser actions are executed through chrome-devtools-axi by the runner.
const cell = prefix => `[data-testid^="${prefix}"]`
const place = (selector, cap = 0) => ({ action: 'cell', selector, cap })
const click = (text, cap = 0, wait = 900) => ({ action: 'text', text, cap, wait })
const key = (text, cap = 0) => ({ action: 'keys', text, cap })
const input = (text, cap = 0) => ({ action: 'input', text, cap })
const select = (selector, cap = 0) => ({ action: 'select', selector, cap })
const scene = (source, steps, setup = [], crop = null) => ({ source, steps, setup, crop })

// Memory solo runs wait on TAP TO START before their first reveal.
export const SCENES = {
  ultimatettt: scene('demos/BotBoardDemo', [place('button[aria-label^="Board "]', 1), place('button[aria-label^="Board "]', 1)]),
  connectfour5: scene('demos/BotBoardDemo', [place('button[aria-label^="Column "]'), place('button[aria-label^="Column "]', 1)], [], cell('c4-cell-')),
  connectfourpop: scene('demos/BotBoardDemo', [place('button[aria-label^="Column "]'), place('button[aria-label^="Pop column "]', 1)], [], cell('c4-cell-')),
  gomokuswap: scene('demos/BotBoardDemo', [place(cell('gomoku-cell-')), place(cell('gomoku-cell-'))]),
  orderchaos: scene('demos/BotBoardDemo', [place('button[aria-label*="empty"]'), place('button[aria-label*="empty"]')]),
  sos: scene('demos/BotBoardDemo', [place(cell('sos-cell-')), place(cell('sos-cell-'))]),
  dotsandboxes: scene('demos/BotBoardDemo', [place(cell('edge-h-')), place(cell('edge-v-'))]),
  dotsandboxes4: scene('demos/BotBoardDemo', [place(cell('edge-h-')), place(cell('edge-v-'))]),
  chainreaction: scene('demos/BotBoardDemo', [place(cell('cr-cell-')), place(cell('cr-cell-'))]),
  chainreaction6: scene('demos/BotBoardDemo', [place(cell('cr-cell-')), place(cell('cr-cell-'))]),
  blockade: scene('demos/BotBoardDemo', [place(cell('blockade-cell-'), 0), place(cell('blockade-cell-'), 0)]),
  pairs: scene('demos/BotBoardDemo', [place('button[aria-label*="face down"]'), place('button[aria-label*="face down"]')]),
  pairs4: scene('demos/BotBoardDemo', [place('button[aria-label*="face down"]'), place('button[aria-label*="face down"]')]),
  hex: scene('demos/BotBoardDemo', [place(cell('hex-cell-')), place(cell('hex-cell-'))]),
  sim: scene('demos/BotBoardDemo', [place(cell('edge-')), place(cell('edge-'))]),
  chomp: scene('demos/BotBoardDemo', [place(cell('chomp-cell-'), 1), place(cell('chomp-cell-'), 2)]),
  breakthrough: scene('demos/BotBoardDemo', [select(cell('bt-cell-'), 1), select(cell('bt-cell-'), 1)]),
  ataxx: scene('demos/BotBoardDemo', [select(cell('ataxx-cell-')), select(cell('ataxx-cell-'))]),
  kamisado: scene('demos/BotBoardDemo', [select(cell('km-cell-'), 2), select(cell('km-cell-'), 1)]),
  onitama: scene('demos/BotBoardDemo', [click('card$', 1), place('button[aria-label*="move here"]', 1)]),
  quarto: scene('demos/BotBoardDemo', [place(cell('qrt-cell-'), 1), place(cell('qrt-give-'), 1)]),
  santorini: scene('demos/BotBoardDemo', [select(cell('st-cell-'), 1), select(cell('st-cell-'), 1)]),
  loa: scene('demos/BotBoardDemo', [select(cell('loa-cell-')), select(cell('loa-cell-'))]),
  yavalath: scene('demos/BotBoardDemo', [place(cell('yv-hex-')), place(cell('yv-hex-'))]),
  dice: scene('demos/BotBoardDemo', [{ action: 'roll', cap: 0 }, click('^Bank ', 1)]),
  'dice-big': scene('demos/BotBoardDemo', [{ action: 'roll', cap: 0 }, click('^Bank ', 1)]),
  battleship: scene('BattleshipDemo', [click('READY — BATTLE STATIONS', 1), place('button[aria-label$=", open"]', 2)], [click('RANDOM')]),
  mancala: scene('MancalaDemo', [place(cell('pit ')), place(cell('pit '))]),
  checkers: scene('CheckersDemo', [select(cell('checkers-cell-'), 1), select(cell('checkers-cell-'), 1)]),
  reaction: scene('demos/ReactionDemo', [click('TAP TO START', 0, 100), { action: 'reaction', cap: 1 }]),
  aim: scene('demos/AimTrainerDemo', [place('button[aria-label="your target"]'), place('button[aria-label="your target"]')], [click('^START$', 0, 3300)]),
  typing: scene('demos/TypingDemo', [key('The ', 1), key('quick ', 2)], [click('^START$', 0, 3300)]),
  math: scene('demos/MathDemo', [key('12', 1), key('Enter', 3)], [click('^START$', 0, 3300)]),
  pong: scene('PongDemo', [key('ArrowUp'), key('ArrowDown', 1)], [click('PLAY FULL SCREEN', 0, 3300)]),
  snake: scene('demos/SnakeDemo', [key('ArrowUp'), key('ArrowLeft')]),
  tron: scene('TronDemo', [key('ArrowDown'), key('ArrowLeft')]),
  sumo: scene('SumoDemo', [key(' ', 1), key(' ', 1)]),
  spaceduel: scene('SpaceduelDemo', [key('ArrowUp'), key(' ', 1)]),
  paint: scene('PaintDemo', [key('ArrowUp'), key('ArrowLeft')]),
  pacmac: scene('PacmacDemo', [key('ArrowUp'), key('ArrowRight', 1)], [click('^START$', 0, 3300)]),
  minesweeper: scene('MineRaceDemo', [place('button[aria-label*="hidden"]'), click('FLAG', 2)]),
  arrows: scene('ArrowsDemo', [place('button[aria-label^="Arrow "]'), place('button[aria-label^="Arrow "]')]),
  airhockey: scene('AirHockeyDemo', [key('ArrowUp'), key('ArrowRight')]),
  artillery: scene('ArtilleryDemo', [click('^FIRE$', 1, 1800), click('^FIRE$', 1, 1800)]),
  archery: scene('ArcheryDemo', [click('LOOSE ARROW', 1, 2000), click('LOOSE ARROW', 1, 2000)], [click('ROOKIE', 0)]),
  animalstack: scene('AnimalStackDemo', [click('^DROP', 1, 2000), click('^DROP', 1, 2000)], [click('CLIMB', 0)]),
  simon: scene('MemorySoloDemos', [{ action: 'remember', cap: 0, wait: 20 }, { action: 'recall', cap: 0 }], [click('TAP TO START', 0, 400)]),
  visualmemory: scene('MemorySoloDemos', [place('button[aria-label^="Row "]', 1), place('button[aria-label^="Row "]', 1)], [click('TAP TO START', 0, 400)]),
  // Tile 1 by name: a wrong first tap now pauses the run on the slip.
  chimp: scene('MemorySoloDemos', [{ action: 'wait', cap: 0, wait: 200 }, place('button[aria-label$=", tile 1"]', 1)], [click('TAP TO START', 0, 400)]),
  numbermemory: scene('MemorySoloDemos', [input('1', 1), { action: 'submit', cap: 1 }], [click('TAP TO START', 0, 400)]),
  hangwoman: scene('HangmanDemo', [key('E', 1), key('A', 1)]),
  wordhunt: scene('WordHuntDemo', [{ action: 'hunt', cap: 1 }, key('Enter', 2)], [click('START', 0, 3300)]),
  wavelength: scene('WavelengthDemo', [input('sun', 1), click('LOCK CLUE', 1, 1200)], [click('^START$')]),
  fibbage: scene('FibbageDemo', [input('Moon cheese', 1), click('SUBMIT LIE', 1, 1800)], [click('^START$')]),
  spyfair: scene('SpyfairDemo', [click('TAP TO SEE YOUR SECRET', 0), click('START QUESTIONING', 1)], [click('^START$')]),
  herd: scene('HerdDemo', [input('pizza', 0), click('LOCK', 1, 1000)]),
  trivia: scene('TriviaDemo', [place('button:not([aria-pressed])', 1), { action: 'wait', wait: 3500, cap: 2 }]),
}

// Selection games show the preview before completing the turn.
for (const entry of Object.values(SCENES)) {
  if (entry.steps.every(step => step.action === 'select')) {
    entry.steps[0].preview = true
    entry.steps[0].wait = 80
    entry.steps[1].complete = true
  }
}

SCENES.wordhunt.crop = '[data-wh-cell]'
SCENES.archery4 = { ...scene('ArcheryDemo', [click('LOOSE ARROW', 1), click("I.M READY", 0)], [click('^4P$'), click('START RANGE')]), route: '/local/archery4' }

export const ORIGINAL_TYPES = ['tictactoe', 'tictactoe4', 'connectfour', 'gomoku', 'reversi']
