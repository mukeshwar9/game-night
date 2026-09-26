// Password deck: common single words, family-safe (`isFamilySafe`), mostly
// concrete things a partner can clue in one word. The deck is public in the
// client bundle by design; gameplay relies on honest clients, like other deck
// games.
//
// `tier` drives the match's difficulty curve (`tierForRound` in
// passwordLogic.js): rounds 1–4 draw tier 1, 5–8 tier 2, 9–12 tier 3.
//   1 — easy, concrete, everyday (apple, chair, penguin)
//   2 — medium: less everyday things, places, jobs, events (lighthouse, dentist)
//   3 — harder but still clue-able: rarer objects, science, a few clue-able
//       ideas (eclipse, hourglass, secret) — no abstract filler like
//       "usual", "enough", "beyond" or "admit".
const TIER_1 = [
  // food
  'apple', 'banana', 'orange', 'lemon', 'cherry', 'grape', 'strawberry', 'pineapple', 'watermelon',
  'peach', 'pear', 'coconut', 'carrot', 'bread', 'cheese', 'pizza', 'cookie', 'sandwich', 'pancake',
  'cake', 'candy', 'honey', 'soup', 'egg', 'milk', 'juice', 'popcorn', 'cereal',
  // home
  'chair', 'table', 'bed', 'sofa', 'lamp', 'door', 'window', 'pillow', 'blanket', 'carpet', 'mirror',
  'clock', 'towel', 'soap', 'toothbrush', 'spoon', 'fork', 'knife', 'plate', 'bowl', 'cup', 'bottle',
  'oven', 'fridge', 'bucket', 'basket', 'bathtub',
  // places and nature
  'house', 'school', 'garden', 'castle', 'bridge', 'village', 'farm', 'barn', 'tent', 'beach', 'island',
  'forest', 'desert', 'mountain', 'river', 'ocean', 'lake', 'cloud', 'sun', 'moon', 'star', 'rainbow',
  'thunder', 'tree', 'flower', 'leaf', 'grass', 'sand', 'water', 'snow',
  // animals
  'dog', 'cat', 'horse', 'cow', 'pig', 'sheep', 'goat', 'chicken', 'duck', 'frog', 'fish', 'bird',
  'owl', 'bee', 'butterfly', 'mouse', 'rabbit', 'kitten', 'puppy', 'lion', 'tiger', 'elephant',
  'monkey', 'giraffe', 'zebra', 'bear', 'penguin', 'dolphin', 'whale', 'shark', 'snake', 'turtle',
  'fox', 'deer', 'squirrel', 'spider',
  // getting around
  'car', 'bus', 'truck', 'train', 'boat', 'airplane', 'rocket', 'bicycle', 'tractor', 'helicopter',
  // things
  'book', 'pencil', 'crayon', 'paper', 'scissors', 'backpack', 'ticket', 'wallet', 'key', 'umbrella',
  'balloon', 'kite', 'ball', 'doll', 'drum', 'guitar', 'piano', 'bell', 'whistle', 'hat', 'sock',
  'shoe', 'boot', 'glove', 'scarf', 'jacket', 'dress', 'shirt', 'button', 'pocket', 'ring', 'crown',
  'phone', 'camera', 'computer', 'television', 'robot', 'radio', 'hammer', 'candle', 'ladder',
  'puzzle', 'flag', 'map', 'helmet', 'present',
  // body
  'hand', 'foot', 'nose', 'ear', 'eye', 'hair', 'tooth', 'finger', 'elbow', 'knee',
  // people and play
  'snowman', 'pirate', 'king', 'queen', 'baby', 'clown', 'summer', 'winter', 'sunset', 'birthday',
  'soccer', 'swing', 'slide',
]

