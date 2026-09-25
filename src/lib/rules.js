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

  tictactoe4: {
    objective: 'Be the first to line up four of your marks in a row on the 4×4 board.',
    howToPlay: [
      'Players take turns — one is X, the other is O.',
      'Tap any empty square on the 4×4 grid to place your mark.',
      'Four in any row, column, or diagonal wins — three does not.',
    ],
    win: 'Get 4 in a row to win. If all 16 cells fill with no line, it’s a draw.',
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

  connectfour5: {
    objective: 'Connect five of your discs in a line on the 9×7 board before your opponent does.',
    howToPlay: [
      'Take turns dropping a disc into one of the 9 columns on the 9×7 grid.',
      'Discs fall to the lowest empty slot — you only choose the column.',
      'Four in a row does not win — you need five.',
    ],
    win: 'Line up 5 of your discs horizontally, vertically, or diagonally to win. A full board with no five-in-a-row is a draw.',
  },

  pacmac: {
    objective: 'Eat more pellets than your rival in a shared maze while dodging ghosts.',
    howToPlay: [
      'Steer your muncher with arrow keys, WASD, or swipe — reverse is allowed.',
      'Pellets are shared: whoever bites first gets the points. Power pellets frighten ghosts.',
      'A ghost hit stuns you and sends you home; eating a frightened ghost scores a bonus.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'Highest score when the maze is empty or the 90-second clock hits zero wins the round. A tie is a draw. First to 3 rounds wins the match.',
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
    objective: 'Claim more of the 36 boxes (a 6×6 grid) than your opponent.',
    howToPlay: [
      'Take turns drawing one edge between two dots.',
      'Complete the 4th side of a box to claim it and stamp it with your mark.',
      'Completing a box earns you an extra turn — keep going while you keep closing boxes.',
    ],
    win: 'Own the most boxes when all 36 are claimed. First to 19 clinches it early; 18–18 is a draw.',
  },

  dotsandboxes4: {
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
      'Tiles light up for a moment (watch the bar drain), then go dark.',
      'Tap every tile that was lit, from memory, in any order.',
      'You and your opponent take turns on the same level; once you both clear it, the next level adds a tile. The grid grows from 4×4 up to 8×8 as the patterns get longer.',
    ],
    win: 'Tap a tile that was not lit and you lose the round — the board then shows the real pattern.',
  },

  gomoku: {
    objective: 'Be the first to get five of your stones in a row.',
    howToPlay: [
      'Take turns placing a stone on any empty point of the 15×15 board.',
    ],
    win: 'Line up five (or more) in a row — horizontally, vertically, or diagonally — to win.',
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

  'dice-big': {
    objective: 'Be the first to bank 100 points with two dice — only snake eyes bust.',
    howToPlay: [
      'On your turn, roll two dice — both add to your at-risk total.',
      'Only a double 1 (snake eyes) wipes your at-risk points and passes the dice; a single 1 still scores.',
      'Bank to add your at-risk points to your score and pass the dice.',
    ],
    win: 'First player to reach 100 banked points wins.',
  },

  battleship: {
    objective: 'Find and sink all five ships in the rival’s hidden fleet.',
    howToPlay: [
      'Secretly place your fleet — Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.',
      'Take turns firing at grid coordinates; hits are marked, misses splash.',
      'A hit lets you shoot again; sink a ship when every one of its cells is hit.',
      'Fleets stay hidden by commit-reveal cryptography — the transcript is verified at the end, so cheating voids the game.',
    ],
    win: 'First player to hit all 17 ship cells wins — or win instantly if the rival’s transcript fails verification.',
  },

  mancala: {
    objective: 'Sow seeds into your store — finish with more than your rival.',
    howToPlay: [
      'On your turn, pick one of your six pits; its seeds sow counterclockwise, one per slot.',
      'Land your last seed in your own store and you go again.',
      'Land it in one of your own empty pits and you capture that seed plus everything in the opposite pit.',
      'When one side empties, the other sweeps their remaining seeds home.',
    ],
    win: 'Most seeds in your store when all pits empty — 24–24 is a draw.',
  },

  checkers: {
    objective: 'Jump every rival piece off the board.',
    howToPlay: [
      'Men move diagonally forward one square on the dark squares.',
      'Captures jump an adjacent enemy to the empty square beyond — jumps are mandatory.',
      'Chained multi-jumps keep going; reaching the far row crowns a KING (moves and captures backward too).',
      'Crowning ends a move, even if further jumps are available.',
    ],
    win: 'Opponent loses when they have no pieces left or no legal move.',
  },

  airhockey: {
    objective: 'Flick the puck past your rival seven times.',
    howToPlay: [
      'Portrait table — you defend the bottom goal, drag your mallet in your half.',
      'Strike the puck with a moving mallet for flick shots; a stationary block absorbs them.',
      'Walls bounce, the puck glides and slows; goals are the glowing mouths on each end.',
    ],
    win: 'First to 7 goals wins.',
  },

  artillery: {
    objective: 'Bracket the rival tank with angle and power, then blow it up.',
    howToPlay: [
      'Turn-based duel on destructible seeded terrain — X fires first.',
      'Set angle (5–90°) and power (10–100); wind pushes every shell differently.',
      'Explosions carve craters and deal splash damage — your own shell can hurt you.',
      'Tanks settle into craters; bracket with fine-tune buttons before you commit.',
    ],
    win: 'Reduce the rival tank to 0 HP. Both tanks dying on one shot is a draw.',
  },

  hex: {
    objective: 'Connect your two assigned edges with an unbroken chain of stones.',
    howToPlay: [
      'Take turns placing one stone on any empty cell of the 11×11 rhombus.',
      'X must connect the LEFT and RIGHT edges; O must connect the TOP and BOTTOM.',
      'Stones never move or get captured — every stone stays forever.',
    ],
    win: 'First chain linking your two edges wins. Draws are mathematically impossible.',
  },

  minesweeper: {
    objective: 'Clear the identical seeded minefield faster than your opponent.',
    howToPlay: [
      'Both players sweep the SAME 12×12 board with 22 hidden mines, simultaneously.',
      'Tap to reveal a cell; numbers show adjacent mines; zeros flood-fill.',
      'Long-press (or toggle FLAG mode) to mark suspected mines — flags are private.',
      'Tap a satisfied number to chord-reveal its remaining neighbors.',
    ],
    win: 'Reveal all 122 safe cells first — or win instantly when your opponent hits a mine.',
  },

  herd: {
    objective: 'Answer like the majority — and avoid becoming the odd one out.',
    howToPlay: [
      '3–8 players. Each round everyone secretly answers the same prompt (45s).',
      'Answers are grouped by matching text: every member of the biggest group(s) scores a point.',
      'If exactly one player matched nobody, they are stuck with the Pink Cow.',
      'The Cow holder cannot win — shed it before you reach 8 points.',
    ],
    win: 'First player to 8 points while NOT holding the Pink Cow wins the match.',
  },

  trivia: {
    objective: 'Answer the most questions correctly — and quickly.',
    howToPlay: [
      '2–8 players. 10 questions, everyone answers each one secretly at the same time.',
      'You have 15 seconds per question; faster correct answers earn more points (up to 1000).',
      'Consecutive correct answers build a streak worth up to +300 extra per question.',
      'A wrong answer or a timeout resets your streak to zero.',
    ],
    win: 'Highest total score after 10 questions wins — ties are shared.',
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

  arrows: {
    objective: 'Clear more arrows than your rival across a 3-round face-off.',
    howToPlay: [
      'Both players share one board of snake-like arrows and tap any uncleared arrow at the same time.',
      'A clear arrow slides off the board in your color — green for X, purple for O.',
      'A blocked arrow is a trap: tapping it shakes red and costs a life, and it never clears.',
      'You have 3 lives per round — at 0 lives you can only watch.',
    ],
    win: 'Whoever clears more arrows wins the round. Win 2 of the 3 rounds (easy, medium, hard) to take the match; a drawn round scores for no one.',
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

  paint: {
    objective: 'Paint more of the 20×20 arena than your opponent before the 60-second clock runs out.',
    howToPlay: [
      'Steer with arrow keys, WASD, or swipe on touch screens — turns are instant, including full reversals.',
      'The cell you leave turns your color as you move off it — cut a wide swath through the arena to claim it.',
      'Standing on your opponent’s paint slows you to 70% speed until you cross off it — use this to trap them.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'When the clock hits zero, whoever painted more cells wins the round; equal counts draw. First to 3 round wins takes the match.',
  },

  chainreaction: {
    objective: 'Trigger chain reactions on the 8×10 grid to wipe every orb of your opponent’s color off the board.',
    howToPlay: [
      'On your turn, place an orb in any empty cell or a cell you already own.',
      'Each cell has a capacity (2 in a corner, 3 on an edge, 4 in the interior) — reaching it makes the cell explode.',
      'An exploding cell fires one orb into each orthogonal neighbor, converting those cells to your color and possibly pushing them past their own capacity — cascading into a chain reaction.',
      'You can only place on empty cells or cells you already own; opponent-owned cells are off limits.',
    ],
    win: 'Once both players have made at least one move, if your opponent has no orbs left on the board, you win.',
  },

  chainreaction4: {
    objective: 'The classic chain-reaction war for 2–4 players: be the last color with orbs on the board.',
    howToPlay: [
      'Everyone shares the 8×10 grid; colors deal by join order (cyan, pink, purple, orange) and turns rotate.',
      'On your turn, place an orb in any empty cell or a cell you already own.',
      'Each cell has a capacity (2 in a corner, 3 on an edge, 4 in the interior) — reaching it makes the cell explode.',
      'An exploding cell fires one orb into each orthogonal neighbor, converting those cells to your color — any color it hits — and possibly cascading further.',
      'Once every player has placed at least once, a cascade that wipes your last orb eliminates you; play skips you for the rest of the round.',
      'You can only place on empty cells or cells you already own; enemy-owned cells are off limits.',
    ],
    win: 'Be the last player standing — when only one color has orbs left, that player wins.',
  },

  chainreaction6: {
    objective: 'Trigger chain reactions on the 6×8 grid to wipe every orb of your opponent’s color off the board.',
    howToPlay: [
      'On your turn, place an orb in any empty cell or a cell you already own.',
      'Each cell has a capacity (2 in a corner, 3 on an edge, 4 in the interior) — reaching it makes the cell explode.',
      'An exploding cell fires one orb into each orthogonal neighbor, converting those cells to your color and possibly pushing them past their own capacity — cascading into a chain reaction.',
      'You can only place on empty cells or cells you already own; opponent-owned cells are off limits.',
    ],
    win: 'Once both players have made at least one move, if your opponent has no orbs left on the board, you win.',
  },

  blockade: {
    objective: 'Race your pawn to the far edge of the board before your opponent — or wall them off their path.',
    howToPlay: [
      'On your turn, either step your pawn one square (up, down, left, or right) or place one of your 10 walls in a gap between squares.',
      'A wall blocks movement across it for both players — plan your own route as you cut off theirs.',
      'If your pawn and your opponent’s are adjacent, you may jump straight over them; if that jump is blocked, you may hop diagonally around them instead.',
      'A wall can never be placed if it would seal either player’s pawn off from their goal row completely — there must always be a path for both.',
    ],
    win: 'First pawn to reach the far edge wins. X starts at the bottom and aims for the top row; O starts at the top and aims for the bottom row.',
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

  wordcoop: {
    objective: 'Solve one secret 5-letter word together in six guesses or fewer.',
    howToPlay: [
      'You and your partner share one board and take turns entering guesses.',
      'Green means right letter and spot. Yellow means the letter is elsewhere. Gray means it is absent.',
      'Your partner sees every clue, so talk through each row and plan the next guess together.',
    ],
    win: 'Guess the word before all six rows are used. You both win or lose together.',
  },

  password: {
    objective: 'Give clues that help your opponent guess the password, then swap roles and score more when you guess.',
    howToPlay: [
      'One player sees the secret password. The other player sees only its length.',
      'The clue-giver sends one-word clues. The guesser submits one guess after each clue.',
      'Earlier correct guesses score more: 5 points, then 4, 3, 2, or 1.',
      'Each guess is timed: 30 seconds for the first two guesses, 25 for the next two, then 20. A timeout counts as a miss.',
    ],
    win: 'First to 15 points wins. If nobody reaches 15 after 12 rounds, the higher score wins; equal scores draw.',
  },

  wordrace: {
    objective: 'Race your opponent to solve the same hidden 5-letter word.',
    howToPlay: [
      'Both players get the same word and can guess at the same time.',
      'Green means right letter and spot, yellow means right letter in another spot, and gray means absent.',
      'You get up to 6 guesses. Opponent letters stay hidden during play; their mark progress remains visible.',
    ],
    win: 'Solve when your opponent fails, use fewer guesses, or solve faster on an equal guess count. Both misses draw. First to 3 round wins takes the match.',
  },

  wordhunt: {
    objective: 'Trace more valid words than your opponent on a shared 4×4 letter grid before time runs out.',
    howToPlay: [
      'Both players get the identical grid and 80 seconds.',
      'Drag across adjacent tiles (including diagonals) to spell a word, or type it and press Enter.',
      'Words must be 3+ letters and can’t reuse a tile in the same word. The Qu tile counts as two letters.',
      'Both players can score the same word — there’s no penalty for overlapping finds.',
    ],
    win: 'Longer words score more (3–4 letters = 1 point, up to 11 for 8+). Highest total score when time runs out wins; equal scores draw. First to 3 round wins takes the match.',
  },

  anagrams: {
    objective: 'Find more words than your opponent from the same seven-letter rack.',
    howToPlay: [
      'Tap tiles or type letters with your keyboard to build a word from the rack.',
      'Press ENTER to submit. Each word scores once per player.',
      'Scoring: 3 letters = 1, 4 = 2, 5 = 4, 6 = 7, 7 = 11 points; all 7 letters earns +5 bingo.',
      'Press FINISH EARLY when you cannot find more words — the round ends when both players finish.',
    ],
    win: 'Play for 90 seconds. Higher score wins; equal scores use total words as the tie-breaker. First to 2 round wins takes the match.',
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

  sketch: {
    objective: 'One player draws a secret word while everyone else races to guess it in chat.',
    howToPlay: [
      '2–8 players. Each round, one player is the artist and picks a secret word from 3 options.',
      'The artist draws it on the shared canvas.',
      'Everyone else types guesses — the word length is shown as blanks.',
      'Guessing correctly locks you in early and reveals the word to you — keep it secret from the others still guessing.',
    ],
    win: 'Guessers score by how fast they guess correctly; the artist scores per correct guesser. Everyone draws twice (three times in a 2-player match) — most total points wins, ties share the win.',
  },

  pairs: {
    objective: 'Find more matching pairs than your opponent on the 6×6 grid of 18 hidden pairs.',
    howToPlay: [
      'Tap any two face-down cards to flip them.',
      'Match the pair and you claim it — plus you immediately go again.',
      'Every face has its own colour and its own picture, so a pair is easy to spot once you have seen both cards.',
      'Miss, and both cards stay face-up for a moment, then flip back down and the turn passes to your opponent.',
    ],
    win: 'Claim 10 of the 18 pairs to win instantly. If the board fills first, whoever claimed more pairs wins — 9–9 is a draw.',
  },

  sim: {
    objective: 'Color connecting lines between six dots — but never complete a triangle of your own color.',
    howToPlay: [
      'Take turns claiming one of the 15 lines between the six dots.',
      'X colors first; there is no passing.',
      'The first player forced to close a triangle in their own color LOSES — so dodge, divert and dump lines on your rival.',
      'A draw is mathematically impossible — someone must eventually complete a triangle.',
    ],
    win: 'You win the moment your opponent completes a triangle in their color. In a 2-coloring of all 15 lines one triangle always exists.',
  },

  chomp: {
    objective: 'Nibble the chocolate bar and leave your opponent the poisoned corner.',
    howToPlay: [
      'The 5×6 bar has one poisoned square in the top-left corner.',
      'On your turn pick any remaining square and eat it PLUS everything below and to the right of it.',
      'Bites carve a staircase out of the bar — the shape only ever shrinks.',
      'Whoever eats the poison loses, and the bar keeps shrinking until someone must.',
    ],
    win: 'Force your opponent to bite the poisoned square. The first player has a proven winning strategy — but only perfect play finds it.',
  },

  breakthrough: {
    objective: 'Race your pawns across the board and break through to the far row.',
    howToPlay: [
      'Each side starts with two full rows of pawns.',
      'A pawn moves one square straight or diagonally forward into an empty square.',
      'A pawn captures one square diagonally forward — there are no backward moves.',
      'First pawn to reach the opposite home row wins; wiping out every enemy pawn also wins.',
    ],
    win: 'Reach the far row with any pawn, or capture all of the opponent’s pawns. A player with no legal move loses. Draws are impossible.',
  },

  ataxx: {
    objective: 'Infect the board — clone your pieces and convert every enemy next to them.',
    howToPlay: [
      'Move one of your pieces one square (it clones, original stays) or two squares (it jumps, original vacates).',
      'Every enemy piece directly adjacent to where you land is converted to your color.',
      'Convert at least one piece and you get another turn.',
      'You must move if you can; with no legal move you sit out while your opponent plays on.',
    ],
    win: 'When no moves remain, the larger territory wins. You also win instantly by eliminating every enemy piece.',
  },

  kamisado: {
    objective: 'Race your towers to the far row — but your landing square dictates the color your opponent must move.',
    howToPlay: [
      'The 8×8 board is a mosaic of 8 colors; each player owns one tower of every color.',
      'On your turn move the tower matching the color of the square your opponent just landed on (first move: any tower).',
      'Towers glide any number of squares straight or diagonally FORWARD only — never sideways or back.',
      'Land on the color that strands your rival’s matching tower behind a wall of blockers.',
    ],
    win: 'First tower to reach the opponent’s home row wins the round. Best of three rounds takes the match.',
  },

  onitama: {
    objective: 'Capture the enemy master — or land your own on their temple. The catch: every card you play is handed to your opponent.',
    howToPlay: [
      'Five movement cards are dealt: two to each player, one face-up spare. Each card shows a movement pattern.',
      'Pick one of your two cards, then move any of your pieces per its pattern — patterns are read from YOUR side of the board.',
      'Land on an enemy piece to capture it. Your played card now becomes their card: the spare swaps into your hand.',
      'No two games play the same — the same five cards serve both sides, rotated 180°.',
    ],
    win: 'Capture the enemy master, or march your master onto the temple square at the center of their home row.',
  },

  quarto: {
    objective: 'Line up four pieces that share ONE attribute — but you never pick your own piece: you give it to your rival.',
    howToPlay: [
      '16 pieces, each with 4 attributes: tall/short, round/square, hollow/solid, light/dark.',
      'On your turn PLACE the piece you were handed on any empty cell, then hand your opponent any shelf piece.',
      'Four pieces in a row, column or diagonal win if all four share ANY one attribute.',
      'The skill: hand over a piece that is useless to them — never one that completes their line.',
    ],
    win: 'Complete a shared-attribute line of four. If the last piece is placed with no line, the game is a draw.',
  },

  santorini: {
    objective: 'Climb to the third level of the island — or wall your rival in so completely they cannot move.',
    howToPlay: [
      'Each player commands two workers on a 5×5 island of rising towers.',
      'Your turn: MOVE one worker to any of its 8 neighboring squares (climb at most one level up, any number down), then BUILD one level on any adjacent square.',
      'You may build under your own worker. Towers cap at 4 levels — a dome — and nothing moves onto or builds on a dome.',
      'Cut off space: every square they could move to or build on is gone, and they lose.',
    ],
    win: 'A worker standing on level 3 wins instantly. If the opponent has no legal move+build at the start of their turn, they lose.',
  },

  loa: {
    objective: 'Unite all your checkers into one connected group — moving exactly as far as the line is crowded.',
    howToPlay: [
      'A checker moves in a straight line (row, column or diagonal) EXACTLY as many squares as there are checkers of either color on that entire line.',
      'You may jump over your own checkers, never over an enemy. Land on an enemy checker to capture it.',
      'Count before you move: a crowded line means a long stride; an empty one means a single step.',
    ],
    win: 'First player whose remaining checkers all form one orthogonally/diagonally connected group wins. If both connect on the same move, the mover wins.',
  },

  yavalath: {
    objective: 'Make FOUR in a row before you accidentally make THREE — the game where winning lines are forbidden at 3.',
    howToPlay: [
      'Players alternate placing stones on a hexagonal board.',
      'Four or more of your stones in a straight hex line WINS.',
      'Three in a row LOSES — instantly, even if you were forced to play it.',
      'Threaten a 4 to force your rival to extend your line to 3, or block forever.',
    ],
    win: 'First 4-in-a-row wins; first 3-in-a-row loses. A full board with no result is a draw.',
  },
}

// Returns the rules object for a game type, or null if none is defined.
export function getRules(type) {
  return GAME_RULES[type] ?? null
}
