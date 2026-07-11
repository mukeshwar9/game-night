// FIBBAGE deck — each entry has a `prompt` with a blank (___) and the real
// `answer` that fills it. Players invent fake answers; everyone votes on which
// of the shuffled options is the truth. Keep answers short and surprising.
//
// `decoys` — used by solo/bot play: 2–3 short plausible fake answers a bot "lies"
// with. Each must grammatically fit the blank, match the answer's register, and
// never case-insensitively equal the real `answer`.
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
  { prompt: 'In Switzerland, it is illegal to own just one ___ because they are social animals.', answer: 'guinea pig', decoys: ['hamster', 'goldfish', 'parrot'] },
  { prompt: 'The unicorn is the official national animal of ___.', answer: 'Scotland', decoys: ['Ireland', 'Wales', 'Norway'] },
  { prompt: 'A group of flamingos is called a ___.', answer: 'flamboyance', decoys: ['flock', 'gaggle', 'colony'] },
  { prompt: 'The world record for the longest fingernails on a single hand is over ___ feet.', answer: '29', decoys: ['20', '15', '33'] },
  { prompt: 'Honey found in ancient Egyptian tombs was still ___ after thousands of years.', answer: 'edible', decoys: ['crystallized', 'toxic', 'fragrant'] },
  { prompt: 'A single strand of ___ can hold up to 100 grams in weight.', answer: 'spaghetti', decoys: ['human hair', 'silk', 'fishing line'] },
  { prompt: 'The shortest war in history lasted about ___ minutes.', answer: '38', decoys: ['45', '90', '20'] },
  { prompt: 'Octopuses have ___ hearts.', answer: 'three', decoys: ['two', 'four', 'five'] },
  { prompt: 'Bananas are botanically classified as ___.', answer: 'berries', decoys: ['drupes', 'melons', 'nuts'] },
  { prompt: 'The inventor of the Pringles can had part of his ashes buried in ___.', answer: 'a Pringles can', decoys: ['a cereal box', 'a cookie jar', 'his golf bag'] },
  { prompt: 'A ___ can sleep for up to three years at a time.', answer: 'snail', decoys: ['tortoise', 'bear', 'frog'] },
  { prompt: 'The dot over a lowercase i or j is called a ___.', answer: 'tittle', decoys: ['serif', 'diacritic', 'glyph'] },
  { prompt: 'In Japan, there is a museum dedicated entirely to ___.', answer: 'ramen', decoys: ['sushi', 'tofu', 'wasabi'] },
  { prompt: 'Cows have best friends and get stressed when ___.', answer: 'separated', decoys: ['ignored', 'crowded', 'rushed'] },
  { prompt: 'The fear of long words is ironically called ___.', answer: 'hippopotomonstrosesquippedaliophobia', decoys: ['sesquipedalophobia', 'verbophobia', 'logophobia'] },
  { prompt: 'A ___ is the only mammal that cannot jump.', answer: 'elephant', decoys: ['rhino', 'hippo', 'giraffe'] },
  { prompt: 'Wombat droppings are shaped like ___.', answer: 'cubes', decoys: ['pyramids', 'spheres', 'discs'] },
  { prompt: 'The longest recorded flight of a chicken is ___ seconds.', answer: '13', decoys: ['7', '22', '4'] },
  { prompt: 'Scotland has 421 words for ___.', answer: 'snow', decoys: ['rain', 'wind', 'fog'] },
  { prompt: 'The first product ever scanned with a barcode was a pack of ___.', answer: 'chewing gum', decoys: ['cigarettes', 'a candy bar', 'a soda can'] },
  { prompt: 'A jiffy is an actual unit of time: one hundredth of a ___.', answer: 'second', decoys: ['minute', 'millisecond', 'hour'] },
  { prompt: 'Sea otters hold ___ while they sleep so they do not drift apart.', answer: 'hands', decoys: ['paws', 'tails', 'rocks'] },
  { prompt: 'The Eiffel Tower can grow over six inches taller during ___.', answer: 'summer', decoys: ['heatwaves', 'thunderstorms', 'winter'] },
  { prompt: 'Sloths can hold their breath longer than ___ can.', answer: 'dolphins', decoys: ['whales', 'seals', 'humans'] },
  { prompt: 'The plastic tips at the end of shoelaces are called ___.', answer: 'aglets', decoys: ['ferrules', 'grommets', 'eyelets'] },
  { prompt: 'A group of pugs is called a ___.', answer: 'grumble', decoys: ['pack', 'litter', 'pod'] },
  { prompt: 'The hashtag symbol is technically called an ___.', answer: 'octothorpe', decoys: ['ampersand', 'interrobang', 'asterisk'] },
]
