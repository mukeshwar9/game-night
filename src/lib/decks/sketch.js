// SKETCH deck — drawable words/phrases for the draw & guess party game. Each entry:
// { word: string, tier: 1 | 2 | 3 } — a rough "how easy to draw and guess" rating.
// pickOptions() offers exactly one word per tier every choosing phase, so the artist
// always has an easy/medium/hard spread:
//   tier 1 — concrete, iconic, single objects (e.g. "cat", "house", "sun")
//   tier 2 — everyday scenes/actions, slightly trickier concrete things (e.g. "birthday
//            party", "juggling", "traffic jam")
//   tier 3 — abstract concepts, idioms, and multi-word phrases, hardest to draw/guess
//            (e.g. "time travel", "stage fright", "raining cats and dogs")
//
// ⚠ RESIDUAL (UNFIXABLE) INFO LEAK: this deck ships in the client JS bundle, and the
// 3 offered `options` (deck indices) are public in Firebase — so any player who opens
// devtools can shortlist the 3 candidates. Sketch's commit scheme additionally
// publishes the SALT immediately (not withheld until reveal, unlike Wavelength/
// Fibbage), so a determined player can also hash each of the 3 candidates locally
// against the public `commitment.hash` and read the real word BEFORE the round ends
// (see deriveWord() in sketchLogic.js — this is the same function honest clients use
// to show the word at reveal). This is an accepted leak at the same trust tier as
// Fibbage's bundled answer key — the platform has no trusted server to keep a word
// secret from a client willing to inspect its own network traffic / JS bundle. It only
// defends against a spectator glancing at a single Firebase field. See the
// commit-reveal trust-model note in docs/prds/README.md.

