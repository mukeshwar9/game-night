// HERD MIND deck — plain prompt strings, no answers (there is no answer key:
// the "correct" response is whatever the herd converges on). Every prompt is
// chosen to invite MANY valid answers while having 2–4 obvious gravitational
// centers ("pizza topping" → pepperoni/mushroom/cheese), so groups actually
// form and singletons are rare enough to sting.
//
// Selection criteria (see docs/prds/herd-mind.md):
//   * NO single-canonical-answer prompts — no herd to find, everyone singletons.
//   * NO infinite-spread prompts — no matches ever, nobody ever scores.
//
// ⚠ RESIDUAL (UNFIXABLE) INFO LEAK — same acceptance as decks/fibbage.js: this
// deck ships in the client JS bundle and the active prompt (`round.promptIndex`
// + `round.deckSeed`) is public in Firebase, so a player who inspects the bundle
// can enumerate every prompt in advance. In FIBBAGE that leaks the truth; in
// HERD MIND it leaks NOTHING worth having — the target isn't a hidden answer,
// it's the other players' heads. Knowing the prompt early cannot tell you what
// your friends will type, which is also the pitch for why this game's trust
// model is the strongest on the platform.

export const HERD_PROMPTS = [
  // Food & drink
  'Name a food you eat with your hands.',
  'Name a pizza topping.',
  'Name an ice cream flavor.',
  'Name a type of cheese.',
  'Name a type of pasta.',
  'Name a breakfast cereal.',
  'Name a flavor of potato chip.',
  'Name a warm drink.',
  'Name a food that is better as leftovers.',
  "Name a food served at a kid's birthday party.",
  'Name a white food.',
  'Name a green food.',
  'Name a yellow food.',
  'Name a red fruit or vegetable.',
  'Name a food shaped like a circle.',
  'Name a dessert served warm.',
  'Name a food that comes in a can.',
  'Name a type of bread.',
  'Name a way to cook eggs.',
  'Name a food you can make without cooking.',
  'Name a drink that stains clothes.',
  'Name a food named after a place.',
  'Name a topping people put on toast.',
  'Name a food you would find at a county fair.',
  'Name a fruit with no peel to remove.',

  // Animals
  'Name a farm animal.',
  'Name an animal people keep as a pet.',
  'Name a black-and-white animal.',
  'Name a bird that cannot fly.',
  'Name an animal that hops.',
  'Name an animal with horns.',
  'Name an animal that swims.',
  'Name an animal people impersonate at parties.',
  'Name an animal with a long tail.',
  'Name an animal that sleeps a lot.',
  'Name an animal you would not want as a pet.',
  'Name an animal with big ears.',
  'Name a slow animal.',
  'Name an animal that carries its home.',
  'Name a sea creature people eat.',

  // Household & objects
  'Name something you would find in a kitchen drawer.',
  'Name a household chore people hate.',
  'Name a kitchen appliance.',
  'Name something you would find under couch cushions.',
  'Name something you would find in a toolbox.',
  'Name a piece of furniture.',
  'Name something you would find on a nightstand.',
  'Name something people keep in their car.',
  'Name something you would find in a junk drawer.',
  'Name something you would find behind the fridge.',
  'Name something people stick on the fridge.',
  'Name something you would find in a hotel room.',
  'Name something you would find in a hospital waiting room.',
  'Name something you would find in an office desk.',
  'Name something you would find at a hardware store.',
  'Name something you would find in a first-aid kit.',
  'Name something you would find in a lost-and-found box.',
  'Name something hanging in most closets.',
  'Name something you would find at a gas station.',
  'Name something you would find on a keychain.',

  // Out & about
  'Name something you would find at the beach.',
  'Name something you would see at a zoo.',
  'Name something you would find at a carnival.',
  'Name something you would see on a road trip.',
  'Name a place people hide spare money.',
  'Name a place people accidentally fall asleep.',
  'Name a place you would never want to be stuck overnight.',
  'Name something you would see from an airplane window.',
  'Name a famous landmark.',
  'Name something you would pack for the beach.',

  // People & behavior
  'Name a reason someone is late.',
  'Name a bad habit.',
  'Name something people lose.',
  'Name something people collect.',
  'Name something people are afraid of.',
  'Name something people pretend to enjoy.',
  'Name a reason people cancel plans.',
  'Name something people talk to.',
  'Name something people do before bed.',
  'Name something people do on a Sunday morning.',
  'Name a pet name people call their partner.',
  'Name a thing people say to dogs.',
  'Name something people yell at sports games.',
  "Name a New Year's resolution people abandon by February.",
  'Name something people do to relax.',
  'Name a talent people claim to have on first dates.',

  // Words & language
  'Name a two-letter word.',
  'Name a word that rhymes with time.',
  'Name a word that starts with sn.',
  'Name a word that means big.',
  'Name a word with a silent letter.',
  'Name a word kids often mispronounce.',
  'Name a way to say goodbye.',
  'Name an onomatopoeia.',
  'Name a sound a phone makes.',

  // Entertainment
  'Name a Disney movie.',
  'Name a superhero.',
  'Name a card game.',
  'Name a classic playground game.',
  'Name a board game families fight over.',
  'Name a song everyone knows the words to.',
  'Name a dance style.',
  'Name a famous cartoon character.',
  'Name a movie people quote constantly.',
  'Name a sport played with a ball.',

  // Nature & weather
  'Name a type of storm.',
  'Name a kind of tree.',
  'Name something that melts.',
  'Name something that grows on a vine.',
  'Name a flower people give as gifts.',
  'Name something with thorns.',
  'Name a season people say is their favorite.',
  'Name something you would find in a garden.',
  'Name a body of water people swim in.',

  // Body & health
  'Name a body part doctors always check first.',
  'Name an excuse people give to skip the gym.',
  'Name something that stings.',
  'Name a home remedy for a cold.',
  'Name a reason people sneeze.',
  'Name something people do when nervous.',

  // Tech & modern life
  'Name an app you open every day.',
  'Name something that beeps.',
  'Name a device people charge every night.',
  'Name something that glows in the dark.',
  'Name an emoji people overuse.',
  'Name a website people waste time on.',

  // Clothes & style
  'Name a type of hat.',
  'Name a type of shoe.',
  'Name a color people paint a front door.',
  'Name something made of wool.',
  'Name an accessory people wear every day.',
  'Name a clothing item that never goes out of style.',

  // Travel & events
  'Name a month people take vacations.',
  'Name a country people dream of visiting.',
  'Name something you would bring camping.',
  'Name something you would bring to a picnic.',
  'Name a classic housewarming gift.',
  'Name a wedding tradition people love.',
  'Name a rainy-day activity.',
  'Name a winter activity.',

  // Sensory oddities
  'Name a smell that reminds people of childhood.',
  'Name something that squeaks.',
  'Name something that drips.',
  'Name something that hums.',
  'Name something that spins.',
  'Name something that rattles.',
  'Name something that jingles.',
  'Name something that wobbles.',
  'Name something that pops.',
  'Name something that crackles.',

  // Spares — keep the deck comfortably over 150
  'Name a superpower you would actually want.',
  'Name a job kids dream of having.',
  'Name a subject people hated in school.',
  'Name a fast food chain people secretly love.',
  'Name a hobby that costs nothing.',
]
