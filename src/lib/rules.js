// Static, client-side tutorial text for every game in the GAME_TYPES registry
// (src/lib/games.js). Keyed by `gameType`. Each entry is { objective, howToPlay,
// win } — rendered by src/components/RulesModal.jsx. Titles are NOT stored here;
// the modal pulls the registry `label` so display names never drift.
//
// To add rules for a new game, add an entry keyed by its `type`.

export const GAME_RULES = {
  tictactoe: {
    objective: 'Be the first to line up three of your marks in a row on the 3×3 board.',
    howToPlay: [
      'Players take turns — one is X, the other is O.',
      'Tap any empty square to place your mark.',
    ],
    win: 'Get 3 in a row across, down, or diagonally to win. If the board fills with no line, it’s a draw.',
  },

  connectfour: {
    objective: 'Connect four of your discs in a line before your opponent does.',
    howToPlay: [
      'Take turns dropping a disc into one of the 7 columns on the 7×6 grid.',
      'Discs fall to the lowest empty slot — you only choose the column.',
    ],
    win: 'Line up 4 of your discs horizontally, vertically, or diagonally to win. A full board with no four-in-a-row is a draw.',
  },

  ultimatettt: {
    objective: 'Win three miniboards in a row on the big 3×3 grid.',
    howToPlay: [
      'The board is nine tic-tac-toe games arranged in a 3×3 grid.',
      'The cell you play in decides which miniboard your opponent must play in next.',
      'If you’re sent to a board that’s already won or full, you may play in any open board.',
      'Win a miniboard with three in a row — it’s then claimed by that player.',
    ],
    win: 'Claim three miniboards in a row (across, down, or diagonally) to win. If every board is decided with no line, the most boards won wins.',
  },

  connectfourpop: {
    objective: 'Connect four of your discs in a line — or pop your way to one.',
    howToPlay: [
      'Take turns dropping a disc into one of the 7 columns on the 7×6 grid, exactly like Connect Four.',
      'Instead of dropping, you may POP one of your own bottom discs out (tap the ▼ under a column).',
      'When you pop, every disc above slides down one row.',
      'A pop can complete a line for either player — watch what falls into place.',
    ],
    win: 'First to line up four in a row (horizontally, vertically, or diagonally) wins. If one move makes four for both players, the mover wins.',
  },

  pong: {
    objective: 'Send the ball past your opponent’s paddle to score.',
    howToPlay: [
      'Move your paddle with ↑/↓, W/S, or by dragging on the court.',
      'The ball speeds up each rally — where it strikes your paddle sets the return angle.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'First to 5 points takes the round; first to 3 rounds wins the match.',
  },

  snake: {
    objective: 'Outlast your opponent in a real-time snake duel.',
    howToPlay: [
      'Steer your snake with arrow keys, WASD, or swipe on touch screens.',
      'Eat food to grow longer — you can’t reverse 180°.',
      'Walls wrap around — exit right, re-enter left (and all four sides).',
      'Avoid your own body and your opponent’s body.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'Be the last snake alive to win the round. If both die on the same tick it’s a draw. First to 3 round wins takes the match.',
  },

  hangwoman: {
    objective: 'As the guesser, uncover the hidden word before you run out of guesses.',
    howToPlay: [
      'One player secretly sets a word; the word is never sent to the server until the reveal.',
      'The other player guesses letters one at a time.',
      'Each wrong letter adds to the miss count — too many and the round is lost.',
    ],
    win: 'Reveal every letter of the word to win. Run out of guesses and the setter wins the round.',
  },

  dotsandboxes: {
    objective: 'Claim more of the 16 boxes (a 4×4 grid) than your opponent.',
    howToPlay: [
      'Take turns drawing one edge between two dots.',
      'Complete the 4th side of a box to claim it and stamp it with your mark.',
      'Completing a box earns you an extra turn — keep going while you keep closing boxes.',
    ],
    win: 'Own the most boxes when all 16 are claimed. First to 9 clinches it early; 8–8 is a draw.',
  },

  sos: {
    objective: 'Spell more "S-O-S" sequences than your opponent on the 7×7 grid.',
    howToPlay: [
      'On your turn, place either an S or an O in any empty cell.',
      'Form S-O-S in a row, column, or diagonal to score that sequence.',
      'Complete at least one S-O-S and you take another turn.',
    ],
    win: 'When the board fills, the player who made the most S-O-S sequences wins. Equal counts draw.',
  },

  simon: {
    objective: 'Out-memorize your opponent in a back-and-forth sequence duel.',
    howToPlay: [
      'Watch the pattern of lit pads, then tap them back in the exact order.',
      'Repeat the sequence correctly, then add one new pad to pass it back.',
    ],
    win: 'Tap a wrong pad and you lose. The last player to recall the growing sequence wins.',
  },

  chimp: {
    objective: 'Remember the positions of numbered tiles and tap them in order.',
    howToPlay: [
      'Numbers briefly appear on a 5×5 grid, then hide.',
      'Tap the cells in ascending numeric order from memory.',
      'Clear a level and the next one adds another number.',
    ],
    win: 'One wrong tap ends your run — outlast your opponent to win.',
  },

  numbermemory: {
    objective: 'Recall a growing sequence of digits.',
    howToPlay: [
      'A number flashes on screen, then disappears.',
      'Type the digits back exactly from memory.',
      'Each correct answer adds another digit next round.',
    ],
    win: 'Miss the sequence and you’re out — the player who remembers the longest number wins.',
  },

  reaction: {
    objective: 'React faster than your opponent across four rounds.',
    howToPlay: [
      'Wait for the screen to turn green — don’t jump early.',
      'Tap the instant it changes; your reaction time is recorded.',
      'Play four rounds.',
    ],
    win: 'The lower average reaction time across the rounds wins.',
  },

  aim: {
    objective: 'Pop 30 targets as fast and accurately as you can.',
    howToPlay: [
      'Targets appear one at a time — click each as quickly as possible.',
      'Both players race through the same set of 30 targets.',
    ],
    win: 'Best combination of speed and accuracy wins the duel.',
  },

  typing: {
    objective: 'Type the passage faster than your opponent’s ghost.',
    howToPlay: [
      'Both players type the same passage as quickly and accurately as possible.',
      'Your opponent’s progress shows as a live ghost you’re racing.',
    ],
    win: 'Highest words-per-minute (adjusted for accuracy) wins.',
  },

  math: {
    objective: 'Solve as many problems as you can in a two-minute blitz.',
    howToPlay: [
      'Answer arithmetic questions one after another.',
      'Correct answers build your score and streak; both players get the same questions.',
    ],
    win: 'Highest score when the two-minute clock runs out wins.',
  },

  visualmemory: {
    objective: 'Memorize and reproduce a pattern of lit tiles.',
    howToPlay: [
      'Tiles flash on a 4×4 grid, then go dark.',
      'Tap every tile that was lit, from memory.',
      'Each cleared level adds more tiles to remember.',
    ],
    win: 'Reproduce patterns longer than your opponent to win.',
  },

  gomoku: {
    objective: 'Be the first to get five of your stones in a row.',
    howToPlay: [
      'Take turns placing a stone on any empty point of the 15×15 board.',
    ],
    win: 'Line up exactly five in a row — horizontally, vertically, or diagonally — to win.',
  },

  reversi: {
    objective: 'Finish with more discs of your color on the 8×8 board.',
    howToPlay: [
      'Place a disc so it flanks a line of your opponent’s discs between it and one of yours.',
      'All flanked discs flip to your color.',
      'Every move must capture at least one disc; if you have no legal move, your turn is skipped.',
    ],
    win: 'When neither side can move, the color with more discs wins. Equal counts draw.',
  },

  orderchaos: {
    objective: 'Asymmetric duel — Order wants a line of five, Chaos wants to stop it.',
    howToPlay: [
      'On your turn, place either an X or an O in any empty cell (either player may place either letter).',
      'Order plays first and aims to build a run of five.',
      'Chaos aims to fill the board without any five-in-a-row appearing.',
    ],
    win: 'Order wins by making five of the same letter in a row. Chaos wins if the 6×6 board fills with no such line.',
  },

  dice: {
    objective: 'Be the first to bank 100 points by pushing your luck.',
    howToPlay: [
      'On your turn, roll the die as many times as you dare — each roll adds to your at-risk total.',
      'Bank to add your at-risk points to your score and pass the dice.',
      'Roll a 1 and you lose all at-risk points for the turn and the dice pass.',
    ],
    win: 'First player to reach 100 banked points wins.',
  },

  twotruths: {
    objective: 'As the guesser, spot which of three statements is the lie.',
    howToPlay: [
      'One player writes two true statements and one lie about themselves.',
      'The other player reads all three and picks the one they think is false.',
    ],
    win: 'Guess the lie correctly to win the round; get fooled and the writer wins.',
  },

  bluff: {
    objective: 'Liar’s dice — bluff about the hidden dice and call your opponent’s bluffs.',
    howToPlay: [
      'Each player secretly rolls their own dice.',
      'Take turns raising the bid — claim how many dice across BOTH cups show a given face (1s are wild).',
      'Instead of bidding, call "Liar" to challenge the last bid.',
    ],
    win: 'On a challenge, the dice are revealed: if the bid is met the caller loses a die, otherwise the bidder does. Lose all your dice and you’re out.',
  },

  wavelength: {
    objective: 'Team guessing — read your clue-giver’s mind to land near the hidden target on a spectrum.',
    howToPlay: [
      '3–8 players. Each round one player is the clue-giver and sees a hidden target on a 0–100 dial between two opposites.',
      'The clue-giver gives one word or phrase that hints where the target sits.',
      'Everyone else moves the dial to where they think the target is.',
    ],
    win: 'The closer your guess to the hidden target, the more points you score (bullseye = 50). The role rotates each round.',
  },

  fibbage: {
    objective: 'Fool others with fake answers while finding the real one.',
    howToPlay: [
      '3–8 players. Everyone sees a trivia prompt with a missing answer.',
      'Secretly write a believable fake answer (a lie).',
      'All lies are shuffled in with the truth — then everyone votes for the answer they think is real.',
    ],
    win: 'Score for finding the truth, and for every player your lie fools. Most points wins.',
  },

  tron: {
    objective: 'Outlast your opponent’s light cycle in a single deadly round.',
    howToPlay: [
      'Steer with arrow keys, WASD, or a swipe on touch screens — you can’t reverse 180°.',
      'Both cycles leave a permanent trail behind them that never disappears.',
      'The arena wraps around on all four sides.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'Crash into any trail (yours or your opponent’s) or the opposing cycle and you’re out. Last cycle alive wins the round; a head-on collision in the same tick is a draw. One round decides the match.',
  },

  sumo: {
    objective: 'Shove your opponent off a shrinking circular platform.',
    howToPlay: [
      'Tap any key (or the on-screen button) to push your blob toward your opponent — each tap is one impulse.',
      'Ramming the other blob knocks both of you back.',
      'The platform shrinks the longer the round runs.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'Push your opponent past the platform’s edge to win the round. If both blobs go out at once it’s a draw. One round decides the match.',
  },

  spaceduel: {
    objective: 'Outduel your opponent’s ship with asteroids-style combat.',
    howToPlay: [
      'Turn with ←/→ or A/D, thrust with ↑ or W, and fire with Space (or the on-screen buttons on touch).',
      'Bullets wrap around the arena edges; your ship bounces off the walls instead.',
      'Each ship has 3 hit points — it takes multiple hits to destroy one.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'Destroy your opponent’s ship to win the round. If both survive the 60-second cap, whoever landed more hits wins (a 1-hit margin is required, otherwise it’s a draw). One round decides the match.',
  },

  chainreaction: {
    objective: 'Trigger chain reactions on the 6×8 grid to wipe every orb of your opponent’s color off the board.',
    howToPlay: [
      'On your turn, place an orb in any empty cell or a cell you already own.',
      'Each cell has a capacity (2 in a corner, 3 on an edge, 4 in the interior) — reaching it makes the cell explode.',
      'An exploding cell fires one orb into each orthogonal neighbor, converting those cells to your color and possibly pushing them past their own capacity — cascading into a chain reaction.',
      'You can only place on empty cells or cells you already own; opponent-owned cells are off limits.',
    ],
    win: 'Once both players have made at least one move, if your opponent has no orbs left on the board, you win.',
  },

  wordduel: {
    objective: 'Solve a hidden 5-letter word in fewer guesses than your opponent, Wordle-style.',
    howToPlay: [
      'Both players race to guess the same secret word at the same time.',
      'Each guess is marked green (right letter, right spot), yellow (right letter, wrong spot), or gray (not in the word).',
      'You get up to 6 guesses; the word itself is never sent until both players finish, verified against a commitment made at round start so no one can peek.',
    ],
    win: 'Solve it in fewer guesses than your opponent to win. Equal guess counts — faster solver wins. Both fail to solve it: draw. First to 3 round wins takes the match.',
  },

  spyfair: {
    objective: 'Find the spy in your midst — or, as the spy, survive without being caught.',
    howToPlay: [
      '3–8 players. Everyone shares a secret location and a role — except one random player, the spy, who knows neither.',
      'Players ask each other questions to expose who doesn’t know the location, without giving it away to the spy.',
      'When time runs out, everyone votes on who they think is the spy.',
    ],
    win: 'The group wins if a clear majority votes for the actual spy. Otherwise the spy wins. First to 3 round wins takes the match.',
  },
}

// Returns the rules object for a game type, or null if none is defined.
export function getRules(type) {
  return GAME_RULES[type] ?? null
}