const TIER_2 = [
  // people and jobs
  'doctor', 'nurse', 'dentist', 'teacher', 'farmer', 'pilot', 'chef', 'baker', 'plumber', 'mechanic',
  'scientist', 'artist', 'author', 'singer', 'dancer', 'magician', 'detective', 'astronaut',
  'firefighter', 'lifeguard', 'librarian', 'captain', 'soldier', 'police', 'cowboy', 'knight',
  'wizard', 'prince', 'mermaid', 'dragon', 'unicorn', 'ghost', 'vampire', 'monster', 'fairy',
  'uncle', 'grandma', 'neighbor', 'friend',
  // places
  'airport', 'hospital', 'library', 'museum', 'market', 'office', 'station', 'restaurant', 'bakery',
  'stadium', 'playground', 'zoo', 'hotel', 'palace', 'pyramid', 'igloo', 'cabin', 'garage', 'attic',
  'basement', 'balcony', 'chimney', 'elevator', 'jungle', 'volcano', 'waterfall', 'cave', 'lighthouse',
  'kitchen', 'closet', 'theater',
  // events and pastimes
  'dinner', 'breakfast', 'holiday', 'festival', 'picnic', 'parade', 'wedding', 'vacation', 'circus',
  'camping', 'fishing',
  // sports
  'tennis', 'basketball', 'baseball', 'football', 'golf', 'hockey', 'bowling', 'surfing', 'karate',
  'marathon', 'trophy', 'medal', 'referee', 'skateboard',
  // objects
  'battery', 'needle', 'envelope', 'calendar', 'magnet', 'flashlight', 'keyboard', 'headphones',
  'microphone', 'stapler', 'sticker', 'eraser', 'notebook', 'stamp', 'suitcase', 'passport',
  'glasses', 'diamond', 'necklace', 'bracelet', 'sunglasses', 'toothpaste', 'shampoo', 'sponge',
  'broom', 'vacuum', 'shovel', 'wheelbarrow', 'picture', 'letter', 'recipe',
  // food
  'spaghetti', 'hamburger', 'pretzel', 'sushi', 'taco', 'waffle', 'muffin', 'donut', 'cupcake',
  'chocolate', 'vanilla', 'cinnamon', 'broccoli', 'potato', 'onion', 'garlic', 'mushroom', 'avocado',
  'peanut', 'pickle', 'noodle', 'pepper', 'tomato', 'lettuce',
  // animals
  'kangaroo', 'koala', 'octopus', 'jellyfish', 'crab', 'lobster', 'flamingo', 'peacock', 'parrot',
  'hedgehog', 'raccoon', 'camel', 'gorilla', 'panda', 'cheetah', 'crocodile', 'lizard', 'snail',
  'caterpillar', 'ladybug', 'mosquito', 'wolf', 'moose', 'walrus', 'swan', 'pigeon', 'dinosaur', 'eagle',
  // getting around
  'submarine', 'ambulance', 'motorcycle', 'scooter', 'subway', 'sailboat', 'canoe', 'taxi',
  // weather
  'tornado', 'hurricane', 'earthquake', 'blizzard', 'iceberg', 'lightning',
  // music and dress-up
  'violin', 'trumpet', 'harp', 'flute', 'pumpkin', 'costume', 'mask', 'treasure', 'sweater',
  'pajamas', 'sandal', 'slipper', 'apron', 'uniform',
]

const TIER_3 = [
  // space and science
  'galaxy', 'comet', 'meteor', 'eclipse', 'satellite', 'gravity', 'oxygen', 'telescope', 'microscope',
  'thermometer', 'calculator', 'laboratory', 'experiment', 'fossil', 'skeleton', 'compass',
  'electricity', 'invention', 'spaceship', 'alien', 'universe', 'orbit',
  // the natural world
  'glacier', 'geyser', 'oasis', 'peninsula', 'continent', 'equator', 'horizon', 'avalanche', 'swamp',
  'lagoon', 'coral', 'canyon', 'sunrise', 'twilight', 'midnight', 'echo', 'shadow', 'reflection',
  'fingerprint', 'footprint',
  // castles and legends
  'fortress', 'dungeon', 'throne', 'potion', 'goblin', 'troll', 'werewolf', 'mummy', 'scarecrow',
  // sea
  'shipwreck', 'seashell', 'starfish', 'seaweed', 'pearl', 'anchor',
  // gems and materials
  'emerald', 'ruby', 'sapphire', 'marble', 'crystal', 'silver',
  // art and music
  'statue', 'monument', 'gallery', 'sculpture', 'portrait', 'orchestra', 'opera', 'ballet',
  'saxophone', 'accordion', 'xylophone', 'poetry', 'novel', 'alphabet', 'riddle', 'maze',
  // school
  'university', 'graduation', 'diploma', 'homework', 'exam', 'classroom', 'chalkboard', 'chemistry',
  'biology', 'history', 'geography',
  // travel
  'souvenir', 'postcard', 'luggage', 'expedition', 'explorer',
  // harder everyday things
  'hourglass', 'lantern', 'parachute', 'skyscraper', 'windmill', 'chandelier', 'trampoline',
  'escalator', 'binoculars', 'blueprint', 'hammock', 'tuxedo', 'jigsaw', 'domino', 'chess',
  'origami', 'karaoke', 'yoga', 'bandage', 'wheelchair', 'thermos', 'tambourine', 'kaleidoscope',
  // clue-able ideas
  'secret', 'dream', 'nightmare', 'memory', 'silence', 'laughter', 'applause', 'gossip', 'victory',
  'champion', 'hero', 'villain', 'adventure', 'journey', 'mystery', 'surprise', 'freedom', 'danger',
  'energy', 'balance',
]

export const PASSWORD_DECK = [
  ...TIER_1.map(word => ({ word, tier: 1 })),
  ...TIER_2.map(word => ({ word, tier: 2 })),
  ...TIER_3.map(word => ({ word, tier: 3 })),
]
