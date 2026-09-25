// FIBBAGE deck — each entry has a `prompt` with a blank (___) and the real
// `answer` that fills it. Players invent fake answers; everyone votes on which
// of the shuffled options is the truth. Keep answers short and surprising.
//
// CONTENT RULES: only well-established, checkable facts — no myths or "fun
// facts" that fall apart on inspection (the old "the elephant is the only mammal
// that can't jump" item was false and has been removed). Avoid "more than N"
// style prompts where a wrong number would still make the sentence true.
//
// `decoys` — used by solo/bot play: 2–3 short plausible fake answers a bot "lies"
// with. Each must grammatically fit the blank, match the answer's register, make
// the sentence FALSE, and never be truth-like (fibbageLogic.isTruthLike) —
// fibbageLogic.test.js enforces the last part.
//
// ⚠ RESIDUAL (UNFIXABLE) INFO LEAK: this deck — including every `answer` — ships
// in the client JS bundle, and the active prompt (`round.promptIndex` + the match's
// `round.deckSeed`) is public in Firebase. A player who inspects the bundle can
// therefore always derive the truth, no matter how the ballot is anonymised.
// FibbageGame's mitigations (anonymised options + author→lie map withheld until
// reveal, see src/lib/fibbageLogic.js) only defend against CASUAL/spectator leakage
// of a single Firebase field. Closing this hole would require a trusted server to
// hold the answers and grade votes server-side — impossible in this serverless,
// world-readable-`games/$id` architecture.

