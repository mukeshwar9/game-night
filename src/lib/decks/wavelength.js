// Spectrum pairs for WAVELENGTH. Each pair anchors the two ends of a 0–100 dial:
// `left` lives at 0, `right` lives at 100. The clue-giver picks a hidden target
// somewhere along it and gives a one-word clue; everyone else guesses where.
//
// `clueBank` — used by solo/bot play: each entry is a real-world thing/concept a
// clue-giver would plausibly say (not a bare synonym of `left`/`right`) paired with
// where it actually sits on the dial (`pos`, 0–100).
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
]
