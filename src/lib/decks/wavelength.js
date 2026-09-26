// Spectrum pairs for WAVELENGTH. Each pair anchors the two ends of a 0–100 dial:
// `left` lives at 0, `right` lives at 100. The clue-giver sees a hidden target
// somewhere along it and gives a one-word clue; everyone else guesses where.
//
// Pairs must be clear opposites, and unique (wavelengthLogic.test.js checks).
//
// `clueBank` — used by solo/bot play: each entry is a real-world thing/concept a
// clue-giver would plausibly say (not a bare synonym of `left`/`right`) paired with
// where it actually sits on the dial (`pos`, 0–100). Every word must itself be a
// legal clue (one word, no digits, not a dial word — validateClue), because bots
// give these as clues and read them back when guessing.
//
// Rooms store a `spectrumIndex` into this array (and the room's seen history is
// keyed by it), so new pairs are appended and existing ones are never reordered
// or removed (see docs/content-policy.md).
export const WAVELENGTH_PAIRS = [
  { left: 'COLD', right: 'HOT', clueBank: [
    { word: 'ICEBERG', pos: 3 },
    { word: 'SNOWMAN', pos: 8 },
    { word: 'BATHWATER', pos: 62 },
    { word: 'SAUNA', pos: 88 },
  ] },
  { left: 'CHEAP', right: 'EXPENSIVE', clueBank: [
    { word: 'GUM', pos: 4 },
    { word: 'SANDWICH', pos: 20 },
    { word: 'SMARTPHONE', pos: 65 },
    { word: 'YACHT', pos: 97 },
  ] },
  { left: 'BORING', right: 'EXCITING', clueBank: [
    { word: 'PAPERWORK', pos: 5 },
    { word: 'GOLF', pos: 35 },
    { word: 'CONCERT', pos: 75 },
    { word: 'SKYDIVING', pos: 95 },
  ] },
  { left: 'QUIET', right: 'LOUD', clueBank: [
    { word: 'LIBRARY', pos: 4 },
    { word: 'WHISPER', pos: 10 },
    { word: 'TRAFFIC', pos: 70 },
    { word: 'FIREWORKS', pos: 95 },
  ] },
  { left: 'WEAK', right: 'STRONG', clueBank: [
    { word: 'KITTEN', pos: 8 },
    { word: 'TODDLER', pos: 18 },
    { word: 'GORILLA', pos: 85 },
    { word: 'BULLDOZER', pos: 95 },
  ] },
  { left: 'SMALL', right: 'HUGE', clueBank: [
    { word: 'ANT', pos: 2 },
    { word: 'MOUSE', pos: 10 },
    { word: 'ELEPHANT', pos: 80 },
    { word: 'MOUNTAIN', pos: 96 },
  ] },
  { left: 'SLOW', right: 'FAST', clueBank: [
    { word: 'SNAIL', pos: 3 },
    { word: 'TORTOISE', pos: 8 },
    { word: 'BICYCLE', pos: 45 },
    { word: 'CHEETAH', pos: 92 },
  ] },
  { left: 'UGLY', right: 'BEAUTIFUL', clueBank: [
    { word: 'GARGOYLE', pos: 10 },
    { word: 'POTATO', pos: 35 },
    { word: 'RAINBOW', pos: 88 },
    { word: 'SUNSET', pos: 92 },
  ] },
  { left: 'EVIL', right: 'GOOD', clueBank: [
    { word: 'VILLAIN', pos: 5 },
    { word: 'PIRATE', pos: 30 },
    { word: 'LIBRARIAN', pos: 72 },
    { word: 'SAINT', pos: 97 },
  ] },
  { left: 'SAD', right: 'HAPPY', clueBank: [
    { word: 'FUNERAL', pos: 3 },
    { word: 'MONDAY', pos: 30 },
    { word: 'WEEKEND', pos: 75 },
    { word: 'BIRTHDAY', pos: 88 },
  ] },
  { left: 'OLD', right: 'NEW', clueBank: [
    { word: 'PYRAMID', pos: 3 },
    { word: 'VINYL', pos: 30 },
    { word: 'SMARTPHONE', pos: 85 },
    { word: 'BABY', pos: 95 },
  ] },
  { left: 'DARK', right: 'BRIGHT', clueBank: [
    { word: 'CAVE', pos: 3 },
    { word: 'MOONLIGHT', pos: 25 },
    { word: 'CANDLE', pos: 40 },
    { word: 'SUN', pos: 98 },
  ] },
  { left: 'COMMON', right: 'RARE', clueBank: [
    { word: 'PIGEON', pos: 5 },
    { word: 'PENNY', pos: 8 },
    { word: 'DIAMOND', pos: 80 },
    { word: 'UNICORN', pos: 99 },
  ] },
  { left: 'SOFT', right: 'HARD', clueBank: [
    { word: 'MARSHMALLOW', pos: 3 },
    { word: 'PILLOW', pos: 5 },
    { word: 'BREAD', pos: 25 },
    { word: 'DIAMOND', pos: 98 },
  ] },
  { left: 'USELESS', right: 'USEFUL', clueBank: [
    { word: 'RECEIPT', pos: 15 },
    { word: 'TROPHY', pos: 35 },
    { word: 'SCISSORS', pos: 85 },
    { word: 'PHONE', pos: 92 },
  ] },
  { left: 'SIMPLE', right: 'COMPLEX', clueBank: [
    { word: 'SPOON', pos: 5 },
    { word: 'BICYCLE', pos: 40 },
    { word: 'CHESS', pos: 75 },
    { word: 'BRAIN', pos: 97 },
  ] },
  { left: 'SAFE', right: 'DANGEROUS', clueBank: [
    { word: 'BLANKET', pos: 5 },
    { word: 'LADDER', pos: 45 },
    { word: 'MOTORCYCLE', pos: 75 },
    { word: 'VOLCANO', pos: 95 },
  ] },
  { left: 'CASUAL', right: 'FORMAL', clueBank: [
    { word: 'PAJAMAS', pos: 3 },
    { word: 'JEANS', pos: 20 },
    { word: 'BLAZER', pos: 70 },
    { word: 'TUXEDO', pos: 95 },
  ] },
  { left: 'EMPTY', right: 'FULL', clueBank: [
    { word: 'VACUUM', pos: 3 },
    { word: 'DESERT', pos: 15 },
    { word: 'SUBWAY', pos: 80 },
    { word: 'STADIUM', pos: 90 },
  ] },
  { left: 'DIRTY', right: 'CLEAN', clueBank: [
    { word: 'SWAMP', pos: 3 },
    { word: 'SOCKS', pos: 20 },
    { word: 'KITCHEN', pos: 50 },
    { word: 'HOSPITAL', pos: 90 },
  ] },
  { left: 'TEMPORARY', right: 'PERMANENT', clueBank: [
    { word: 'SNOWFLAKE', pos: 3 },
    { word: 'HAIRCUT', pos: 30 },
    { word: 'TATTOO', pos: 90 },
    { word: 'PYRAMID', pos: 96 },
  ] },
  { left: 'UNDERRATED', right: 'OVERRATED', clueBank: [
    { word: 'SLEEP', pos: 10 },
    { word: 'TEA', pos: 30 },
    { word: 'BRUNCH', pos: 80 },
    { word: 'SELFIES', pos: 90 },
  ] },
  { left: 'GUILTY PLEASURE', right: 'OPENLY LOVED', clueBank: [
    { word: 'GOSSIP', pos: 10 },
    { word: 'KARAOKE', pos: 35 },
    { word: 'PIZZA', pos: 85 },
    { word: 'PUPPIES', pos: 97 },
  ] },
  { left: 'FORGETTABLE', right: 'ICONIC', clueBank: [
    { word: 'STAPLER', pos: 10 },
    { word: 'TOAST', pos: 25 },
    { word: 'MOONWALK', pos: 90 },
    { word: 'EIFFEL', pos: 95 },
  ] },
  { left: 'INTROVERT', right: 'EXTROVERT', clueBank: [
    { word: 'HERMIT', pos: 3 },
    { word: 'BOOKWORM', pos: 12 },
    { word: 'COMEDIAN', pos: 80 },
    { word: 'CHEERLEADER', pos: 90 },
  ] },
  { left: 'SOUR', right: 'SWEET', clueBank: [
    { word: 'LEMON', pos: 3 },
    { word: 'GRAPEFRUIT', pos: 30 },
    { word: 'APPLE', pos: 60 },
    { word: 'CANDY', pos: 97 },
  ] },
  { left: 'MESSY', right: 'TIDY', clueBank: [
    { word: 'TORNADO', pos: 2 },
    { word: 'TEENAGER', pos: 15 },
    { word: 'LIBRARY', pos: 80 },
    { word: 'MUSEUM', pos: 90 },
  ] },
  { left: 'LAZY', right: 'HARD-WORKING', clueBank: [
    { word: 'SLOTH', pos: 3 },
    { word: 'CAT', pos: 15 },
    { word: 'BEAVER', pos: 88 },
    { word: 'ANT', pos: 92 },
  ] },
  { left: 'SERIOUS', right: 'SILLY', clueBank: [
    { word: 'FUNERAL', pos: 3 },
    { word: 'COURTROOM', pos: 5 },
    { word: 'PICNIC', pos: 60 },
    { word: 'CLOWN', pos: 97 },
  ] },
  { left: 'FICTION', right: 'NON-FICTION', clueBank: [
    { word: 'UNICORN', pos: 2 },
    { word: 'LEGEND', pos: 25 },
    { word: 'MEMOIR', pos: 85 },
    { word: 'DICTIONARY', pos: 99 },
  ] },
  { left: 'BASIC', right: 'FANCY', clueBank: [
    { word: 'TOAST', pos: 8 },
    { word: 'SANDWICH', pos: 25 },
    { word: 'SUSHI', pos: 70 },
    { word: 'CAVIAR', pos: 97 },
  ] },
  { left: 'LOW TECH', right: 'HIGH TECH', clueBank: [
    { word: 'PENCIL', pos: 3 },
    { word: 'ABACUS', pos: 5 },
    { word: 'TYPEWRITER', pos: 35 },
    { word: 'ROBOT', pos: 93 },
  ] },
  { left: 'HEALTHY', right: 'UNHEALTHY', clueBank: [
    { word: 'SALAD', pos: 6 },
    { word: 'SANDWICH', pos: 45 },
    { word: 'DOUGHNUT', pos: 92 },
  ] },
  { left: 'SMELLS BAD', right: 'SMELLS GOOD', clueBank: [
    { word: 'SKUNK', pos: 2 },
    { word: 'WATER', pos: 50 },
    { word: 'BAKERY', pos: 95 },
  ] },
  { left: 'EASY TO SPELL', right: 'HARD TO SPELL', clueBank: [
    { word: 'CAT', pos: 3 },
    { word: 'NECESSARY', pos: 60 },
    { word: 'ONOMATOPOEIA', pos: 96 },
  ] },
  { left: 'BAD HABIT', right: 'GOOD HABIT', clueBank: [
    { word: 'SMOKING', pos: 3 },
    { word: 'NAILBITING', pos: 10 },
    { word: 'SNACKING', pos: 40 },
    { word: 'FLOSSING', pos: 92 },
  ] },
  { left: 'SKILL', right: 'LUCK', clueBank: [
    { word: 'CHESS', pos: 5 },
    { word: 'POKER', pos: 50 },
    { word: 'LOTTERY', pos: 97 },
  ] },
  { left: 'ROUND', right: 'POINTY', clueBank: [
    { word: 'BALL', pos: 2 },
    { word: 'APPLE', pos: 8 },
    { word: 'PEAR', pos: 30 },
    { word: 'NEEDLE', pos: 98 },
  ] },
  { left: 'WET', right: 'DRY', clueBank: [
    { word: 'OCEAN', pos: 1 },
    { word: 'SPONGE', pos: 30 },
    { word: 'CRACKER', pos: 90 },
    { word: 'DESERT', pos: 97 },
  ] },
  { left: 'FLEXIBLE', right: 'RIGID', clueBank: [
    { word: 'GYMNAST', pos: 3 },
    { word: 'RUBBER', pos: 5 },
    { word: 'PENCIL', pos: 80 },
    { word: 'STEEL', pos: 95 },
  ] },
  { left: 'SMOOTH', right: 'ROUGH', clueBank: [
    { word: 'SILK', pos: 3 },
    { word: 'GLASS', pos: 5 },
    { word: 'BARK', pos: 80 },
    { word: 'SANDPAPER', pos: 95 },
  ] },
  { left: 'LIGHT', right: 'HEAVY', clueBank: [
    { word: 'FEATHER', pos: 2 },
    { word: 'BALLOON', pos: 3 },
    { word: 'BRICK', pos: 70 },
    { word: 'ANVIL', pos: 95 },
  ] },
  { left: 'RELAXING', right: 'STRESSFUL', clueBank: [
    { word: 'HAMMOCK', pos: 3 },
    { word: 'BATH', pos: 8 },
    { word: 'WEDDING', pos: 65 },
    { word: 'DEADLINE', pos: 92 },
  ] },
  { left: 'UNDERPAID', right: 'OVERPAID', clueBank: [
    { word: 'TEACHER', pos: 10 },
    { word: 'ACCOUNTANT', pos: 50 },
    { word: 'CELEBRITY', pos: 94 },
  ] },
  { left: 'BAD FOR YOU', right: 'GOOD FOR YOU', clueBank: [
    { word: 'CIGARETTES', pos: 2 },
    { word: 'COFFEE', pos: 50 },
    { word: 'VEGETABLES', pos: 94 },
  ] },
  { left: 'HISTORICAL', right: 'FUTURISTIC', clueBank: [
    { word: 'PYRAMIDS', pos: 4 },
    { word: 'SMARTPHONE', pos: 60 },
    { word: 'JETPACK', pos: 96 },
  ] },
  { left: 'NORMAL PET', right: 'WEIRD PET', clueBank: [
    { word: 'DOG', pos: 3 },
    { word: 'PARROT', pos: 45 },
    { word: 'TARANTULA', pos: 92 },
  ] },
  { left: 'MILD', right: 'SPICY', clueBank: [
    { word: 'RICE', pos: 3 },
    { word: 'KETCHUP', pos: 10 },
    { word: 'SALSA', pos: 60 },
    { word: 'HABANERO', pos: 97 },
  ] },
  { left: 'CALM', right: 'CHAOTIC', clueBank: [
    { word: 'MEDITATION', pos: 3 },
    { word: 'LIBRARY', pos: 10 },
    { word: 'AIRPORT', pos: 70 },
    { word: 'BATTLEFIELD', pos: 97 },
  ] },
  { left: 'NOT SCARY', right: 'SCARY', clueBank: [
    { word: 'KITTEN', pos: 3 },
    { word: 'DENTIST', pos: 50 },
    { word: 'VAMPIRE', pos: 92 },
  ] },
  { left: 'PRIVATE', right: 'PUBLIC', clueBank: [
    { word: 'DIARY', pos: 3 },
    { word: 'POSTCARD', pos: 50 },
    { word: 'BILLBOARD', pos: 96 },
  ] },
  { left: 'INDOOR', right: 'OUTDOOR', clueBank: [
    { word: 'BOWLING', pos: 5 },
    { word: 'CHESS', pos: 8 },
    { word: 'TENNIS', pos: 60 },
    { word: 'CAMPING', pos: 97 },
  ] },
  { left: 'FRAGILE', right: 'DURABLE', clueBank: [
    { word: 'BUBBLE', pos: 2 },
    { word: 'MUG', pos: 45 },
    { word: 'ANVIL', pos: 97 },
  ] },
  { left: 'NATURAL', right: 'ARTIFICIAL', clueBank: [
    { word: 'FOREST', pos: 3 },
    { word: 'HONEY', pos: 10 },
    { word: 'CHEESE', pos: 40 },
    { word: 'PLASTIC', pos: 92 },
  ] },
  { left: 'CHILDISH', right: 'MATURE', clueBank: [
    { word: 'TANTRUM', pos: 3 },
    { word: 'CARTOON', pos: 15 },
    { word: 'CROSSWORD', pos: 70 },
    { word: 'MORTGAGE', pos: 95 },
  ] },
  { left: 'RUDE', right: 'POLITE', clueBank: [
    { word: 'BURPING', pos: 4 },
    { word: 'INTERRUPTING', pos: 25 },
    { word: 'HANDSHAKE', pos: 75 },
    { word: 'BUTLER', pos: 95 },
  ] },
  { left: 'WORST TOPPING', right: 'BEST TOPPING', clueBank: [
    { word: 'ANCHOVIES', pos: 15 },
    { word: 'PINEAPPLE', pos: 45 },
    { word: 'PEPPERONI', pos: 90 },
  ] },
  { left: 'HATED', right: 'LOVED', clueBank: [
    { word: 'TRAFFIC', pos: 3 },
    { word: 'BROCCOLI', pos: 45 },
    { word: 'PUPPIES', pos: 96 },
  ] },
  { left: 'UNPOPULAR', right: 'POPULAR', clueBank: [
    { word: 'FAX', pos: 5 },
    { word: 'CROSSWORDS', pos: 45 },
    { word: 'PIZZA', pos: 95 },
  ] },
  { left: 'HARD TO FIND', right: 'EASY TO FIND', clueBank: [
    { word: 'UNICORN', pos: 2 },
    { word: 'PARKING', pos: 35 },
    { word: 'SAND', pos: 97 },
  ] },
  { left: 'BAD GIFT', right: 'GOOD GIFT', clueBank: [
    { word: 'TISSUE', pos: 2 },
    { word: 'SOCKS', pos: 40 },
    { word: 'TICKETS', pos: 92 },
  ] },
  { left: 'WORKDAY VIBE', right: 'WEEKEND VIBE', clueBank: [
    { word: 'MONDAY', pos: 2 },
    { word: 'FRIDAY', pos: 65 },
    { word: 'BRUNCH', pos: 96 },
  ] },
  { left: 'SUMMER', right: 'WINTER', clueBank: [
    { word: 'BEACH', pos: 3 },
    { word: 'LEMONADE', pos: 8 },
    { word: 'PUMPKIN', pos: 60 },
    { word: 'MITTENS', pos: 95 },
  ] },
  { left: 'MORNING', right: 'NIGHT', clueBank: [
    { word: 'SUNRISE', pos: 3 },
    { word: 'BREAKFAST', pos: 8 },
    { word: 'LUNCH', pos: 45 },
    { word: 'MOON', pos: 97 },
  ] },
  { left: 'TINY PROBLEM', right: 'HUGE PROBLEM', clueBank: [
    { word: 'PAPERCUT', pos: 3 },
    { word: 'PUNCTURE', pos: 45 },
    { word: 'ASTEROID', pos: 98 },
  ] },
  { left: 'HARMLESS', right: 'DEADLY', clueBank: [
    { word: 'BUTTERFLY', pos: 3 },
    { word: 'HAMSTER', pos: 5 },
    { word: 'BEE', pos: 40 },
    { word: 'COBRA', pos: 92 },
  ] },
  { left: 'UNKNOWN', right: 'FAMOUS', clueBank: [
    { word: 'STRANGER', pos: 3 },
    { word: 'NEIGHBOR', pos: 20 },
    { word: 'MAYOR', pos: 50 },
    { word: 'POPSTAR', pos: 92 },
  ] },
  { left: 'REAL', right: 'IMAGINARY', clueBank: [
    { word: 'PLATYPUS', pos: 5 },
    { word: 'BIGFOOT', pos: 60 },
    { word: 'DRAGON', pos: 97 },
  ] },
  { left: 'GENIUS IDEA', right: 'TERRIBLE IDEA', clueBank: [
    { word: 'SEATBELT', pos: 3 },
    { word: 'PINEAPPLE', pos: 50 },
    { word: 'LITTERING', pos: 92 },
  ] },
  { left: 'FAST FOOD', right: 'SLOW FOOD', clueBank: [
    { word: 'MICROWAVE', pos: 3 },
    { word: 'STIR-FRY', pos: 35 },
    { word: 'BRISKET', pos: 94 },
  ] },
  { left: 'BAD SUPERPOWER', right: 'GREAT SUPERPOWER', clueBank: [
    { word: 'SNEEZING', pos: 8 },
    { word: 'INVISIBILITY', pos: 70 },
    { word: 'TELEPORTATION', pos: 95 },
  ] },
  { left: 'OVERPRICED', right: 'BARGAIN', clueBank: [
    { word: 'AIRPORT', pos: 3 },
    { word: 'CINEMA', pos: 40 },
    { word: 'LIBRARY', pos: 97 },
  ] },
  { left: 'ROMANTIC', right: 'UNROMANTIC', clueBank: [
    { word: 'CANDLELIGHT', pos: 4 },
    { word: 'MOVIES', pos: 35 },
    { word: 'TAXES', pos: 97 },
  ] },
  { left: 'LOW EFFORT', right: 'HIGH EFFORT', clueBank: [
    { word: 'MICROWAVE', pos: 4 },
    { word: 'FLAT-PACK', pos: 55 },
    { word: 'WEDDING', pos: 95 },
  ] },
  { left: 'SHORT-LIVED', right: 'LONG-LIVED', clueBank: [
    { word: 'MAYFLY', pos: 2 },
    { word: 'DOG', pos: 40 },
    { word: 'TORTOISE', pos: 95 },
  ] },
  { left: 'BLAND', right: 'FLAVORFUL', clueBank: [
    { word: 'TOFU', pos: 8 },
    { word: 'SOUP', pos: 50 },
    { word: 'CURRY', pos: 94 },
  ] },
  { left: 'DAY JOB', right: 'DREAM JOB', clueBank: [
    { word: 'SPREADSHEETS', pos: 5 },
    { word: 'CHEF', pos: 55 },
    { word: 'ASTRONAUT', pos: 94 },
  ] },
  { left: 'EASY JOB', right: 'HARD JOB', clueBank: [
    { word: 'MASCOT', pos: 15 },
    { word: 'CASHIER', pos: 45 },
    { word: 'SURGEON', pos: 97 },
  ] },
  { left: 'UNDERDRESSED', right: 'OVERDRESSED', clueBank: [
    { word: 'PAJAMAS', pos: 4 },
    { word: 'JEANS', pos: 30 },
    { word: 'TUXEDO', pos: 97 },
  ] },
  { left: 'RELAXING SOUND', right: 'ANNOYING SOUND', clueBank: [
    { word: 'RAIN', pos: 4 },
    { word: 'TICKING', pos: 50 },
    { word: 'ALARM', pos: 96 },
  ] },
  { left: 'LONER ANIMAL', right: 'PACK ANIMAL', clueBank: [
    { word: 'OCTOPUS', pos: 5 },
    { word: 'CAT', pos: 35 },
    { word: 'WOLF', pos: 90 },
  ] },
  { left: 'SHORT', right: 'TALL', clueBank: [
    { word: 'MOUSE', pos: 3 },
    { word: 'TODDLER', pos: 15 },
    { word: 'GIRAFFE', pos: 90 },
    { word: 'SKYSCRAPER', pos: 98 },
  ] },
  { left: 'NEAR', right: 'FAR', clueBank: [
    { word: 'NEIGHBOR', pos: 3 },
    { word: 'COMMUTE', pos: 35 },
    { word: 'MOON', pos: 97 },
  ] },
  { left: 'MAINSTREAM', right: 'NICHE', clueBank: [
    { word: 'POP', pos: 3 },
    { word: 'JAZZ', pos: 55 },
    { word: 'POLKA', pos: 94 },
  ] },
  { left: 'NORMAL COMBO', right: 'WEIRD COMBO', clueBank: [
    { word: 'PEANUT-BUTTER-JELLY', pos: 3 },
    { word: 'FRIES-IN-MILKSHAKE', pos: 55 },
    { word: 'PICKLES-AND-ICECREAM', pos: 95 },
  ] },
  { left: 'FLAT', right: 'MOUNTAINOUS', clueBank: [
    { word: 'PRAIRIE', pos: 3 },
    { word: 'HILLS', pos: 45 },
    { word: 'HIMALAYAS', pos: 97 },
  ] },
  { left: 'RAW', right: 'BURNT', clueBank: [
    { word: 'SUSHI', pos: 3 },
    { word: 'STEAK', pos: 45 },
    { word: 'CHARCOAL', pos: 96 },
  ] },
  { left: 'BAD INVENTION', right: 'GOOD INVENTION', clueBank: [
    { word: 'SPORK', pos: 20 },
    { word: 'MICROWAVE', pos: 70 },
    { word: 'WHEEL', pos: 97 },
  ] },
  { left: 'FOLLOWER', right: 'LEADER', clueBank: [
    { word: 'SHEEP', pos: 4 },
    { word: 'DEPUTY', pos: 55 },
    { word: 'GENERAL', pos: 94 },
  ] },
  { left: 'TRADITIONAL', right: 'MODERN', clueBank: [
    { word: 'QUILL', pos: 4 },
    { word: 'EMAIL', pos: 55 },
    { word: 'HOLOGRAM', pos: 95 },
  ] },
  { left: 'RURAL', right: 'URBAN', clueBank: [
    { word: 'FARM', pos: 3 },
    { word: 'VILLAGE', pos: 20 },
    { word: 'SUBURB', pos: 55 },
    { word: 'SKYSCRAPER', pos: 95 },
  ] },
  { left: 'PLAIN', right: 'COLORFUL', clueBank: [
    { word: 'CARDBOARD', pos: 5 },
    { word: 'DENIM', pos: 35 },
    { word: 'RAINBOW', pos: 97 },
  ] },
  { left: 'STRAIGHT', right: 'CURVY', clueBank: [
    { word: 'RULER', pos: 2 },
    { word: 'RIVER', pos: 60 },
    { word: 'SPIRAL', pos: 95 },
  ] },
  { left: 'DULL', right: 'SHARP', clueBank: [
    { word: 'BALLOON', pos: 3 },
    { word: 'PENCIL', pos: 55 },
    { word: 'KATANA', pos: 97 },
  ] },
  { left: 'OLD-FASHIONED', right: 'TRENDY', clueBank: [
    { word: 'SUSPENDERS', pos: 10 },
    { word: 'SNEAKERS', pos: 60 },
    { word: 'MEME', pos: 94 },
  ] },
  { left: 'FORGIVABLE', right: 'UNFORGIVABLE', clueBank: [
    { word: 'SNEEZING', pos: 3 },
    { word: 'SPOILERS', pos: 60 },
    { word: 'BETRAYAL', pos: 97 },
  ] },
  { left: 'SNACK', right: 'MEAL', clueBank: [
    { word: 'PRETZEL', pos: 3 },
    { word: 'SOUP', pos: 50 },
    { word: 'BANQUET', pos: 97 },
  ] },
  { left: 'BEST CHORE', right: 'WORST CHORE', clueBank: [
    { word: 'WATERING', pos: 5 },
    { word: 'VACUUMING', pos: 45 },
    { word: 'UNCLOGGING', pos: 97 },
  ] },
  { left: 'PLANNED', right: 'SPONTANEOUS', clueBank: [
    { word: 'WEDDING', pos: 3 },
    { word: 'ROADTRIP', pos: 50 },
    { word: 'KARAOKE', pos: 90 },
  ] },
  { left: 'EASY TO COOK', right: 'HARD TO COOK', clueBank: [
    { word: 'TOAST', pos: 3 },
    { word: 'LASAGNA', pos: 55 },
    { word: 'SOUFFLE', pos: 95 },
  ] },
  { left: 'FOR KIDS', right: 'FOR ADULTS', clueBank: [
    { word: 'CARTOONS', pos: 3 },
    { word: 'CHESS', pos: 50 },
    { word: 'MORTGAGE', pos: 97 },
  ] },
  { left: 'HOMEBODY', right: 'GLOBETROTTER', clueBank: [
    { word: 'HOUSEPLANT', pos: 3 },
    { word: 'COMMUTER', pos: 45 },
    { word: 'PILOT', pos: 95 },
  ] },
  { left: 'TASTES BAD', right: 'TASTES GOOD', clueBank: [
    { word: 'MEDICINE', pos: 4 },
    { word: 'LEFTOVERS', pos: 35 },
    { word: 'CHOCOLATE', pos: 96 },
  ] },
  { left: 'NOT ADDICTIVE', right: 'ADDICTIVE', clueBank: [
    { word: 'SPINACH', pos: 3 },
    { word: 'CROSSWORDS', pos: 45 },
    { word: 'CHIPS', pos: 92 },
  ] },
  { left: 'EASY TO LEARN', right: 'HARD TO LEARN', clueBank: [
    { word: 'TIC-TAC-TOE', pos: 2 },
    { word: 'GUITAR', pos: 60 },
    { word: 'MANDARIN', pos: 94 },
  ] },
  { left: 'UNLUCKY', right: 'LUCKY', clueBank: [
    { word: 'LADDER', pos: 5 },
    { word: 'PENNY', pos: 60 },
    { word: 'CLOVER', pos: 95 },
  ] },
  { left: 'SHY', right: 'BOLD', clueBank: [
    { word: 'TURTLE', pos: 4 },
    { word: 'CAT', pos: 40 },
    { word: 'BADGER', pos: 96 },
  ] },
  { left: 'FLAT', right: 'FIZZY', clueBank: [
    { word: 'MILK', pos: 3 },
    { word: 'KOMBUCHA', pos: 50 },
    { word: 'CHAMPAGNE', pos: 95 },
  ] },
  { left: 'BAD ADVICE', right: 'GOOD ADVICE', clueBank: [
    { word: 'GAMBLING', pos: 5 },
    { word: 'SNACKING', pos: 40 },
    { word: 'SUNSCREEN', pos: 96 },
  ] },
  { left: 'UNDERGROUND', right: 'SKY HIGH', clueBank: [
    { word: 'SUBWAY', pos: 3 },
    { word: 'TREEHOUSE', pos: 45 },
    { word: 'AIRPLANE', pos: 95 },
  ] },
  { left: 'MINIMALIST', right: 'MAXIMALIST', clueBank: [
    { word: 'ZEN', pos: 5 },
    { word: 'SCANDINAVIAN', pos: 30 },
    { word: 'CASINO', pos: 96 },
  ] },
  { left: 'ORDINARY', right: 'MAGICAL', clueBank: [
    { word: 'STAPLER', pos: 3 },
    { word: 'AURORA', pos: 75 },
    { word: 'WIZARD', pos: 97 },
  ] },
  { left: 'OFF-KEY', right: 'PITCH-PERFECT', clueBank: [
    { word: 'SHOWER', pos: 10 },
    { word: 'KARAOKE', pos: 40 },
    { word: 'OPERA', pos: 96 },
  ] },
  { left: 'MATTE', right: 'SPARKLY', clueBank: [
    { word: 'GRAVEL', pos: 3 },
    { word: 'SILVERWARE', pos: 55 },
    { word: 'GLITTER', pos: 97 },
  ] },
  { left: 'BAD FIRST DATE', right: 'GOOD FIRST DATE', clueBank: [
    { word: 'DENTIST', pos: 3 },
    { word: 'COFFEE', pos: 55 },
    { word: 'PICNIC', pos: 94 },
  ] },
  { left: 'QUICK READ', right: 'LONG READ', clueBank: [
    { word: 'TEXT', pos: 2 },
    { word: 'MAGAZINE', pos: 30 },
    { word: 'ENCYCLOPEDIA', pos: 97 },
  ] },
  { left: 'CRUNCHY', right: 'MUSHY', clueBank: [
    { word: 'CELERY', pos: 3 },
    { word: 'PASTA', pos: 55 },
    { word: 'OATMEAL', pos: 96 },
  ] },
  { left: 'LOW MAINTENANCE', right: 'HIGH MAINTENANCE', clueBank: [
    { word: 'CACTUS', pos: 3 },
    { word: 'DOG', pos: 55 },
    { word: 'POOL', pos: 90 },
  ] },
  { left: 'STINGY', right: 'GENEROUS', clueBank: [
    { word: 'SCROOGE', pos: 3 },
    { word: 'GRANDMA', pos: 80 },
    { word: 'SANTA', pos: 97 },
  ] },
  { left: 'HONEST', right: 'SNEAKY', clueBank: [
    { word: 'SCOUT', pos: 5 },
    { word: 'POKER', pos: 60 },
    { word: 'BURGLAR', pos: 96 },
  ] },
  { left: 'AWKWARD', right: 'SMOOTH', clueBank: [
    { word: 'PUBERTY', pos: 5 },
    { word: 'SMALLTALK', pos: 45 },
    { word: 'DIPLOMAT', pos: 90 },
  ] },
  { left: 'NARROW', right: 'WIDE', clueBank: [
    { word: 'NEEDLE', pos: 3 },
    { word: 'HALLWAY', pos: 20 },
    { word: 'HIGHWAY', pos: 70 },
    { word: 'OCEAN', pos: 97 },
  ] },
  { left: 'SHALLOW', right: 'DEEP', clueBank: [
    { word: 'PUDDLE', pos: 3 },
    { word: 'BATHTUB', pos: 12 },
    { word: 'WELL', pos: 70 },
    { word: 'TRENCH', pos: 99 },
  ] },
  { left: 'CUTE', right: 'SCARY', clueBank: [
    { word: 'PUPPY', pos: 3 },
    { word: 'KOALA', pos: 8 },
    { word: 'CLOWN', pos: 60 },
    { word: 'ZOMBIE', pos: 95 },
  ] },
  { left: 'SOLID', right: 'LIQUID', clueBank: [
    { word: 'ROCK', pos: 2 },
    { word: 'CHEESE', pos: 20 },
    { word: 'JELLY', pos: 50 },
    { word: 'WATER', pos: 98 },
  ] },
  { left: 'EASY', right: 'DIFFICULT', clueBank: [
    { word: 'BREATHING', pos: 2 },
    { word: 'ORIGAMI', pos: 55 },
    { word: 'CALCULUS', pos: 90 },
    { word: 'SURGERY', pos: 95 },
  ] },
  { left: 'DULL', right: 'SHINY', clueBank: [
    { word: 'CARDBOARD', pos: 5 },
    { word: 'CONCRETE', pos: 8 },
    { word: 'COIN', pos: 75 },
    { word: 'MIRROR', pos: 95 },
  ] },
  { left: 'SLIPPERY', right: 'STICKY', clueBank: [
    { word: 'ICE', pos: 3 },
    { word: 'SOAP', pos: 5 },
    { word: 'HONEY', pos: 88 },
    { word: 'GLUE', pos: 97 },
  ] },
  { left: 'ORDINARY', right: 'WEIRD', clueBank: [
    { word: 'SPOON', pos: 3 },
    { word: 'TOAST', pos: 5 },
    { word: 'UNICYCLE', pos: 70 },
    { word: 'PLATYPUS', pos: 88 },
  ] },
]