export const FIBBAGE_FACTS = [
  // --- Animals ---
  { prompt: 'In Switzerland, it is illegal to own just one ___, because they are social animals.', answer: 'guinea pig', decoys: ['hamster', 'goldfish', 'parrot'] },
  { prompt: 'The unicorn is the official national animal of ___.', answer: 'Scotland', decoys: ['Ireland', 'Wales', 'Norway'] },
  { prompt: 'A group of flamingos is called a ___.', answer: 'flamboyance', decoys: ['parade', 'fiesta', 'blush'] },
  { prompt: 'A group of crows is called a ___.', answer: 'murder', decoys: ['cackle', 'riot', 'shadow'] },
  { prompt: 'A group of owls is called a ___.', answer: 'parliament', decoys: ['senate', 'council', 'hoot'] },
  { prompt: 'A group of rhinos is called a ___.', answer: 'crash', decoys: ['charge', 'stampede', 'rumble'] },
  { prompt: 'A group of jellyfish is called a ___.', answer: 'smack', decoys: ['wobble', 'jiggle', 'drift'] },
  { prompt: 'A baby kangaroo is called a ___.', answer: 'joey', decoys: ['kit', 'cub', 'pup'] },
  { prompt: 'A baby puffin is called a ___.', answer: 'puffling', decoys: ['pufflet', 'puffkin', 'squab'] },
  { prompt: 'Octopuses have ___ hearts.', answer: 'three', decoys: ['two', 'four', 'five'] },
  { prompt: "Most of an octopus's neurons are in its ___.", answer: 'arms', decoys: ['head', 'skin', 'eyes'] },
  { prompt: 'Wombat droppings are shaped like ___.', answer: 'cubes', decoys: ['pyramids', 'stars', 'discs'] },
  { prompt: "Sea otters hold ___ while they sleep so they don't drift apart.", answer: 'hands', decoys: ['tails', 'whiskers', 'ears'] },
  { prompt: 'Sloths can hold their breath longer than ___ can.', answer: 'dolphins', decoys: ['sea turtles', 'crocodiles', 'sperm whales'] },
  { prompt: "___ have fingerprints so similar to humans' that they could confuse a crime scene investigator.", answer: 'Koalas', decoys: ['Raccoons', 'Lemurs', 'Otters'] },
  { prompt: 'Honey bees tell each other where to find flowers by doing a ___.', answer: 'waggle dance', decoys: ['buzz song', 'wing flash', 'pollen trail'] },
  { prompt: 'Horseshoe crabs have ___ blood.', answer: 'blue', decoys: ['green', 'purple', 'orange'] },
  { prompt: 'A garden snail has thousands of tiny ___.', answer: 'teeth', decoys: ['eyes', 'hearts', 'legs'] },
  { prompt: 'Butterflies taste with their ___.', answer: 'feet', decoys: ['wings', 'eyes', 'tails'] },
  { prompt: "Starfish don't have a ___.", answer: 'brain', decoys: ['mouth', 'stomach', 'skeleton'] },
  { prompt: "A shrimp's heart is in its ___.", answer: 'head', decoys: ['tail', 'legs', 'claws'] },
  { prompt: 'Giraffes have the same number of neck bones as ___.', answer: 'humans', decoys: ['snakes', 'swans', 'owls'] },
  { prompt: "An ostrich's eye is bigger than its ___.", answer: 'brain', decoys: ['heart', 'stomach', 'beak'] },
  { prompt: 'Under their white-looking fur, polar bears have ___ skin.', answer: 'black', decoys: ['white', 'pink', 'orange'] },
  { prompt: "Cats can't taste ___.", answer: 'sweetness', decoys: ['saltiness', 'bitterness', 'sourness'] },
  { prompt: 'Crows can remember individual human ___ for years.', answer: 'faces', decoys: ['names', 'handwriting', 'shoe sizes'] },
  { prompt: "In seahorses, it's the ___ that gets pregnant.", answer: 'male', decoys: ['female', 'eldest', 'biggest'] },
  { prompt: 'Hippos ooze a ___ fluid that works like a natural sunscreen.', answer: 'red', decoys: ['blue', 'green', 'purple'] },
  { prompt: "Kangaroos can't easily walk ___.", answer: 'backwards', decoys: ['uphill', 'on sand', 'in the rain'] },
  { prompt: 'Under ultraviolet light, platypus fur glows ___.', answer: 'blue-green', decoys: ['pink', 'orange', 'red'] },
  { prompt: 'Sharks have been around for longer than ___.', answer: 'trees', decoys: ['jellyfish', 'sponges', 'coral'] },

  // --- Food & plants ---
  { prompt: 'Archaeologists have found pots of honey in ancient Egyptian tombs that were still ___.', answer: 'edible', decoys: ['toxic', 'fizzy', 'frozen'] },
  { prompt: 'Botanically, bananas are classified as ___.', answer: 'berries', decoys: ['drupes', 'legumes', 'nuts'] },
  { prompt: 'Botanically, a raspberry is not a true berry, but an ___ is.', answer: 'avocado', decoys: ['apple', 'almond', 'olive'] },
  { prompt: "Peanuts aren't really nuts. They're ___.", answer: 'legumes', decoys: ['tubers', 'grains', 'berries'] },
  { prompt: 'A cashew nut grows hanging from the bottom of a fruit called the cashew ___.', answer: 'apple', decoys: ['pear', 'plum', 'fig'] },
  { prompt: 'Vanilla comes from the seed pods of an ___.', answer: 'orchid', decoys: ['iris', 'oak tree', 'aloe plant'] },
  { prompt: 'Saffron is made from the dried ___ of crocus flowers.', answer: 'stigmas', decoys: ['petals', 'roots', 'seeds'] },
  { prompt: 'Most "wasabi" served outside Japan is really dyed ___.', answer: 'horseradish', decoys: ['ginger', 'avocado', 'cabbage'] },
  { prompt: 'Before the 1600s, most farmed carrots were ___ or yellow, not orange.', answer: 'purple', decoys: ['blue', 'green', 'pink'] },
  { prompt: 'In the 1830s, tomato ketchup was sold as a ___.', answer: 'medicine', decoys: ['hair tonic', 'shoe polish', 'furniture stain'] },
  { prompt: 'The Caesar salad was invented in ___.', answer: 'Mexico', decoys: ['Italy', 'Greece', 'France'] },
  { prompt: 'Fortune cookies as we know them were first served in ___, not China.', answer: 'California', decoys: ['Hong Kong', 'New York', 'Hawaii'] },
  { prompt: 'German chocolate cake is named after an American chocolate maker called Samuel ___.', answer: 'German', decoys: ['Hershey', 'Schmidt', 'Fudge'] },
  { prompt: 'Hawaiian pizza was invented in ___.', answer: 'Canada', decoys: ['Hawaii', 'Australia', 'Sweden'] },
  { prompt: "A chili pepper's heat is measured in ___ units.", answer: 'Scoville', decoys: ['Blaze', 'Kelvin', 'Pepperton'] },
  { prompt: 'Apples float in water because they are about 25% ___.', answer: 'air', decoys: ['sugar', 'fiber', 'juice'] },

  // --- Human body ---
  { prompt: 'The ___ is the only bone in the human body not connected to another bone.', answer: 'hyoid', decoys: ['kneecap', 'collarbone', 'tailbone'] },
  { prompt: 'Babies are born with kneecaps made of ___ instead of bone.', answer: 'cartilage', decoys: ['fat', 'muscle', 'jelly'] },
  { prompt: 'Your stomach grows a new lining every few ___.', answer: 'days', decoys: ['hours', 'months', 'years'] },
  { prompt: "It's almost impossible to hum while holding your ___.", answer: 'nose', decoys: ['tongue', 'ears', 'elbows'] },
  { prompt: 'The groove between your nose and upper lip is called the ___.', answer: 'philtrum', decoys: ['glabella', 'septum', 'lunula'] },
  { prompt: 'The pale half-moon at the base of a fingernail is called the ___.', answer: 'lunula', decoys: ['cuticle', 'crescent', 'halo'] },

  // --- Words & names ---
  { prompt: 'The dot over a lowercase i or j is called a ___.', answer: 'tittle', decoys: ['serif', 'pip', 'dimple'] },
  { prompt: 'The plastic tips on the ends of shoelaces are called ___.', answer: 'aglets', decoys: ['grommets', 'eyelets', 'toggles'] },
  { prompt: 'The # symbol is also known as an ___.', answer: 'octothorpe', decoys: ['ampersand', 'interrobang', 'asterisk'] },
  { prompt: "___ is the only letter that doesn't appear in any U.S. state name.", answer: 'Q', decoys: ['X', 'Z', 'J'] },
  { prompt: 'The word "___" can be typed using only the top letter row of a QWERTY keyboard.', answer: 'typewriter', decoys: ['keyboard', 'computer', 'printer'] },
  { prompt: '"Dreamt" is the only common English word that ends in the letters ___.', answer: 'mt', decoys: ['pt', 'wn', 'mb'] },
  { prompt: 'Researchers at the University of Glasgow counted 421 Scots words for ___.', answer: 'snow', decoys: ['rain', 'wind', 'fog'] },
  { prompt: 'The name LEGO comes from the Danish words "leg godt", meaning ___.', answer: 'play well', decoys: ['build big', 'little bricks', 'good toys'] },
  { prompt: 'The word "robot" comes from a Czech word meaning ___.', answer: 'forced labor', decoys: ['metal man', 'machine', 'helper'] },
  { prompt: 'The word "muscle" comes from a Latin word meaning little ___.', answer: 'mouse', decoys: ['rope', 'worm', 'snake'] },
  { prompt: 'The word "salary" comes from the Latin word for ___.', answer: 'salt', decoys: ['silver', 'soldier', 'bread'] },
  { prompt: 'The word "disaster" literally means bad ___.', answer: 'star', decoys: ['weather', 'harvest', 'river'] },
  { prompt: "Mr. Monopoly's original name was Rich Uncle ___.", answer: 'Pennybags', decoys: ['Moneybags', 'Bigbucks', 'Goldsworth'] },
  { prompt: "Barbie's full name is Barbara Millicent ___.", answer: 'Roberts', decoys: ['Johnson', 'Carter', 'Hughes'] },
  { prompt: 'Mario, of Super Mario fame, was originally called ___.', answer: 'Jumpman', decoys: ['Plumbman', 'Hammerman', 'Barrel Boy'] },

  // --- Inventions & companies ---
  { prompt: 'The inventor of the Pringles can had some of his ashes buried in ___.', answer: 'a Pringles can', decoys: ['a cereal box', 'a cookie jar', 'his golf bag'] },
  { prompt: 'The first product ever scanned with a barcode at a supermarket checkout was a pack of ___.', answer: 'chewing gum', decoys: ['cigarettes', 'batteries', 'mints'] },
  { prompt: 'The first webcam was pointed at a ___ in a Cambridge University computer lab.', answer: 'coffee pot', decoys: ['fish tank', 'parking lot', 'bird feeder'] },
  { prompt: 'The first item ever sold on eBay was a broken ___.', answer: 'laser pointer', decoys: ['toaster', 'calculator', 'lava lamp'] },
  { prompt: 'The first video ever uploaded to YouTube was filmed at a ___.', answer: 'zoo', decoys: ['beach', 'bowling alley', 'birthday party'] },
  { prompt: 'The first text message ever sent said "___".', answer: 'Merry Christmas', decoys: ['Hello World', 'Can you hear me', 'Testing testing'] },
  { prompt: 'The first Apple computer went on sale for $___.', answer: '666.66', decoys: ['999.99', '500.00', '1,234.56'] },
  { prompt: 'The first recorded computer "bug" was an actual ___ stuck in a machine.', answer: 'moth', decoys: ['beetle', 'spider', 'cockroach'] },
  { prompt: 'Nintendo was founded in 1889 to make ___.', answer: 'playing cards', decoys: ['toy trains', 'umbrellas', 'kites'] },
  { prompt: 'Before it built cars, the company behind Toyota made automatic ___.', answer: 'looms', decoys: ['sewing machines', 'bicycles', 'typewriters'] },
  { prompt: 'Nokia began in 1865 as a mill making ___.', answer: 'wood pulp', decoys: ['flour', 'steel', 'cotton cloth'] },
  { prompt: 'Bubble wrap was first invented as a textured ___.', answer: 'wallpaper', decoys: ['floor mat', 'raincoat', 'pool cover'] },
  { prompt: 'Play-Doh was first sold as a ___ cleaner.', answer: 'wallpaper', decoys: ['window', 'oven', 'carpet'] },
  { prompt: 'Mr. Potato Head was the first toy ever advertised on ___.', answer: 'television', decoys: ['radio', 'billboards', 'cereal boxes'] },
  { prompt: 'Tetris was created in the ___.', answer: 'Soviet Union', decoys: ['Japan', 'Finland', 'Canada'] },
  { prompt: "Pac-Man's shape was inspired by a pizza with a ___ missing.", answer: 'slice', decoys: ['topping', 'crust', 'pepperoni'] },
  { prompt: "Velcro was inspired by burrs stuck to a ___'s fur.", answer: 'dog', decoys: ['cat', 'horse', 'sheep'] },
  { prompt: 'The microwave oven was invented after an engineer noticed a melted ___ in his pocket.', answer: 'chocolate bar', decoys: ['crayon', 'lip balm', 'cheese sandwich'] },
  { prompt: 'Penicillin was discovered when mold grew in a forgotten ___.', answer: 'petri dish', decoys: ['sandwich', 'loaf of bread', 'orange'] },
  { prompt: "Darth Vader's breathing sound was made with a ___ regulator.", answer: 'scuba', decoys: ['hospital', 'vacuum', 'space suit'] },
  { prompt: 'The first mechanical alarm clock, made in 1787, could only ring at ___.', answer: '4 a.m.', decoys: ['6 a.m.', 'noon', 'midnight'] },

  // --- History ---
  { prompt: 'The Anglo-Zanzibar War of 1896, the shortest war on record, was over in less than one ___.', answer: 'hour', decoys: ['minute', 'second', 'heartbeat'] },
  { prompt: 'The Hundred Years’ War actually lasted ___ years.', answer: '116', decoys: ['100', '99', '88'] },
  { prompt: 'The University of Oxford is older than the ___ Empire.', answer: 'Aztec', decoys: ['Roman', 'Byzantine', 'Persian'] },
  { prompt: 'Cleopatra lived closer in time to the Moon landing than to the building of the ___.', answer: 'Great Pyramid', decoys: ['Colosseum', 'Parthenon', 'Pantheon'] },
  { prompt: 'The Eiffel Tower was only supposed to stand for ___ years.', answer: '20', decoys: ['5', '50', '100'] },
  { prompt: 'Thanks to heat expansion, the Eiffel Tower can grow about 15 centimetres taller in ___.', answer: 'summer', decoys: ['winter', 'the rain', 'a snowstorm'] },
  { prompt: 'When it was new, the Statue of Liberty was the color of a shiny ___.', answer: 'penny', decoys: ['gold coin', 'silver spoon', 'lemon'] },
  { prompt: 'Abraham Lincoln is honored in the National ___ Hall of Fame.', answer: 'Wrestling', decoys: ['Boxing', 'Chess', 'Fencing'] },
  { prompt: 'In 1896, the first driver in Britain fined for speeding was doing about ___ mph.', answer: '8', decoys: ['15', '25', '40'] },
  { prompt: 'Before alarm clocks were common, "knocker-uppers" woke people by tapping on their ___ with long poles.', answer: 'windows', decoys: ['chimneys', 'roofs', 'gates'] },
  { prompt: 'During World War II, Princess Elizabeth, later Queen Elizabeth II, trained as a ___.', answer: 'mechanic', decoys: ['pilot', 'chef', 'nurse'] },
  { prompt: 'In 1952, Albert Einstein was offered the presidency of ___.', answer: 'Israel', decoys: ['Germany', 'Switzerland', 'Austria'] },
  { prompt: 'Olympic gold medals are made mostly of ___.', answer: 'silver', decoys: ['bronze', 'brass', 'copper'] },

  // --- Space, Earth & science ---
  { prompt: 'Australia is wider than the ___.', answer: 'Moon', decoys: ['Sahara', 'United States', 'Mars'] },
  { prompt: 'Russia has a bigger surface area than ___.', answer: 'Pluto', decoys: ['the Moon', 'Mars', 'Mercury'] },
  { prompt: 'Compared with most planets, Venus spins ___.', answer: 'backwards', decoys: ['sideways', 'faster', 'in bursts'] },
  { prompt: 'Saturn is so light for its size that it would ___ in a big enough bathtub.', answer: 'float', decoys: ['sink', 'melt', 'shatter'] },
  { prompt: 'A puffy cumulus cloud can weigh about as much as a hundred ___.', answer: 'elephants', decoys: ['feathers', 'bicycles', 'pianos'] },
  { prompt: 'A lightning bolt is about five times hotter than the ___.', answer: 'surface of the Sun', decoys: ['core of the Sun', 'lava', 'a candle flame'] },
  { prompt: 'Sound travels about four times faster through ___ than through air.', answer: 'water', decoys: ['space', 'fog', 'helium'] },
  { prompt: 'A googol is a 1 followed by ___ zeros.', answer: '100', decoys: ['1,000', '50', '64'] },
  { prompt: 'Counting its overseas territories, the country with the most time zones is ___.', answer: 'France', decoys: ['Russia', 'United States', 'China'] },
  { prompt: "Measured from base to peak, the world's tallest mountain is ___.", answer: 'Mauna Kea', decoys: ['K2', 'Denali', 'Kilimanjaro'] },
  { prompt: 'The city of Istanbul sits on two ___.', answer: 'continents', decoys: ['volcanoes', 'rivers', 'glaciers'] },
  { prompt: 'The Sahara Desert is roughly the size of the ___.', answer: 'United States', decoys: ['United Kingdom', 'India', 'Moon'] },
  { prompt: "Siberia's Lake Baikal holds about ___ of the world's unfrozen fresh surface water.", answer: 'a fifth', decoys: ['half', 'a tenth', 'a third'] },
  { prompt: "Vatican City is smaller than New York's ___.", answer: 'Central Park', decoys: ['Times Square', 'Grand Central Station', 'Empire State Building'] },
]