export const SKETCH_WORDS = [
  // --- tier 1 (90) --------------------------------------------------------
  { word: 'cat', tier: 1 }, { word: 'dog', tier: 1 }, { word: 'house', tier: 1 },
  { word: 'sun', tier: 1 }, { word: 'moon', tier: 1 }, { word: 'star', tier: 1 },
  { word: 'tree', tier: 1 }, { word: 'flower', tier: 1 }, { word: 'fish', tier: 1 },
  { word: 'bird', tier: 1 }, { word: 'car', tier: 1 }, { word: 'boat', tier: 1 },
  { word: 'apple', tier: 1 }, { word: 'banana', tier: 1 }, { word: 'book', tier: 1 },
  { word: 'chair', tier: 1 }, { word: 'table', tier: 1 }, { word: 'clock', tier: 1 },
  { word: 'cup', tier: 1 }, { word: 'hat', tier: 1 }, { word: 'shoe', tier: 1 },
  { word: 'umbrella', tier: 1 }, { word: 'balloon', tier: 1 }, { word: 'kite', tier: 1 },
  { word: 'ball', tier: 1 }, { word: 'bicycle', tier: 1 }, { word: 'guitar', tier: 1 },
  { word: 'drum', tier: 1 }, { word: 'key', tier: 1 }, { word: 'door', tier: 1 },
  { word: 'window', tier: 1 }, { word: 'ladder', tier: 1 }, { word: 'bridge', tier: 1 },
  { word: 'mountain', tier: 1 }, { word: 'cloud', tier: 1 }, { word: 'rainbow', tier: 1 },
  { word: 'snowman', tier: 1 }, { word: 'candle', tier: 1 }, { word: 'lightbulb', tier: 1 },
  { word: 'phone', tier: 1 }, { word: 'camera', tier: 1 }, { word: 'glasses', tier: 1 },
  { word: 'crown', tier: 1 }, { word: 'ring', tier: 1 }, { word: 'heart', tier: 1 },
  { word: 'spider', tier: 1 }, { word: 'snake', tier: 1 }, { word: 'frog', tier: 1 },
  { word: 'rabbit', tier: 1 }, { word: 'duck', tier: 1 }, { word: 'owl', tier: 1 },
  { word: 'bee', tier: 1 }, { word: 'ant', tier: 1 }, { word: 'whale', tier: 1 },
  { word: 'octopus', tier: 1 }, { word: 'crab', tier: 1 }, { word: 'snail', tier: 1 },
  { word: 'turtle', tier: 1 }, { word: 'penguin', tier: 1 }, { word: 'elephant', tier: 1 },
  { word: 'giraffe', tier: 1 }, { word: 'lion', tier: 1 }, { word: 'tiger', tier: 1 },
  { word: 'monkey', tier: 1 }, { word: 'horse', tier: 1 }, { word: 'cow', tier: 1 },
  { word: 'pig', tier: 1 }, { word: 'sheep', tier: 1 }, { word: 'chicken', tier: 1 },
  { word: 'egg', tier: 1 }, { word: 'pizza', tier: 1 }, { word: 'hamburger', tier: 1 },
  { word: 'ice cream', tier: 1 }, { word: 'cake', tier: 1 }, { word: 'cookie', tier: 1 },
  { word: 'pretzel', tier: 1 }, { word: 'carrot', tier: 1 }, { word: 'mushroom', tier: 1 },
  { word: 'cactus', tier: 1 }, { word: 'volcano', tier: 1 }, { word: 'island', tier: 1 },
  { word: 'anchor', tier: 1 }, { word: 'compass', tier: 1 }, { word: 'telescope', tier: 1 },
  { word: 'robot', tier: 1 }, { word: 'rocket', tier: 1 }, { word: 'airplane', tier: 1 },
  { word: 'train', tier: 1 }, { word: 'bus', tier: 1 }, { word: 'skateboard', tier: 1 },

  // --- tier 2 (90) --------------------------------------------------------
  { word: 'birthday party', tier: 2 }, { word: 'juggling', tier: 2 },
  { word: 'sandcastle', tier: 2 }, { word: 'campfire', tier: 2 },
  { word: 'snowball fight', tier: 2 }, { word: 'roller coaster', tier: 2 },
  { word: 'fireworks', tier: 2 }, { word: 'tightrope walker', tier: 2 },
  { word: 'scuba diver', tier: 2 }, { word: 'mummy', tier: 2 },
  { word: 'pirate ship', tier: 2 }, { word: 'treasure chest', tier: 2 },
  { word: 'magic wand', tier: 2 }, { word: 'wizard hat', tier: 2 },
  { word: 'dragon', tier: 2 }, { word: 'unicorn', tier: 2 }, { word: 'mermaid', tier: 2 },
  { word: 'ghost', tier: 2 }, { word: 'vampire', tier: 2 }, { word: 'werewolf', tier: 2 },
  { word: 'zombie', tier: 2 }, { word: 'superhero cape', tier: 2 },
  { word: 'knight in armor', tier: 2 }, { word: 'castle', tier: 2 },
  { word: 'drawbridge', tier: 2 }, { word: 'waterfall', tier: 2 },
  { word: 'desert oasis', tier: 2 }, { word: 'igloo', tier: 2 },
  { word: 'lighthouse', tier: 2 }, { word: 'windmill', tier: 2 },
  { word: 'scarecrow', tier: 2 }, { word: 'beehive', tier: 2 },
  { word: 'spider web', tier: 2 }, { word: 'footprint', tier: 2 },
  { word: 'shadow puppet', tier: 2 }, { word: 'thunderstorm', tier: 2 },
  { word: 'tornado', tier: 2 }, { word: 'earthquake', tier: 2 },
  { word: 'avalanche', tier: 2 }, { word: 'quicksand', tier: 2 }, { word: 'maze', tier: 2 },
  { word: 'seesaw', tier: 2 }, { word: 'trampoline', tier: 2 }, { word: 'hopscotch', tier: 2 },
  { word: 'tug of war', tier: 2 }, { word: 'arm wrestling', tier: 2 },
  { word: 'thumb war', tier: 2 }, { word: 'piggyback ride', tier: 2 },
  { word: 'sleepwalking', tier: 2 }, { word: 'snoring', tier: 2 }, { word: 'hiccups', tier: 2 },
  { word: 'sneezing', tier: 2 }, { word: 'yawning', tier: 2 }, { word: 'whispering', tier: 2 },
  { word: 'tiptoeing', tier: 2 }, { word: 'somersault', tier: 2 }, { word: 'cartwheel', tier: 2 },
  { word: 'handstand', tier: 2 }, { word: 'high five', tier: 2 }, { word: 'fist bump', tier: 2 },
  { word: 'group hug', tier: 2 }, { word: 'staring contest', tier: 2 },
  { word: 'hide and seek', tier: 2 }, { word: 'musical chairs', tier: 2 },
  { word: 'jump rope', tier: 2 }, { word: 'board game', tier: 2 },
  { word: 'puzzle piece', tier: 2 }, { word: 'domino effect', tier: 2 },
  { word: 'house of cards', tier: 2 }, { word: 'paper airplane', tier: 2 },
  { word: 'origami crane', tier: 2 }, { word: 'bubble wrap', tier: 2 },
  { word: 'rubber band', tier: 2 }, { word: 'clothesline', tier: 2 },
  { word: 'vacuum cleaner', tier: 2 }, { word: 'lawnmower', tier: 2 },
  { word: 'wheelbarrow', tier: 2 }, { word: 'garden hose', tier: 2 },
  { word: 'birdhouse', tier: 2 }, { word: 'scaffolding', tier: 2 },
  { word: 'traffic jam', tier: 2 }, { word: 'parking lot', tier: 2 },
  { word: 'crosswalk', tier: 2 }, { word: 'escalator', tier: 2 }, { word: 'elevator', tier: 2 },
  { word: 'revolving door', tier: 2 }, { word: 'fire escape', tier: 2 },
  { word: 'fire hydrant', tier: 2 }, { word: 'manhole cover', tier: 2 },
  { word: 'street lamp', tier: 2 },

  // --- tier 3 (70) --------------------------------------------------------
  { word: 'time travel', tier: 3 }, { word: "writer's block", tier: 3 },
  { word: 'stage fright', tier: 3 }, { word: 'peer pressure', tier: 3 },
  { word: 'procrastination', tier: 3 }, { word: 'optical illusion', tier: 3 },
  { word: 'identity crisis', tier: 3 }, { word: 'culture shock', tier: 3 },
  { word: 'sleep paralysis', tier: 3 }, { word: 'midlife crisis', tier: 3 },
  { word: 'information overload', tier: 3 }, { word: 'conspiracy theory', tier: 3 },
  { word: 'déjà vu', tier: 3 }, { word: 'groundhog day', tier: 3 },
  { word: 'broken heart', tier: 3 }, { word: 'love at first sight', tier: 3 },
  { word: 'butterflies in stomach', tier: 3 }, { word: 'cold shoulder', tier: 3 },
  { word: 'raining cats and dogs', tier: 3 }, { word: 'piece of cake', tier: 3 },
  { word: 'break a leg', tier: 3 }, { word: 'spill the beans', tier: 3 },
  { word: 'costs an arm and a leg', tier: 3 }, { word: 'hit the hay', tier: 3 },
  { word: 'under the weather', tier: 3 }, { word: 'once in a blue moon', tier: 3 },
  { word: 'elephant in the room', tier: 3 }, { word: 'fish out of water', tier: 3 },
  { word: 'barking up the wrong tree', tier: 3 },
  { word: 'let the cat out of the bag', tier: 3 },
  { word: 'kill two birds with one stone', tier: 3 },
  { word: 'add insult to injury', tier: 3 }, { word: 'beat around the bush', tier: 3 },
  { word: 'bite the bullet', tier: 3 }, { word: 'burn the midnight oil', tier: 3 },
  { word: 'caught red-handed', tier: 3 }, { word: 'curiosity killed the cat', tier: 3 },
  { word: "don't count your chickens", tier: 3 },
  { word: 'early bird catches the worm', tier: 3 },
  { word: 'every cloud has a silver lining', tier: 3 },
  { word: 'go the extra mile', tier: 3 }, { word: 'hold your horses', tier: 3 },
  { word: 'in hot water', tier: 3 }, { word: 'jump on the bandwagon', tier: 3 },
  { word: 'keep your chin up', tier: 3 }, { word: 'let sleeping dogs lie', tier: 3 },
  { word: 'make a mountain out of a molehill', tier: 3 }, { word: 'miss the boat', tier: 3 },
  { word: 'on thin ice', tier: 3 }, { word: 'out of the blue', tier: 3 },
  { word: "pull someone's leg", tier: 3 }, { word: 'see eye to eye', tier: 3 },
  { word: 'spill the tea', tier: 3 }, { word: 'the ball is in your court', tier: 3 },
  { word: 'time flies', tier: 3 }, { word: 'turn a blind eye', tier: 3 },
  { word: 'wear your heart on your sleeve', tier: 3 }, { word: 'when pigs fly', tier: 3 },
  { word: "you can't judge a book by its cover", tier: 3 },
  { word: 'back to square one', tier: 3 }, { word: 'bite off more than you chew', tier: 3 },
  { word: 'cry over spilled milk', tier: 3 }, { word: 'hit the nail on the head', tier: 3 },
  { word: 'a blessing in disguise', tier: 3 }, { word: 'actions speak louder than words', tier: 3 },
  { word: 'better late than never', tier: 3 }, { word: 'birds of a feather', tier: 3 },
  { word: 'blood is thicker than water', tier: 3 },
  { word: "don't put all your eggs in one basket", tier: 3 },
  { word: 'the grass is always greener', tier: 3 },
]
