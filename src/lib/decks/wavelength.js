// Spectrum pairs for WAVELENGTH. Each pair anchors the two ends of a 0–100 dial:
// `left` lives at 0, `right` lives at 100. The clue-giver picks a hidden target
// somewhere along it and gives a one-word clue; everyone else guesses where.
//
// `clueBank` — used by solo/bot play: each entry is a real-world thing/concept a
// clue-giver would plausibly say (not a bare synonym of `left`/`right`) paired with
// where it actually sits on the dial (`pos`, 0–100).
//
// Rooms store a `spectrumIndex` into this array, so new pairs are appended and
// existing ones are never reordered or removed (see docs/content-policy.md).
export const WAVELENGTH_PAIRS = [
  { left: 'COLD', right: 'HOT', clueBank: [
    { word: 'ICEBERG', pos: 4 },
    { word: 'LUKEWARM TEA', pos: 50 },
    { word: 'SAUNA', pos: 88 },
  ] },
  { left: 'CHEAP', right: 'EXPENSIVE', clueBank: [
    { word: 'DOLLAR STORE', pos: 6 },
    { word: 'USED CAR', pos: 45 },
    { word: 'PRIVATE JET', pos: 95 },
  ] },
  { left: 'BORING', right: 'EXCITING', clueBank: [
    { word: 'WAITING ROOM', pos: 5 },
    { word: 'MINI GOLF', pos: 45 },
    { word: 'ROLLER COASTER', pos: 92 },
  ] },
  { left: 'QUIET', right: 'LOUD', clueBank: [
    { word: 'LIBRARY', pos: 5 },
    { word: 'OFFICE CHATTER', pos: 45 },
    { word: 'ROCK CONCERT', pos: 95 },
  ] },
  { left: 'WEAK', right: 'STRONG', clueBank: [
    { word: 'PAPER STRAW', pos: 5 },
    { word: 'TODDLER', pos: 35 },
    { word: 'WEIGHTLIFTER', pos: 92 },
  ] },
  { left: 'SMALL', right: 'HUGE', clueBank: [
    { word: 'ANT', pos: 3 },
    { word: 'SHOEBOX', pos: 40 },
    { word: 'BLUE WHALE', pos: 90 },
  ] },
  { left: 'SLOW', right: 'FAST', clueBank: [
    { word: 'SNAIL', pos: 3 },
    { word: 'JOGGER', pos: 40 },
    { word: 'CHEETAH', pos: 93 },
  ] },
  { left: 'UGLY', right: 'BEAUTIFUL', clueBank: [
    { word: 'ROADKILL', pos: 4 },
    { word: 'PLAIN OFFICE BUILDING', pos: 48 },
    { word: 'SUNSET', pos: 93 },
  ] },
  { left: 'EVIL', right: 'GOOD', clueBank: [
    { word: 'SERIAL KILLER', pos: 3 },
    { word: 'WHITE LIE', pos: 45 },
    { word: 'PUPPY', pos: 95 },
  ] },
  { left: 'SAD', right: 'HAPPY', clueBank: [
    { word: 'FUNERAL', pos: 3 },
    { word: 'RAINY MONDAY', pos: 40 },
    { word: 'BIRTHDAY PARTY', pos: 92 },
  ] },
  { left: 'OLD', right: 'NEW', clueBank: [
    { word: 'CAVE PAINTING', pos: 4 },
    { word: 'HAND-ME-DOWN COUCH', pos: 42 },
    { word: 'LATEST IPHONE', pos: 95 },
  ] },
  { left: 'DARK', right: 'BRIGHT', clueBank: [
    { word: 'MOONLESS NIGHT', pos: 3 },
    { word: 'OVERCAST SKY', pos: 45 },
    { word: 'NOON DESERT', pos: 93 },
  ] },
  { left: 'COMMON', right: 'RARE', clueBank: [
    { word: 'HOUSE SPARROW', pos: 5 },
    { word: 'VINTAGE COIN', pos: 45 },
    { word: 'BLUE DIAMOND', pos: 93 },
  ] },
  { left: 'SOFT', right: 'HARD', clueBank: [
    { word: 'PILLOW', pos: 4 },
    { word: 'LEATHER SHOE', pos: 42 },
    { word: 'DIAMOND', pos: 93 },
  ] },
  { left: 'USELESS', right: 'USEFUL', clueBank: [
    { word: 'BROKEN UMBRELLA', pos: 4 },
    { word: 'SPARE BUTTON', pos: 42 },
    { word: 'SWISS ARMY KNIFE', pos: 92 },
  ] },
  { left: 'SIMPLE', right: 'COMPLEX', clueBank: [
    { word: 'PAPER CLIP', pos: 4 },
    { word: 'IKEA MANUAL', pos: 42 },
    { word: 'TAX CODE', pos: 92 },
  ] },
  { left: 'SAFE', right: 'DANGEROUS', clueBank: [
    { word: 'BUBBLE WRAP', pos: 4 },
    { word: 'LADDER CLIMB', pos: 45 },
    { word: 'SKYDIVING', pos: 92 },
  ] },
  { left: 'CASUAL', right: 'FORMAL', clueBank: [
    { word: 'PAJAMAS', pos: 4 },
    { word: 'OFFICE FRIDAY', pos: 45 },
    { word: 'TUXEDO', pos: 93 },
  ] },
  { left: 'EMPTY', right: 'FULL', clueBank: [
    { word: 'GHOST TOWN', pos: 4 },
    { word: 'HALF-EATEN PIZZA', pos: 45 },
    { word: 'PACKED STADIUM', pos: 93 },
  ] },
  { left: 'DIRTY', right: 'CLEAN', clueBank: [
    { word: 'GARBAGE DUMP', pos: 4 },
    { word: 'USED GYM TOWEL', pos: 45 },
    { word: 'OPERATING ROOM', pos: 93 },
  ] },
  { left: 'TEMPORARY', right: 'PERMANENT', clueBank: [
    { word: 'STICKY NOTE', pos: 4 },
    { word: 'SUMMER JOB', pos: 42 },
    { word: 'TATTOO', pos: 92 },
  ] },
  { left: 'UNDERRATED', right: 'OVERRATED', clueBank: [
    { word: 'B-SIDE TRACK', pos: 5 },
    { word: 'INDIE FILM', pos: 42 },
    { word: 'PUMPKIN SPICE LATTE', pos: 92 },
  ] },
  { left: 'GUILTY PLEASURE', right: 'OPENLY LOVED', clueBank: [
    { word: 'REALITY TV', pos: 5 },
    { word: 'ROM-COM', pos: 42 },
    { word: 'OSCAR WINNER', pos: 92 },
  ] },
  { left: 'FORGETTABLE', right: 'ICONIC', clueBank: [
    { word: 'GENERIC JINGLE', pos: 4 },
    { word: 'ONE-HIT WONDER', pos: 42 },
    { word: 'MONA LISA', pos: 93 },
  ] },
  { left: 'INTROVERT', right: 'EXTROVERT', clueBank: [
    { word: 'SOLO HIKER', pos: 4 },
    { word: 'OFFICE COWORKER', pos: 42 },
    { word: 'PARTY HOST', pos: 93 },
  ] },
  { left: 'SOUR', right: 'SWEET', clueBank: [
    { word: 'LEMON', pos: 3 },
    { word: 'GRANNY SMITH APPLE', pos: 40 },
    { word: 'COTTON CANDY', pos: 93 },
  ] },
  { left: 'MESSY', right: 'TIDY', clueBank: [
    { word: "TEENAGER'S BEDROOM", pos: 4 },
    { word: 'JUNK DRAWER', pos: 42 },
    { word: 'MILITARY BARRACKS', pos: 93 },
  ] },
  { left: 'LAZY', right: 'HARD-WORKING', clueBank: [
    { word: 'COUCH POTATO', pos: 4 },
    { word: 'SNOOZE BUTTON', pos: 40 },
    { word: 'WORKAHOLIC', pos: 93 },
  ] },
  { left: 'SERIOUS', right: 'SILLY', clueBank: [
    { word: 'COURT JUDGE', pos: 4 },
    { word: 'DAD JOKE', pos: 50 },
    { word: 'CLOWN', pos: 93 },
  ] },
  { left: 'FICTION', right: 'NON-FICTION', clueBank: [
    { word: 'FAIRY TALE', pos: 4 },
    { word: 'BIOPIC', pos: 45 },
    { word: 'TEXTBOOK', pos: 93 },
  ] },
  { left: 'BASIC', right: 'FANCY', clueBank: [
    { word: 'WHITE BREAD', pos: 4 },
    { word: 'CHAIN RESTAURANT', pos: 42 },
    { word: 'MICHELIN STAR MEAL', pos: 93 },
  ] },
  { left: 'LOW TECH', right: 'HIGH TECH', clueBank: [
    { word: 'ABACUS', pos: 3 },
    { word: 'FLIP PHONE', pos: 42 },
    { word: 'SPACE STATION', pos: 93 },
  ] },
  // v2 (2026-09): appended, never reordered — rooms store spectrumIndex.
  { left: 'HEALTHY', right: 'UNHEALTHY', clueBank: [
    { word: 'GARDEN SALAD', pos: 6 },
    { word: 'TURKEY SANDWICH', pos: 45 },
    { word: 'DEEP-FRIED BUTTER', pos: 96 },
  ] },
  { left: 'SMELLS BAD', right: 'SMELLS GOOD', clueBank: [
    { word: 'GYM SOCKS', pos: 3 },
    { word: 'PLAIN WATER', pos: 50 },
    { word: 'FRESH BREAD', pos: 95 },
  ] },
  { left: 'EASY TO SPELL', right: 'HARD TO SPELL', clueBank: [
    { word: 'CAT', pos: 3 },
    { word: 'NECESSARY', pos: 60 },
    { word: 'ONOMATOPOEIA', pos: 96 },
  ] },
  { left: 'BAD HABIT', right: 'GOOD HABIT', clueBank: [
    { word: 'NAIL BITING', pos: 6 },
    { word: 'HITTING SNOOZE', pos: 30 },
    { word: 'FLOSSING', pos: 94 },
  ] },
  { left: 'SKILL', right: 'LUCK', clueBank: [
    { word: 'CHESS', pos: 5 },
    { word: 'POKER', pos: 50 },
    { word: 'LOTTERY', pos: 97 },
  ] },
  { left: 'ROUND', right: 'POINTY', clueBank: [
    { word: 'BASKETBALL', pos: 3 },
    { word: 'PINE CONE', pos: 55 },
    { word: 'NEEDLE', pos: 97 },
  ] },
  { left: 'WET', right: 'DRY', clueBank: [
    { word: 'OCEAN', pos: 3 },
    { word: 'DAMP SPONGE', pos: 30 },
    { word: 'DESERT', pos: 96 },
  ] },
  { left: 'FLEXIBLE', right: 'RIGID', clueBank: [
    { word: 'GYMNAST', pos: 4 },
    { word: 'CARDBOARD', pos: 55 },
    { word: 'STEEL BEAM', pos: 95 },
  ] },
  { left: 'SMOOTH', right: 'ROUGH', clueBank: [
    { word: 'SILK', pos: 4 },
    { word: 'DENIM', pos: 45 },
    { word: 'SANDPAPER', pos: 95 },
  ] },
  { left: 'LIGHT', right: 'HEAVY', clueBank: [
    { word: 'FEATHER', pos: 2 },
    { word: 'BOWLING BALL', pos: 60 },
    { word: 'ELEPHANT', pos: 96 },
  ] },
  { left: 'RELAXING', right: 'STRESSFUL', clueBank: [
    { word: 'HAMMOCK', pos: 4 },
    { word: 'GROCERY SHOPPING', pos: 40 },
    { word: 'FINAL EXAM', pos: 94 },
  ] },
  { left: 'UNDERPAID', right: 'OVERPAID', clueBank: [
    { word: 'TEACHER', pos: 10 },
    { word: 'ACCOUNTANT', pos: 50 },
    { word: 'MOVIE STAR', pos: 94 },
  ] },
  { left: 'BAD FOR YOU', right: 'GOOD FOR YOU', clueBank: [
    { word: 'CIGARETTES', pos: 2 },
    { word: 'COFFEE', pos: 50 },
    { word: 'VEGETABLES', pos: 94 },
  ] },
  { left: 'HISTORICAL', right: 'FUTURISTIC', clueBank: [
    { word: 'PYRAMIDS', pos: 4 },
    { word: 'SMARTPHONE', pos: 60 },
    { word: 'FLYING CAR', pos: 96 },
  ] },
  { left: 'NORMAL PET', right: 'WEIRD PET', clueBank: [
    { word: 'DOG', pos: 3 },
    { word: 'PARROT', pos: 45 },
    { word: 'TARANTULA', pos: 92 },
  ] },
  { left: 'MILD', right: 'SPICY', clueBank: [
    { word: 'MILK', pos: 2 },
    { word: 'BLACK PEPPER', pos: 40 },
    { word: 'GHOST PEPPER', pos: 97 },
  ] },
  { left: 'CALM', right: 'CHAOTIC', clueBank: [
    { word: 'ZEN GARDEN', pos: 3 },
    { word: 'OFFICE PARTY', pos: 50 },
    { word: 'TODDLER BIRTHDAY', pos: 95 },
  ] },
  { left: 'NOT SCARY', right: 'SCARY', clueBank: [
    { word: 'KITTEN', pos: 3 },
    { word: 'DENTIST', pos: 50 },
    { word: 'HAUNTED HOUSE', pos: 92 },
  ] },
  { left: 'PRIVATE', right: 'PUBLIC', clueBank: [
    { word: 'DIARY', pos: 3 },
    { word: 'GROUP CHAT', pos: 50 },
    { word: 'BILLBOARD', pos: 96 },
  ] },
  { left: 'INDOOR', right: 'OUTDOOR', clueBank: [
    { word: 'BOARD GAME', pos: 4 },
    { word: 'TENNIS', pos: 60 },
    { word: 'MOUNTAIN CLIMBING', pos: 96 },
  ] },
  { left: 'FRAGILE', right: 'DURABLE', clueBank: [
    { word: 'SOAP BUBBLE', pos: 2 },
    { word: 'COFFEE MUG', pos: 45 },
    { word: 'ANVIL', pos: 97 },
  ] },
  { left: 'NATURAL', right: 'ARTIFICIAL', clueBank: [
    { word: 'WATERFALL', pos: 3 },
    { word: 'BONSAI TREE', pos: 45 },
    { word: 'PLASTIC FLOWER', pos: 95 },
  ] },
  { left: 'CHILDISH', right: 'MATURE', clueBank: [
    { word: 'HIDE AND SEEK', pos: 5 },
    { word: 'VIDEO GAMES', pos: 40 },
    { word: 'TAX RETURN', pos: 95 },
  ] },
  { left: 'RUDE', right: 'POLITE', clueBank: [
    { word: 'SLAMMING A DOOR', pos: 4 },
    { word: 'TEXTING AT DINNER', pos: 35 },
    { word: 'THANK-YOU NOTE', pos: 95 },
  ] },
  { left: 'WORST TOPPING', right: 'BEST TOPPING', clueBank: [
    { word: 'ANCHOVIES', pos: 15 },
    { word: 'PINEAPPLE', pos: 45 },
    { word: 'PEPPERONI', pos: 90 },
  ] },
  { left: 'HATED', right: 'LOVED', clueBank: [
    { word: 'TRAFFIC JAM', pos: 3 },
    { word: 'BROCCOLI', pos: 45 },
    { word: 'PUPPIES', pos: 96 },
  ] },
  { left: 'UNPOPULAR', right: 'POPULAR', clueBank: [
    { word: 'FAX MACHINE', pos: 5 },
    { word: 'CROSSWORDS', pos: 45 },
    { word: 'PIZZA', pos: 95 },
  ] },
  { left: 'HARD TO FIND', right: 'EASY TO FIND', clueBank: [
    { word: 'FOUR-LEAF CLOVER', pos: 4 },
    { word: 'PARKING SPOT', pos: 35 },
    { word: 'SAND AT THE BEACH', pos: 97 },
  ] },
  { left: 'BAD GIFT', right: 'GOOD GIFT', clueBank: [
    { word: 'USED TISSUE', pos: 2 },
    { word: 'SOCKS', pos: 40 },
    { word: 'CONCERT TICKETS', pos: 94 },
  ] },
  { left: 'WORKDAY VIBE', right: 'WEEKEND VIBE', clueBank: [
    { word: 'MONDAY MORNING', pos: 2 },
    { word: 'FRIDAY AFTERNOON', pos: 60 },
    { word: 'SATURDAY BRUNCH', pos: 96 },
  ] },
  { left: 'SUMMER', right: 'WINTER', clueBank: [
    { word: 'ICE POP', pos: 5 },
    { word: 'AUTUMN LEAVES', pos: 50 },
    { word: 'SNOWMAN', pos: 96 },
  ] },
  { left: 'MORNING', right: 'NIGHT', clueBank: [
    { word: 'SUNRISE JOG', pos: 3 },
    { word: 'LUNCH BREAK', pos: 45 },
    { word: 'MIDNIGHT SNACK', pos: 96 },
  ] },
  { left: 'TINY PROBLEM', right: 'HUGE PROBLEM', clueBank: [
    { word: 'PAPER CUT', pos: 3 },
    { word: 'FLAT TIRE', pos: 50 },
    { word: 'ASTEROID', pos: 98 },
  ] },
  { left: 'HARMLESS', right: 'DEADLY', clueBank: [
    { word: 'LADYBUG', pos: 2 },
    { word: 'BEE STING', pos: 40 },
    { word: 'GREAT WHITE SHARK', pos: 88 },
  ] },
  { left: 'UNKNOWN', right: 'FAMOUS', clueBank: [
    { word: 'YOUR NEIGHBOR', pos: 3 },
    { word: 'LOCAL WEATHERMAN', pos: 35 },
    { word: 'THE MONA LISA', pos: 97 },
  ] },
  { left: 'REAL', right: 'IMAGINARY', clueBank: [
    { word: 'PLATYPUS', pos: 5 },
    { word: 'BIGFOOT', pos: 60 },
    { word: 'DRAGON', pos: 97 },
  ] },
  { left: 'GENIUS IDEA', right: 'TERRIBLE IDEA', clueBank: [
    { word: 'SEATBELT', pos: 3 },
    { word: 'PINEAPPLE PIZZA', pos: 50 },
    { word: 'TEXTING WHILE DRIVING', pos: 97 },
  ] },
  { left: 'FAST FOOD', right: 'SLOW FOOD', clueBank: [
    { word: 'INSTANT NOODLES', pos: 3 },
    { word: 'STIR FRY', pos: 35 },
    { word: 'THANKSGIVING TURKEY', pos: 94 },
  ] },
  { left: 'BAD SUPERPOWER', right: 'GREAT SUPERPOWER', clueBank: [
    { word: 'TALKING TO FISH', pos: 10 },
    { word: 'INVISIBILITY', pos: 70 },
    { word: 'TELEPORTATION', pos: 95 },
  ] },
  { left: 'OVERPRICED', right: 'BARGAIN', clueBank: [
    { word: 'AIRPORT WATER', pos: 3 },
    { word: 'MOVIE TICKET', pos: 40 },
    { word: 'LIBRARY CARD', pos: 97 },
  ] },
  { left: 'ROMANTIC', right: 'UNROMANTIC', clueBank: [
    { word: 'CANDLELIT DINNER', pos: 4 },
    { word: 'MOVIE NIGHT', pos: 35 },
    { word: 'TAX SEASON', pos: 97 },
  ] },
  { left: 'LOW EFFORT', right: 'HIGH EFFORT', clueBank: [
    { word: 'MICROWAVE MEAL', pos: 4 },
    { word: 'FLAT-PACK FURNITURE', pos: 55 },
    { word: 'WEDDING PLANNING', pos: 95 },
  ] },
  { left: 'SHORT-LIVED', right: 'LONG-LIVED', clueBank: [
    { word: 'MAYFLY', pos: 2 },
    { word: 'DOG', pos: 40 },
    { word: 'GIANT TORTOISE', pos: 95 },
  ] },
  { left: 'BLAND', right: 'FLAVORFUL', clueBank: [
    { word: 'RICE CAKE', pos: 4 },
    { word: 'CHICKEN SOUP', pos: 50 },
    { word: 'CURRY', pos: 94 },
  ] },
  { left: 'DAY JOB', right: 'DREAM JOB', clueBank: [
    { word: 'DATA ENTRY', pos: 5 },
    { word: 'CHEF', pos: 55 },
    { word: 'ASTRONAUT', pos: 94 },
  ] },
  { left: 'EASY JOB', right: 'HARD JOB', clueBank: [
    { word: 'MATTRESS TESTER', pos: 3 },
    { word: 'BUS DRIVER', pos: 50 },
    { word: 'BRAIN SURGEON', pos: 97 },
  ] },
  { left: 'UNDERDRESSED', right: 'OVERDRESSED', clueBank: [
    { word: 'PAJAMAS AT WORK', pos: 4 },
    { word: 'JEANS AT A WEDDING', pos: 30 },
    { word: 'TUXEDO AT A BBQ', pos: 97 },
  ] },
  { left: 'RELAXING SOUND', right: 'ANNOYING SOUND', clueBank: [
    { word: 'RAIN', pos: 4 },
    { word: 'TICKING CLOCK', pos: 50 },
    { word: 'CAR ALARM', pos: 96 },
  ] },
  { left: 'LONER ANIMAL', right: 'PACK ANIMAL', clueBank: [
    { word: 'OCTOPUS', pos: 5 },
    { word: 'HOUSE CAT', pos: 35 },
    { word: 'WOLF', pos: 90 },
  ] },
  { left: 'SHORT', right: 'TALL', clueBank: [
    { word: 'DOGHOUSE', pos: 3 },
    { word: 'TWO-STORY HOUSE', pos: 40 },
    { word: 'SKYSCRAPER', pos: 96 },
  ] },
  { left: 'NEAR', right: 'FAR', clueBank: [
    { word: 'NEXT DOOR', pos: 3 },
    { word: 'NEIGHBORING TOWN', pos: 35 },
    { word: 'THE MOON', pos: 97 },
  ] },
  { left: 'MAINSTREAM', right: 'NICHE', clueBank: [
    { word: 'POP MUSIC', pos: 3 },
    { word: 'JAZZ', pos: 55 },
    { word: 'POLKA', pos: 94 },
  ] },
  { left: 'NORMAL COMBO', right: 'WEIRD COMBO', clueBank: [
    { word: 'PB AND J', pos: 3 },
    { word: 'FRIES IN A MILKSHAKE', pos: 55 },
    { word: 'PICKLES AND ICE CREAM', pos: 95 },
  ] },
  { left: 'FLAT', right: 'MOUNTAINOUS', clueBank: [
    { word: 'SALT FLATS', pos: 3 },
    { word: 'ROLLING HILLS', pos: 45 },
    { word: 'HIMALAYAS', pos: 97 },
  ] },
  { left: 'RAW', right: 'BURNT', clueBank: [
    { word: 'SUSHI', pos: 3 },
    { word: 'MEDIUM STEAK', pos: 45 },
    { word: 'CHARCOAL TOAST', pos: 96 },
  ] },
  { left: 'BAD INVENTION', right: 'GOOD INVENTION', clueBank: [
    { word: 'SELFIE STICK', pos: 20 },
    { word: 'MICROWAVE', pos: 70 },
    { word: 'THE WHEEL', pos: 97 },
  ] },
  { left: 'FOLLOWER', right: 'LEADER', clueBank: [
    { word: 'SHEEP', pos: 4 },
    { word: 'VICE PRESIDENT', pos: 55 },
    { word: 'GENERAL', pos: 94 },
  ] },
  { left: 'TRADITIONAL', right: 'MODERN', clueBank: [
    { word: 'HANDWRITTEN LETTER', pos: 4 },
    { word: 'EMAIL', pos: 55 },
    { word: 'HOLOGRAM CALL', pos: 95 },
  ] },
  { left: 'RURAL', right: 'URBAN', clueBank: [
    { word: 'FARMHOUSE', pos: 3 },
    { word: 'SUBURB', pos: 50 },
    { word: 'TIMES SQUARE', pos: 97 },
  ] },
  { left: 'PLAIN', right: 'COLORFUL', clueBank: [
    { word: 'WHITE WALL', pos: 3 },
    { word: 'BLUE JEANS', pos: 35 },
    { word: 'RAINBOW', pos: 97 },
  ] },
  { left: 'STRAIGHT', right: 'CURVY', clueBank: [
    { word: 'RULER', pos: 2 },
    { word: 'RIVER', pos: 60 },
    { word: 'SPIRAL STAIRCASE', pos: 95 },
  ] },
  { left: 'DULL', right: 'SHARP', clueBank: [
    { word: 'BOWLING BALL', pos: 3 },
    { word: 'PENCIL TIP', pos: 55 },
    { word: 'SAMURAI SWORD', pos: 97 },
  ] },
  { left: 'OLD-FASHIONED', right: 'TRENDY', clueBank: [
    { word: 'SUSPENDERS', pos: 10 },
    { word: 'SNEAKERS', pos: 60 },
    { word: 'VIRAL DANCE', pos: 94 },
  ] },
  { left: 'FORGIVABLE', right: 'UNFORGIVABLE', clueBank: [
    { word: 'SNEEZING', pos: 3 },
    { word: 'SPOILING A MOVIE', pos: 60 },
    { word: 'BETRAYING A FRIEND', pos: 97 },
  ] },
  { left: 'SNACK', right: 'MEAL', clueBank: [
    { word: 'PRETZEL', pos: 3 },
    { word: 'SOUP', pos: 50 },
    { word: 'THREE-COURSE DINNER', pos: 97 },
  ] },
  { left: 'BEST CHORE', right: 'WORST CHORE', clueBank: [
    { word: 'WATERING PLANTS', pos: 5 },
    { word: 'VACUUMING', pos: 45 },
    { word: 'UNCLOGGING A DRAIN', pos: 97 },
  ] },
  { left: 'PLANNED', right: 'SPONTANEOUS', clueBank: [
    { word: 'WEDDING', pos: 3 },
    { word: 'WEEKEND TRIP', pos: 50 },
    { word: 'KARAOKE', pos: 90 },
  ] },
  { left: 'EASY TO COOK', right: 'HARD TO COOK', clueBank: [
    { word: 'TOAST', pos: 3 },
    { word: 'LASAGNA', pos: 55 },
    { word: 'SOUFFLE', pos: 95 },
  ] },
  { left: 'FOR KIDS', right: 'FOR ADULTS', clueBank: [
    { word: 'CARTOONS', pos: 3 },
    { word: 'BOARD GAMES', pos: 45 },
    { word: 'MORTGAGE', pos: 97 },
  ] },
  { left: 'HOMEBODY', right: 'GLOBETROTTER', clueBank: [
    { word: 'HOUSE PLANT', pos: 3 },
    { word: 'COMMUTER', pos: 45 },
    { word: 'AIRLINE PILOT', pos: 95 },
  ] },
  { left: 'TASTES BAD', right: 'TASTES GOOD', clueBank: [
    { word: 'COUGH SYRUP', pos: 4 },
    { word: 'AIRPLANE FOOD', pos: 35 },
    { word: "GRANDMA'S COOKING", pos: 96 },
  ] },
  { left: 'NOT ADDICTIVE', right: 'ADDICTIVE', clueBank: [
    { word: 'SPINACH', pos: 3 },
    { word: 'CROSSWORD PUZZLES', pos: 45 },
    { word: 'POTATO CHIPS', pos: 92 },
  ] },
  { left: 'EASY TO LEARN', right: 'HARD TO LEARN', clueBank: [
    { word: 'TIC-TAC-TOE', pos: 2 },
    { word: 'GUITAR', pos: 60 },
    { word: 'MANDARIN', pos: 94 },
  ] },
  { left: 'UNLUCKY', right: 'LUCKY', clueBank: [
    { word: 'BLACK CAT', pos: 4 },
    { word: 'PENNY ON THE GROUND', pos: 60 },
    { word: 'FOUR-LEAF CLOVER', pos: 95 },
  ] },
  { left: 'SHY', right: 'BOLD', clueBank: [
    { word: 'TURTLE', pos: 4 },
    { word: 'HOUSE CAT', pos: 40 },
    { word: 'HONEY BADGER', pos: 96 },
  ] },
  { left: 'FLAT', right: 'FIZZY', clueBank: [
    { word: 'TAP WATER', pos: 3 },
    { word: 'KOMBUCHA', pos: 50 },
    { word: 'CHAMPAGNE', pos: 95 },
  ] },
  { left: 'BAD ADVICE', right: 'GOOD ADVICE', clueBank: [
    { word: 'TOUCH THE STOVE', pos: 3 },
    { word: 'SKIP BREAKFAST', pos: 35 },
    { word: 'WEAR SUNSCREEN', pos: 96 },
  ] },
  { left: 'UNDERGROUND', right: 'SKY HIGH', clueBank: [
    { word: 'SUBWAY', pos: 3 },
    { word: 'TREEHOUSE', pos: 45 },
    { word: 'JUMBO JET', pos: 95 },
  ] },
  { left: 'MINIMALIST', right: 'MAXIMALIST', clueBank: [
    { word: 'EMPTY ROOM', pos: 3 },
    { word: 'SCANDINAVIAN KITCHEN', pos: 30 },
    { word: 'CASINO LOBBY', pos: 96 },
  ] },
  { left: 'ORDINARY', right: 'MAGICAL', clueBank: [
    { word: 'STAPLER', pos: 3 },
    { word: 'NORTHERN LIGHTS', pos: 75 },
    { word: 'WIZARD', pos: 97 },
  ] },
  { left: 'OFF-KEY', right: 'PITCH-PERFECT', clueBank: [
    { word: 'SHOWER SINGING', pos: 10 },
    { word: 'KARAOKE NIGHT', pos: 40 },
    { word: 'OPERA STAR', pos: 96 },
  ] },
  { left: 'MATTE', right: 'SPARKLY', clueBank: [
    { word: 'GRAVEL', pos: 3 },
    { word: 'SILVERWARE', pos: 55 },
    { word: 'DISCO BALL', pos: 97 },
  ] },
  { left: 'BAD FIRST DATE', right: 'GOOD FIRST DATE', clueBank: [
    { word: 'DENTIST APPOINTMENT', pos: 3 },
    { word: 'COFFEE SHOP', pos: 55 },
    { word: 'SUNSET PICNIC', pos: 94 },
  ] },
  { left: 'QUICK READ', right: 'LONG READ', clueBank: [
    { word: 'TEXT MESSAGE', pos: 2 },
    { word: 'MAGAZINE', pos: 30 },
    { word: 'ENCYCLOPEDIA', pos: 97 },
  ] },
  { left: 'CRUNCHY', right: 'MUSHY', clueBank: [
    { word: 'CELERY', pos: 3 },
    { word: 'PASTA', pos: 55 },
    { word: 'MASHED POTATOES', pos: 96 },
  ] },
  { left: 'LOW MAINTENANCE', right: 'HIGH MAINTENANCE', clueBank: [
    { word: 'CACTUS', pos: 3 },
    { word: 'DOG', pos: 55 },
    { word: 'SWIMMING POOL', pos: 90 },
  ] },
  { left: 'STINGY', right: 'GENEROUS', clueBank: [
    { word: 'SCROOGE', pos: 3 },
    { word: 'SPLITTING THE BILL', pos: 50 },
    { word: 'SANTA CLAUS', pos: 97 },
  ] },
  { left: 'HONEST', right: 'SNEAKY', clueBank: [
    { word: 'GUIDE DOG', pos: 5 },
    { word: 'POKER PLAYER', pos: 60 },
    { word: 'CAT BURGLAR', pos: 96 },
  ] },
  { left: 'AWKWARD', right: 'SMOOTH', clueBank: [
    { word: 'WRONG-PERSON WAVE', pos: 4 },
    { word: 'SMALL TALK', pos: 45 },
    { word: 'JAMES BOND', pos: 96 },
  ] },
]
