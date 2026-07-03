// FIBBAGE deck — each entry has a `prompt` with a blank (___) and the real
// `answer` that fills it. Players invent fake answers; everyone votes on which
// of the shuffled options is the truth. Keep answers short and surprising.
//
// ⚠ RESIDUAL (UNFIXABLE) INFO LEAK: this deck — including every `answer` — ships
// in the client JS bundle, and the active prompt (`round.promptIndex`) is public in
// Firebase. A player who inspects the bundle can therefore always derive the truth,
// no matter how the ballot is anonymised. FibbageGame's mitigations (anonymised
// options + author→lie map withheld until reveal, see src/lib/fibbageLogic.js) only
// defend against CASUAL/spectator leakage of a single Firebase field. Closing this
// hole would require a trusted server to hold the answers and grade votes server-side
// — impossible in this serverless, world-readable-`games/$id` architecture.

export const FIBBAGE_FACTS = [
  { prompt: 'In Switzerland, it is illegal to own just one ___ because they are social animals.', answer: 'guinea pig' },
  { prompt: 'The unicorn is the official national animal of ___.', answer: 'Scotland' },
  { prompt: 'A group of flamingos is called a ___.', answer: 'flamboyance' },
  { prompt: 'The world record for the longest fingernails on a single hand is over ___ feet.', answer: '29' },
  { prompt: 'Honey found in ancient Egyptian tombs was still ___ after thousands of years.', answer: 'edible' },
  { prompt: 'A single strand of ___ can hold up to 100 grams in weight.', answer: 'spaghetti' },
  { prompt: 'The shortest war in history lasted about ___ minutes.', answer: '38' },
  { prompt: 'Octopuses have ___ hearts.', answer: 'three' },
  { prompt: 'Bananas are botanically classified as ___.', answer: 'berries' },
  { prompt: 'The inventor of the Pringles can had part of his ashes buried in ___.', answer: 'a Pringles can' },
  { prompt: 'A ___ can sleep for up to three years at a time.', answer: 'snail' },
  { prompt: 'The dot over a lowercase i or j is called a ___.', answer: 'tittle' },
  { prompt: 'In Japan, there is a museum dedicated entirely to ___.', answer: 'ramen' },
  { prompt: 'Cows have best friends and get stressed when ___.', answer: 'separated' },
  { prompt: 'The fear of long words is ironically called ___.', answer: 'hippopotomonstrosesquippedaliophobia' },
  { prompt: 'A ___ is the only mammal that cannot jump.', answer: 'elephant' },
  { prompt: 'Wombat droppings are shaped like ___.', answer: 'cubes' },
  { prompt: 'The longest recorded flight of a chicken is ___ seconds.', answer: '13' },
  { prompt: 'Scotland has 421 words for ___.', answer: 'snow' },
  { prompt: 'The first product ever scanned with a barcode was a pack of ___.', answer: 'chewing gum' },
  { prompt: 'A jiffy is an actual unit of time: one hundredth of a ___.', answer: 'second' },
  { prompt: 'Sea otters hold ___ while they sleep so they do not drift apart.', answer: 'hands' },
  { prompt: 'The Eiffel Tower can grow over six inches taller during ___.', answer: 'summer' },
  { prompt: 'Sloths can hold their breath longer than ___ can.', answer: 'dolphins' },
  { prompt: 'The plastic tips at the end of shoelaces are called ___.', answer: 'aglets' },
  { prompt: 'A group of pugs is called a ___.', answer: 'grumble' },
  { prompt: 'The hashtag symbol is technically called an ___.', answer: 'octothorpe' },
]
