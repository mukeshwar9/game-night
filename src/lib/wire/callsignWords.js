// WIRE CROSSED CALL SIGN word lists. Original to this game; common,
// family-friendly English words (docs/content-policy.md). Uppercase A-Z only,
// unique within a list. Tier I uses the 4-letter list, tiers II-III the
// 5-letter list.
//
// Pure — no DOM, no Firebase, no React.

export const CALLSIGN_WORDS_4 = [
  'BAKE', 'BALL', 'BARN', 'BEAR', 'BELL', 'BIRD', 'BOAT', 'BOOK', 'BOWL', 'CAKE',
  'CAMP', 'CARD', 'CITY', 'CLAY', 'CLUB', 'COAT', 'COIN', 'CORN', 'CROW', 'DARK',
  'DAWN', 'DESK', 'DISH', 'DOOR', 'DOVE', 'DRUM', 'DUCK', 'FARM', 'FERN', 'FISH',
  'FLAG', 'FROG', 'GAME', 'GATE', 'GIFT', 'GOAT', 'GOLD', 'HAND', 'HARP', 'HILL',
  'HOME', 'HORN', 'KITE', 'LAMP', 'LAKE', 'LEAF', 'LION', 'LOOP', 'MAZE', 'MILK',
  'MOON', 'NEST', 'NOTE', 'OVEN', 'PARK', 'PEAR', 'PINE', 'RAIN', 'RING', 'ROCK',
  'ROSE', 'SAIL', 'SAND', 'SEED', 'SHIP', 'SNOW', 'SOAP', 'STAR', 'TENT', 'TREE',
  'WAVE', 'WIND', 'WOOL', 'ZOOM',
]

export const CALLSIGN_WORDS_5 = [
  'ANVIL', 'APPLE', 'BATON', 'BEACH', 'BERRY', 'BLOOM', 'BREAD', 'BRICK', 'CANDY', 'CHAIR',
  'CHESS', 'CLOCK', 'CLOUD', 'CORAL', 'CRANE', 'DAISY', 'DANCE', 'DELTA', 'DREAM', 'EAGLE',
  'EMBER', 'FABLE', 'FIELD', 'FLAME', 'FLUTE', 'GHOST', 'GRAPE', 'GRASS', 'HAVEN', 'HONEY',
  'HOUSE', 'JELLY', 'KNOLL', 'LEMON', 'LIGHT', 'LLAMA', 'MANGO', 'MAPLE', 'MELON', 'MOUSE',
  'NOVEL', 'OCEAN', 'OLIVE', 'ORBIT', 'PAINT', 'PEACH', 'PIANO', 'PIXEL', 'PLAIN', 'PLANT',
  'QUILL', 'RAVEN', 'RIVER', 'ROBIN', 'SALAD', 'SHEEP', 'SOLAR', 'SPOON', 'STONE', 'STORM',
  'SUGAR', 'SWEET', 'TABLE', 'TIGER', 'TOAST', 'TRAIN', 'WATCH', 'WHALE', 'ZEBRA',
]

/** The list for a word length (4 or 5). */
export const callsignWords = (length) => (length === 4 ? CALLSIGN_WORDS_4 : CALLSIGN_WORDS_5)
