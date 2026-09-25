// HERD MIND deck — plain prompt strings with no answer key (the "correct"
// response is whatever the herd converges on; HERD_ANSWER_BANKS below only
// feeds solo-mode bots). Every prompt is
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

// Solo-mode answer banks: a few plausible, common answers per prompt, most
// obvious first (bots weight earlier entries more heavily — see
// pickHerdBotAnswer in herdLogic.js), so bots herd the way people do instead of
// answering from one pool unrelated to the prompt. Every HERD_PROMPTS entry has
// a bank here; herdLogic.test.js checks coverage and family-safety.
export const HERD_ANSWER_BANKS = {
  // Food & drink
  'Name a food you eat with your hands.': ['pizza', 'burger', 'sandwich', 'tacos', 'fries', 'chicken wings'],
  'Name a pizza topping.': ['pepperoni', 'mushrooms', 'cheese', 'pineapple', 'olives', 'sausage'],
  'Name an ice cream flavor.': ['chocolate', 'vanilla', 'strawberry', 'mint chocolate chip', 'cookie dough', 'rocky road'],
  'Name a type of cheese.': ['cheddar', 'mozzarella', 'swiss', 'parmesan', 'brie', 'gouda'],
  'Name a type of pasta.': ['spaghetti', 'penne', 'macaroni', 'lasagna', 'fettuccine', 'ravioli'],
  'Name a breakfast cereal.': ['cheerios', 'corn flakes', 'frosted flakes', 'froot loops', 'lucky charms', 'rice krispies'],
  'Name a flavor of potato chip.': ['salt and vinegar', 'barbecue', 'sour cream and onion', 'plain', 'cheddar', 'salted'],
  'Name a warm drink.': ['coffee', 'tea', 'hot chocolate', 'cider', 'latte', 'soup'],
  'Name a food that is better as leftovers.': ['pizza', 'lasagna', 'chili', 'curry', 'soup', 'fried rice'],
  "Name a food served at a kid's birthday party.": ['cake', 'pizza', 'ice cream', 'hot dogs', 'cupcakes', 'chips'],
  'Name a white food.': ['rice', 'milk', 'bread', 'eggs', 'cauliflower', 'marshmallows'],
  'Name a green food.': ['broccoli', 'lettuce', 'peas', 'spinach', 'cucumber', 'avocado'],
  'Name a yellow food.': ['banana', 'corn', 'lemon', 'cheese', 'mustard', 'pineapple'],
  'Name a red fruit or vegetable.': ['apple', 'strawberry', 'tomato', 'cherry', 'raspberry', 'red pepper'],
  'Name a food shaped like a circle.': ['pizza', 'pancake', 'bagel', 'donut', 'cookie', 'tortilla'],
  'Name a dessert served warm.': ['apple pie', 'brownies', 'cookies', 'cobbler', 'lava cake', 'bread pudding'],
  'Name a food that comes in a can.': ['soup', 'beans', 'tuna', 'corn', 'peaches', 'spam'],
  'Name a type of bread.': ['white bread', 'sourdough', 'rye', 'wheat', 'baguette', 'bagel'],
  'Name a way to cook eggs.': ['scrambled', 'fried', 'boiled', 'poached', 'omelet', 'sunny side up'],
  'Name a food you can make without cooking.': ['sandwich', 'salad', 'cereal', 'smoothie', 'toast', 'fruit salad'],
  'Name a drink that stains clothes.': ['coffee', 'red wine', 'grape juice', 'tea', 'soda', 'tomato juice'],
  'Name a food named after a place.': ['hamburger', 'french fries', 'buffalo wings', 'swiss cheese', 'frankfurter', 'brussels sprouts'],
  'Name a topping people put on toast.': ['jam', 'avocado', 'honey', 'nutella', 'cinnamon sugar', 'marmalade'],
  'Name a food you would find at a county fair.': ['corn dog', 'cotton candy', 'funnel cake', 'fried dough', 'caramel apple', 'lemonade'],
  'Name a fruit with no peel to remove.': ['apple', 'grapes', 'strawberry', 'blueberries', 'cherry', 'pear'],

  // Animals
  'Name a farm animal.': ['cow', 'pig', 'chicken', 'horse', 'sheep', 'goat'],
  'Name an animal people keep as a pet.': ['dog', 'cat', 'fish', 'hamster', 'rabbit', 'parrot'],
  'Name a black-and-white animal.': ['zebra', 'panda', 'penguin', 'skunk', 'cow', 'orca'],
  'Name a bird that cannot fly.': ['penguin', 'ostrich', 'emu', 'kiwi', 'chicken', 'dodo'],
  'Name an animal that hops.': ['kangaroo', 'rabbit', 'frog', 'grasshopper', 'toad', 'wallaby'],
  'Name an animal with horns.': ['goat', 'rhino', 'bull', 'ram', 'deer', 'unicorn'],
  'Name an animal that swims.': ['fish', 'dolphin', 'whale', 'duck', 'shark', 'otter'],
  'Name an animal people impersonate at parties.': ['monkey', 'chicken', 'dog', 'cat', 'cow', 'duck'],
  'Name an animal with a long tail.': ['monkey', 'cat', 'lizard', 'mouse', 'dog', 'kangaroo'],
  'Name an animal that sleeps a lot.': ['cat', 'sloth', 'koala', 'bear', 'dog', 'lion'],
  'Name an animal you would not want as a pet.': ['snake', 'skunk', 'shark', 'lion', 'spider', 'alligator'],
  'Name an animal with big ears.': ['elephant', 'rabbit', 'donkey', 'bat', 'fox', 'mouse'],
  'Name a slow animal.': ['sloth', 'snail', 'turtle', 'tortoise', 'slug', 'koala'],
  'Name an animal that carries its home.': ['snail', 'turtle', 'hermit crab', 'tortoise', 'kangaroo'],
  'Name a sea creature people eat.': ['shrimp', 'lobster', 'crab', 'salmon', 'tuna', 'squid'],

  // Household & objects
  'Name something you would find in a kitchen drawer.': ['spoon', 'fork', 'knife', 'spatula', 'scissors', 'rubber bands'],
  'Name a household chore people hate.': ['dishes', 'laundry', 'vacuuming', 'cleaning the toilet', 'ironing', 'dusting'],
  'Name a kitchen appliance.': ['toaster', 'microwave', 'blender', 'fridge', 'oven', 'kettle'],
  'Name something you would find under couch cushions.': ['coins', 'crumbs', 'remote', 'keys', 'popcorn', 'hair ties'],
  'Name something you would find in a toolbox.': ['hammer', 'screwdriver', 'wrench', 'nails', 'tape measure', 'pliers'],
  'Name a piece of furniture.': ['couch', 'chair', 'table', 'bed', 'desk', 'dresser'],
  'Name something you would find on a nightstand.': ['lamp', 'phone', 'alarm clock', 'book', 'glass of water', 'glasses'],
  'Name something people keep in their car.': ['sunglasses', 'phone charger', 'water bottle', 'umbrella', 'napkins', 'spare tire'],
  'Name something you would find in a junk drawer.': ['batteries', 'rubber bands', 'pens', 'tape', 'keys', 'scissors'],
  'Name something you would find behind the fridge.': ['dust', 'magnets', 'crumbs', 'coins', 'a lost toy', 'spider webs'],
  'Name something people stick on the fridge.': ['magnets', 'photos', 'drawings', 'shopping list', 'calendar', 'postcards'],
  'Name something you would find in a hotel room.': ['bed', 'towels', 'bible', 'tv', 'mini fridge', 'soap'],
  'Name something you would find in a hospital waiting room.': ['magazines', 'chairs', 'tv', 'plants', 'water cooler', 'tissues'],
  'Name something you would find in an office desk.': ['pens', 'stapler', 'paper clips', 'sticky notes', 'paper', 'snacks'],
  'Name something you would find at a hardware store.': ['hammer', 'nails', 'paint', 'screws', 'tools', 'lumber'],
  'Name something you would find in a first-aid kit.': ['bandages', 'gauze', 'tape', 'scissors', 'gloves', 'ointment'],
  'Name something you would find in a lost-and-found box.': ['gloves', 'umbrella', 'keys', 'hat', 'jacket', 'water bottle'],
  'Name something hanging in most closets.': ['shirts', 'coats', 'hangers', 'jackets', 'dresses', 'pants'],
  'Name something you would find at a gas station.': ['gas', 'snacks', 'candy', 'soda', 'coffee', 'air pump'],
  'Name something you would find on a keychain.': ['keys', 'bottle opener', 'car key', 'flashlight', 'charm', 'house key'],

  // Out & about
  'Name something you would find at the beach.': ['sand', 'shells', 'towel', 'umbrella', 'waves', 'sandcastle'],
  'Name something you would see at a zoo.': ['lion', 'elephant', 'giraffe', 'monkey', 'zebra', 'penguin'],
  'Name something you would find at a carnival.': ['ferris wheel', 'cotton candy', 'rides', 'games', 'clowns', 'corn dogs'],
  'Name something you would see on a road trip.': ['cows', 'gas station', 'billboards', 'mountains', 'trucks', 'road signs'],
  'Name a place people hide spare money.': ['mattress', 'sock drawer', 'shoe', 'freezer', 'piggy bank', 'book'],
  'Name a place people accidentally fall asleep.': ['couch', 'car', 'work', 'movie theater', 'class', 'bus'],
  'Name a place you would never want to be stuck overnight.': ['elevator', 'airport', 'cemetery', 'jail', 'school', 'hospital'],
  'Name something you would see from an airplane window.': ['clouds', 'wing', 'ocean', 'mountains', 'city lights', 'sky'],
  'Name a famous landmark.': ['eiffel tower', 'statue of liberty', 'big ben', 'great wall', 'pyramids', 'taj mahal'],
  'Name something you would pack for the beach.': ['sunscreen', 'towel', 'swimsuit', 'sunglasses', 'umbrella', 'snacks'],

  // People & behavior
  'Name a reason someone is late.': ['traffic', 'overslept', 'alarm', 'car trouble', 'lost keys', 'weather'],
  'Name a bad habit.': ['nail biting', 'smoking', 'swearing', 'procrastinating', 'being late', 'snacking'],
  'Name something people lose.': ['keys', 'phone', 'wallet', 'socks', 'glasses', 'remote'],
  'Name something people collect.': ['stamps', 'coins', 'cards', 'rocks', 'shells', 'magnets'],
  'Name something people are afraid of.': ['spiders', 'heights', 'snakes', 'the dark', 'clowns', 'public speaking'],
  'Name something people pretend to enjoy.': ['gifts', 'work', 'exercise', 'vegetables', 'opera', 'small talk'],
  'Name a reason people cancel plans.': ['sick', 'tired', 'work', 'weather', 'babysitter', 'family'],
  'Name something people talk to.': ['pets', 'plants', 'themselves', 'dog', 'tv', 'phone'],
  'Name something people do before bed.': ['brush teeth', 'read', 'shower', 'check phone', 'pray', 'watch tv'],
  'Name something people do on a Sunday morning.': ['sleep in', 'church', 'brunch', 'read the paper', 'pancakes', 'jog'],
  'Name a pet name people call their partner.': ['honey', 'babe', 'sweetie', 'darling', 'baby', 'sugar'],
  'Name a thing people say to dogs.': ['good boy', 'sit', 'who is a good boy', 'fetch', 'stay', 'no'],
  'Name something people yell at sports games.': ['go', 'defense', 'come on', 'boo', 'shoot', 'ref'],
  "Name a New Year's resolution people abandon by February.": ['exercise', 'diet', 'lose weight', 'gym', 'save money', 'read more'],
  'Name something people do to relax.': ['read', 'take a bath', 'sleep', 'watch tv', 'yoga', 'music'],
  'Name a talent people claim to have on first dates.': ['cooking', 'singing', 'dancing', 'guitar', 'juggling', 'painting'],

  // Words & language
  'Name a two-letter word.': ['hi', 'no', 'is', 'it', 'to', 'go'],
  'Name a word that rhymes with time.': ['lime', 'dime', 'rhyme', 'climb', 'mime', 'chime'],
  'Name a word that starts with sn.': ['snake', 'snow', 'snack', 'snail', 'sneeze', 'snap'],
  'Name a word that means big.': ['huge', 'large', 'giant', 'enormous', 'massive', 'gigantic'],
  'Name a word with a silent letter.': ['knife', 'knee', 'lamb', 'island', 'know', 'gnome'],
  'Name a word kids often mispronounce.': ['spaghetti', 'library', 'animal', 'hospital', 'breakfast', 'specific'],
  'Name a way to say goodbye.': ['bye', 'see ya', 'later', 'ciao', 'adios', 'farewell'],
  'Name an onomatopoeia.': ['boom', 'bang', 'buzz', 'pow', 'splash', 'meow'],
  'Name a sound a phone makes.': ['ring', 'buzz', 'beep', 'ding', 'vibrate', 'chime'],

  // Entertainment
  'Name a Disney movie.': ['frozen', 'the lion king', 'aladdin', 'moana', 'cinderella', 'toy story'],
  'Name a superhero.': ['superman', 'batman', 'spider-man', 'wonder woman', 'iron man', 'hulk'],
  'Name a card game.': ['poker', 'go fish', 'uno', 'solitaire', 'war', 'blackjack'],
  'Name a classic playground game.': ['tag', 'hide and seek', 'hopscotch', 'red rover', 'four square', 'jump rope'],
  'Name a board game families fight over.': ['monopoly', 'scrabble', 'risk', 'sorry', 'clue', 'uno'],
  'Name a song everyone knows the words to.': ['happy birthday', 'bohemian rhapsody', 'sweet caroline', 'wonderwall', 'let it go', 'twinkle twinkle'],
  'Name a dance style.': ['salsa', 'ballet', 'hip hop', 'tango', 'waltz', 'tap'],
  'Name a famous cartoon character.': ['mickey mouse', 'bugs bunny', 'spongebob', 'homer simpson', 'scooby doo', 'pikachu'],
  'Name a movie people quote constantly.': ['star wars', 'the godfather', 'mean girls', 'forrest gump', 'anchorman', 'titanic'],
  'Name a sport played with a ball.': ['soccer', 'basketball', 'football', 'tennis', 'baseball', 'volleyball'],

  // Nature & weather
  'Name a type of storm.': ['thunderstorm', 'hurricane', 'snowstorm', 'tornado', 'blizzard', 'hailstorm'],
  'Name a kind of tree.': ['oak', 'pine', 'maple', 'palm', 'birch', 'willow'],
  'Name something that melts.': ['ice', 'snow', 'ice cream', 'chocolate', 'cheese', 'candle'],
  'Name something that grows on a vine.': ['grapes', 'tomatoes', 'pumpkin', 'cucumber', 'ivy', 'watermelon'],
  'Name a flower people give as gifts.': ['rose', 'tulip', 'lily', 'sunflower', 'daisy', 'carnation'],
  'Name something with thorns.': ['rose', 'cactus', 'blackberry bush', 'bush', 'thistle', 'pineapple'],
  'Name a season people say is their favorite.': ['summer', 'fall', 'spring', 'winter', 'autumn'],
  'Name something you would find in a garden.': ['flowers', 'vegetables', 'gnome', 'hose', 'worms', 'tomatoes'],
  'Name a body of water people swim in.': ['ocean', 'lake', 'pool', 'river', 'sea', 'pond'],

  // Body & health
  'Name a body part doctors always check first.': ['heart', 'throat', 'ears', 'eyes', 'pulse', 'lungs'],
  'Name an excuse people give to skip the gym.': ['tired', 'too busy', 'sore', 'sick', 'weather', 'no time'],
  'Name something that stings.': ['bee', 'wasp', 'jellyfish', 'scorpion', 'nettle', 'soap in your eyes'],
  'Name a home remedy for a cold.': ['chicken soup', 'tea', 'honey', 'rest', 'orange juice', 'vitamin c'],
  'Name a reason people sneeze.': ['pollen', 'dust', 'cold', 'pepper', 'allergies', 'sunlight'],
  'Name something people do when nervous.': ['bite nails', 'sweat', 'pace', 'fidget', 'laugh', 'talk fast'],

  // Tech & modern life
  'Name an app you open every day.': ['instagram', 'email', 'whatsapp', 'youtube', 'tiktok', 'weather'],
  'Name something that beeps.': ['microwave', 'alarm clock', 'car horn', 'smoke detector', 'truck backing up', 'phone'],
  'Name a device people charge every night.': ['phone', 'watch', 'tablet', 'laptop', 'earbuds', 'headphones'],
  'Name something that glows in the dark.': ['stars', 'firefly', 'glow stick', 'moon', 'watch', 'nightlight'],
  'Name an emoji people overuse.': ['laughing face', 'thumbs up', 'heart', 'crying laughing', 'fire', 'smiley face'],
  'Name a website people waste time on.': ['youtube', 'facebook', 'reddit', 'instagram', 'tiktok', 'wikipedia'],

  // Clothes & style
  'Name a type of hat.': ['baseball cap', 'cowboy hat', 'beanie', 'top hat', 'sun hat', 'fedora'],
  'Name a type of shoe.': ['sneakers', 'boots', 'sandals', 'high heels', 'flip flops', 'loafers'],
  'Name a color people paint a front door.': ['red', 'black', 'blue', 'white', 'green', 'yellow'],
  'Name something made of wool.': ['sweater', 'socks', 'scarf', 'blanket', 'hat', 'mittens'],
  'Name an accessory people wear every day.': ['watch', 'ring', 'glasses', 'necklace', 'earrings', 'belt'],
  'Name a clothing item that never goes out of style.': ['jeans', 'white shirt', 'little black dress', 'leather jacket', 't-shirt', 'blazer'],

  // Travel & events
  'Name a month people take vacations.': ['july', 'august', 'june', 'december', 'march', 'may'],
  'Name a country people dream of visiting.': ['italy', 'france', 'japan', 'greece', 'australia', 'spain'],
  'Name something you would bring camping.': ['tent', 'sleeping bag', 'flashlight', 'marshmallows', 'bug spray', 'matches'],
  'Name something you would bring to a picnic.': ['blanket', 'sandwiches', 'basket', 'fruit', 'lemonade', 'chips'],
  'Name a classic housewarming gift.': ['wine', 'plant', 'candle', 'flowers', 'bread and salt', 'picture frame'],
  'Name a wedding tradition people love.': ['first dance', 'bouquet toss', 'cutting the cake', 'kiss', 'speeches', 'something blue'],
  'Name a rainy-day activity.': ['watch a movie', 'read', 'board games', 'nap', 'baking', 'puzzles'],
  'Name a winter activity.': ['skiing', 'sledding', 'ice skating', 'snowball fight', 'building a snowman', 'snowboarding'],

  // Sensory oddities
  'Name a smell that reminds people of childhood.': ['crayons', 'play-doh', 'cookies', 'fresh cut grass', 'sunscreen', 'baking bread'],
  'Name something that squeaks.': ['mouse', 'door', 'shoes', 'floorboard', 'rubber duck', 'swing'],
  'Name something that drips.': ['faucet', 'water', 'ice cream', 'rain', 'candle', 'nose'],
  'Name something that hums.': ['fridge', 'bee', 'engine', 'computer', 'hummingbird', 'fan'],
  'Name something that spins.': ['top', 'wheel', 'fan', 'record', 'washing machine', 'ferris wheel'],
  'Name something that rattles.': ['baby rattle', 'rattlesnake', 'maracas', 'window', 'keys', 'car'],
  'Name something that jingles.': ['keys', 'bells', 'coins', 'sleigh bells', 'jingle bells', 'tambourine'],
  'Name something that wobbles.': ['jelly', 'table', 'jello', 'bike', 'baby', 'spinning top'],
  'Name something that pops.': ['balloon', 'popcorn', 'bubble', 'bubble wrap', 'corn', 'cork'],
  'Name something that crackles.': ['fire', 'campfire', 'rice krispies', 'fireplace', 'leaves', 'radio'],

  // Spares
  'Name a superpower you would actually want.': ['flying', 'invisibility', 'teleportation', 'time travel', 'mind reading', 'super speed'],
  'Name a job kids dream of having.': ['astronaut', 'firefighter', 'doctor', 'teacher', 'vet', 'police officer'],
  'Name a subject people hated in school.': ['math', 'history', 'science', 'chemistry', 'gym', 'english'],
  'Name a fast food chain people secretly love.': ['mcdonalds', 'taco bell', 'burger king', 'wendys', 'kfc', 'subway'],
  'Name a hobby that costs nothing.': ['walking', 'running', 'reading', 'hiking', 'drawing', 'singing'],
}
