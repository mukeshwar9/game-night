// Solo-hub copy for party games that have no bot: the hub also uses the
// keys to skip recording a solo play.
export const PARTY_BLURB = {
  twotruths: 'Spot the lie among three statements.',
  bluff: "Liar's dice — out-bluff your opponent.",
  sketch: 'Draw the secret word, race to guess it.',
}

// Demos kept off the solo shelf (still reachable at /solo/<type>): the party
// cards above have no bot, so their tiles were dead ends, and Password's bot
// guesser ignores the clue, so it stays off until the registry can say
// solo: true (audit J1). Every other shelf tile must be a solo: true game
// (games.test.js checks both directions).
export const OFF_SHELF = new Set([...Object.keys(PARTY_BLURB), 'password'])
