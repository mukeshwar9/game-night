// TRIVIA BLITZ starter deck — v1 ships 60 questions; expand toward 200+ later
// (see docs/prds/trivia-blitz.md). Shape: { q, options[4], answer: 0-3, cat, diff: 1|2|3 }.
//
// ⚠ RESIDUAL (UNFIXABLE) INFO LEAK — same acceptance as decks/fibbage.js: this
// deck ships in the client JS bundle, so a player who inspects it can look up
// answers. Here the leak is partially self-limiting: looking things up costs
// time, and speed is most of the score. Do not "fix" by moving the deck
// server-side — there is no server.

export const TRIVIA_DECK = [
  // Science — diff 1
  { q: 'Which planet has the most moons?', options: ['Saturn', 'Jupiter', 'Mars', 'Neptune'], answer: 0, cat: 'science', diff: 1 },
  { q: 'What gas do plants absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], answer: 2, cat: 'science', diff: 1 },
  { q: 'How many legs does a spider have?', options: ['Six', 'Eight', 'Ten', 'Twelve'], answer: 1, cat: 'science', diff: 1 },
  { q: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2, cat: 'science', diff: 1 },
  { q: 'Which organ pumps blood through the body?', options: ['Lungs', 'Liver', 'Heart', 'Kidneys'], answer: 2, cat: 'science', diff: 1 },
  // Science — diff 2
  { q: 'What is the hardest natural substance?', options: ['Quartz', 'Diamond', 'Titanium', 'Obsidian'], answer: 1, cat: 'science', diff: 2 },
  { q: 'How long does sunlight take to reach Earth?', options: ['8 seconds', '8 minutes', '8 hours', '80 minutes'], answer: 1, cat: 'science', diff: 2 },
  { q: 'Which particle carries a negative charge?', options: ['Proton', 'Neutron', 'Electron', 'Positron'], answer: 2, cat: 'science', diff: 2 },
  { q: 'What does DNA stand for?', options: ['Deoxyribonucleic acid', 'Dinucleic acid', 'Dual nucleotide array', 'Diribonucleic acid'], answer: 0, cat: 'science', diff: 2 },
  // Science — diff 3
  { q: 'Which element has the highest melting point?', options: ['Tungsten', 'Carbon', 'Osmium', 'Platinum'], answer: 1, cat: 'science', diff: 3 },
  { q: 'What is the only letter not in any element symbol?', options: ['J', 'Q', 'Z', 'X'], answer: 0, cat: 'science', diff: 3 },

  // History — diff 1
  { q: 'In which year did World War II end?', options: ['1943', '1944', '1945', '1946'], answer: 2, cat: 'history', diff: 1 },
  { q: 'Who was the first person on the Moon?', options: ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'Michael Collins'], answer: 2, cat: 'history', diff: 1 },
  { q: 'The Great Pyramid was built in which country?', options: ['Mexico', 'Egypt', 'Sudan', 'Iraq'], answer: 1, cat: 'history', diff: 1 },
  // History — diff 2
  { q: 'Which empire built Machu Picchu?', options: ['Aztec', 'Maya', 'Inca', 'Olmec'], answer: 2, cat: 'history', diff: 2 },
  { q: 'Who was the first President of the United States?', options: ['Thomas Jefferson', 'John Adams', 'Benjamin Franklin', 'George Washington'], answer: 3, cat: 'history', diff: 1 },
  { q: 'The Berlin Wall fell in which decade?', options: ['1970s', '1980s', '1990s', '2000s'], answer: 2, cat: 'history', diff: 2 },
  { q: 'Which ship famously sank in 1912?', options: ['Lusitania', 'Britannic', 'Titanic', 'Bismarck'], answer: 2, cat: 'history', diff: 1 },
  // History — diff 3
  { q: 'Who was the last pharaoh of ancient Egypt?', options: ['Nefertiti', 'Cleopatra VII', 'Hatshepsut', 'Ramesses II'], answer: 1, cat: 'history', diff: 3 },
  { q: 'The Rosetta Stone helped decode which script?', options: ['Cuneiform', 'Linear B', 'Hieroglyphics', 'Runes'], answer: 2, cat: 'history', diff: 3 },

  // Geography — diff 1
  { q: 'What is the capital of France?', options: ['Lyon', 'Marseille', 'Paris', 'Nice'], answer: 2, cat: 'geography', diff: 1 },
  { q: 'Which is the largest ocean?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3, cat: 'geography', diff: 1 },
  { q: 'On which continent is the Sahara desert?', options: ['Asia', 'Africa', 'Australia', 'South America'], answer: 1, cat: 'geography', diff: 1 },
  // Geography — diff 2
  { q: 'Which country has the most time zones?', options: ['Russia', 'USA', 'France', 'China'], answer: 2, cat: 'geography', diff: 2 },
  { q: 'What is the longest river in the world?', options: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], answer: 1, cat: 'geography', diff: 2 },
  { q: 'Mount Everest sits on the border of Nepal and…', options: ['India', 'China', 'Bhutan', 'Pakistan'], answer: 1, cat: 'geography', diff: 2 },
  { q: 'Which capital city is the highest above sea level?', options: ['Quito', 'La Paz', 'Kathmandu', 'Bogotá'], answer: 1, cat: 'geography', diff: 3 },
  // Geography — diff 3
  { q: 'Which sea has no coastline cities due to extreme salinity?', options: ['Dead Sea', 'Red Sea', 'Black Sea', 'Aral Sea'], answer: 0, cat: 'geography', diff: 3 },

  // Pop culture — diff 1
  { q: 'Which wizard school does Harry Potter attend?', options: ['Durmstrang', 'Beauxbatons', 'Hogwarts', 'Ilvermorny'], answer: 2, cat: 'pop culture', diff: 1 },
  { q: 'What color is the animated character SpongeBob?', options: ['Yellow', 'Pink', 'Blue', 'Green'], answer: 0, cat: 'pop culture', diff: 1 },
  { q: 'In chess, which piece can only move diagonally?', options: ['Rook', 'Knight', 'Bishop', 'Queen'], answer: 2, cat: 'pop culture', diff: 1 },
  // Pop culture — diff 2
  { q: 'Which band released "Bohemian Rhapsody"?', options: ['The Beatles', 'Queen', 'Led Zeppelin', 'Pink Floyd'], answer: 1, cat: 'pop culture', diff: 1 },
  { q: 'What is the name of Batman\'s home city?', options: ['Metropolis', 'Star City', 'Gotham', 'Central City'], answer: 2, cat: 'pop culture', diff: 1 },
  { q: 'Which movie features the line "I\'ll be back"?', options: ['Rocky', 'The Terminator', 'Die Hard', 'Predator'], answer: 1, cat: 'pop culture', diff: 2 },
  { q: 'Who directed "Jurassic Park" (1993)?', options: ['James Cameron', 'Steven Spielberg', 'Ridley Scott', 'George Lucas'], answer: 1, cat: 'pop culture', diff: 2 },
  // Pop culture — diff 3
  { q: 'Which video game franchise features Master Chief?', options: ['Doom', 'Halo', 'Destiny', 'Metro'], answer: 1, cat: 'pop culture', diff: 2 },
  { q: 'What year did the first iPhone launch?', options: ['2005', '2006', '2007', '2008'], answer: 2, cat: 'pop culture', diff: 3 },

  // Sports — diff 1
  { q: 'How many players are on a soccer team on the field?', options: ['9', '10', '11', '12'], answer: 2, cat: 'sports', diff: 1 },
  { q: 'In which sport would you perform a slam dunk?', options: ['Volleyball', 'Basketball', 'Tennis', 'Handball'], answer: 1, cat: 'sports', diff: 1 },
  { q: 'How often are the Summer Olympics held?', options: ['Every 2 years', 'Every 3 years', 'Every 4 years', 'Every 5 years'], answer: 2, cat: 'sports', diff: 1 },
  // Sports — diff 2
  { q: 'In tennis, what score comes after 30?', options: ['40', '45', '50', '60'], answer: 0, cat: 'sports', diff: 1 },
  { q: 'Which country has won the most FIFA World Cups?', options: ['Germany', 'Argentina', 'Italy', 'Brazil'], answer: 3, cat: 'sports', diff: 2 },
  { q: 'How many rings are on the Olympic flag?', options: ['Four', 'Five', 'Six', 'Seven'], answer: 1, cat: 'sports', diff: 1 },
  // Sports — diff 3
  { q: 'In Formula 1, what color flag signals the race end?', options: ['Red', 'White', 'Checkered', 'Yellow'], answer: 2, cat: 'sports', diff: 1 },
  { q: 'A "goose egg" in sports scoring means…', options: ['Zero', 'One', 'A penalty', 'Overtime'], answer: 0, cat: 'sports', diff: 2 },

  // Wordplay — diff 1
  { q: 'Which word is a synonym for "rapid"?', options: ['Sluggish', 'Swift', 'Sturdy', 'Shallow'], answer: 1, cat: 'wordplay', diff: 1 },
  { q: 'What do you call a group of lions?', options: ['Pack', 'Herd', 'Pride', 'Flock'], answer: 2, cat: 'wordplay', diff: 1 },
  { q: 'Which word means both "a written record" and "to make a note"?', options: ['Log', 'List', 'Ledger', 'Leaflet'], answer: 0, cat: 'wordplay', diff: 2 },
  // Wordplay — diff 2
  { q: 'Complete the palindrome: "Was it a car or a cat I …?"', options: ['met', 'saw', 'hit', 'rode'], answer: 1, cat: 'wordplay', diff: 2 },
  { q: 'What is an eight-sided shape called?', options: ['Hexagon', 'Heptagon', 'Octagon', 'Nonagon'], answer: 2, cat: 'wordplay', diff: 1 },
  { q: 'Which word contains a silent "w"?', options: ['Wave', 'Wrist', 'Water', 'Widen'], answer: 1, cat: 'wordplay', diff: 2 },
  { q: 'The opposite of "benevolent" is…', options: ['Beneficial', 'Malevolent', 'Benevolence', 'Valiant'], answer: 1, cat: 'wordplay', diff: 2 },
  // Wordplay — diff 3
  { q: 'What word describes a word spelled the same backwards?', options: ['Anagram', 'Palindrome', 'Homonym', 'Acronym'], answer: 1, cat: 'wordplay', diff: 1 },
  { q: 'Which is the longest word in this list?', options: ['Bookkeeper', 'Typewriter', 'Keyboarding', 'Notepads'], answer: 0, cat: 'wordplay', diff: 3 },
  { q: '"Ephemeral" means…', options: ['Lasting forever', 'Extremely large', 'Short-lived', 'Deeply hidden'], answer: 2, cat: 'wordplay', diff: 3 },

  // Top-ups to reach 60
  { q: 'Which animal is the tallest?', options: ['Elephant', 'Giraffe', 'Ostrich', 'Moose'], answer: 1, cat: 'science', diff: 1 },
  { q: 'How many continents are there?', options: ['Five', 'Six', 'Seven', 'Eight'], answer: 2, cat: 'geography', diff: 1 },
  { q: 'What is the currency of Japan?', options: ['Won', 'Yuan', 'Yen', 'Ringgit'], answer: 2, cat: 'history', diff: 1 },
  { q: 'Which instrument has 88 keys?', options: ['Organ', 'Piano', 'Accordion', 'Harpsichord'], answer: 1, cat: 'pop culture', diff: 2 },
  { q: 'In bowling, what is a perfect score?', options: ['200', '250', '300', '360'], answer: 2, cat: 'sports', diff: 2 },
]

// Sanity guard so a bad edit can't ship a broken deck.
for (const item of TRIVIA_DECK) {
  if (!item.q || !Array.isArray(item.options) || item.options.length !== 4) {
    throw new Error('Bad trivia entry: need exactly 4 options')
  }
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3) {
    throw new Error('Bad trivia entry: answer must be 0-3')
  }
}
