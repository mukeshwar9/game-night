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
    objective: 'Out-eat your rival in one shared maze while three ghosts hunt you both.',
    howToPlay: [
      'Steer with the on-screen pad, a swipe anywhere on the maze, the arrow keys or WASD. A turn you press early waits for the next junction.',
      'Pellets are shared: whoever bites first gets the points (10, power pellets 50).',
      'A power pellet turns the ghosts blue and powers you up for 6 seconds: eat ghosts for 100 / 200 / 300, or bump your rival to gobble them for 200.',
      'When your rival is powered, the maze flashes RUN! — keep away until it wears off.',
      'Caught by a ghost? You respawn at your corner two seconds later, briefly shielded.',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'Most points when the maze is cleared or the 90-second clock runs out wins the round. A tie is a draw. First to 3 rounds wins the match.',
  },

  pong: {
    objective: 'Send the ball past your opponent’s paddle to score.',
    howToPlay: [
      'Drag anywhere to move your paddle (it chases your finger), or use ↑/↓ · W/S — ←/→ · A/D when the court is upright.',
      'Where the ball strikes your paddle sets the return angle; moving the paddle as you hit curves the ball. Every rally hit speeds it up.',
      'Knock the ball through lettered power-ups: + BIG PADDLE, - SHRINK RAY (opponent), S SLOW-MO, T TURBO, M MULTI-BALL, W GOAL WALL (blocks one goal).',
      'Modes: CLASSIC (first to 7), CHAOS (more power-ups plus moving bumpers), PURE (no power-ups), BLITZ (60-second clock, a tie goes to sudden death).',
      'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
    ],
    win: 'Win the round by the mode’s rule (first to 7, or most points when the BLITZ clock ends); the host picks how many rounds win the match.',
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
    objective: 'As the guesser, uncover the hidden word before six wrong letters hang her.',
    howToPlay: [
      'Players take turns as word-keeper. The keeper secretly locks in one real word of 4+ letters, plus an optional hint that may not contain the word. The ANY WORD house rule allows names and phrases of 3–30 letters. The word never reaches the server until the reveal.',
      'The guesser picks one letter at a time and waits for it to be checked. Six wrong letters and she hangs.',
      'After the reveal either player can start the next round; it also starts on its own after 8 seconds.',
      'Stalling loses the round: no word within 2 minutes, a guess left unchecked for 60 seconds, 60 seconds without a guess, or 10 seconds offline lets the other player claim it.',
    ],
    win: 'Guess the word to win the round; if she hangs, the word-keeper wins it. First to 3 round wins takes the match once both players have set the same number of words. A tie after equal turns goes to sudden death.',
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
      'Missed part of it? WATCH AGAIN replays it once per turn, and your recall timer restarts after the replay.',
      'Repeat the sequence correctly, then add one new pad to pass it back.',
    ],
    win: 'Tap a wrong pad and you lose — the full sequence is then shown with the missed step marked. The last player to recall the growing sequence wins.',
  },

  chimp: {
    objective: 'Remember the positions of numbered tiles and tap them in order.',
    howToPlay: [
      'Numbers appear on a 5×5 grid; they hide when the timer bar runs out or when you tap 1.',
      'Tap the cells in ascending numeric order from memory.',
      'Both players race the same layout at once. When you both clear it, the next level adds another number.',
    ],
    win: 'One wrong tap ends your run — the board then shows where every number was. Outlast your opponent to win.',
  },

  numbermemory: {
    objective: 'Recall a growing sequence of digits.',
    howToPlay: [
      'A number flashes on screen (longer numbers stay up longer), then disappears.',
      'Both players type the digits back from memory at the same time.',
      'If you both get it right, the next round adds another digit.',
    ],
    win: 'Get it right when your opponent misses and you win. If you both miss, whoever typed more correct digits from the start wins; an exact tie replays the round with a new number of the same length.',
  },

  reaction: {
    objective: 'React faster than everyone else across four rounds (2–8 players).',
    howToPlay: [
      'Wait for the screen to turn green — don’t jump early.',
      'Tap the instant it changes; your reaction time is recorded.',
      'Play four rounds. Everyone gets the same random waits, so nobody gets an easier start.',
    ],
    win: 'Lowest average reaction time wins the round. First to 3 round wins takes the match.',
  },

  aim: {
    objective: 'Hit as many targets as you can in 30 seconds (2–8 players).',
    howToPlay: [
      'Targets appear one at a time — tap each as quickly as possible.',
      'Everyone races through the same sequence of targets.',
      'A tap on empty arena costs a point, so don’t spray.',
    ],
    win: 'Highest score when the 30 seconds run out wins the round. First to 3 round wins takes the match.',
  },

  typing: {
    objective: 'Type the passage faster and more accurately than everyone else (2–8 players).',
    howToPlay: [
      'Everyone types the same passage as quickly and accurately as possible.',
      'Everyone’s progress shows live in the results table as you race.',
      'Anyone still typing when the time limit hits is marked DNF.',
    ],
    win: 'Highest effective WPM (speed × accuracy) wins the round. First to 3 round wins takes the match.',
  },

  math: {
    objective: 'Solve as many problems as you can in a two-minute blitz (2–8 players).',
    howToPlay: [
      'Answer arithmetic questions one after another at your own pace.',
      'Everyone gets the same questions. Correct answers build your score and streak.',
    ],
    win: 'Highest score when the two-minute clock runs out wins the round. First to 3 round wins takes the match.',
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

  gomokuswap: {
    objective: 'Be the first to get five of your stones in a row — with a swap rule that keeps the opening fair.',
    howToPlay: [
      'Take turns placing a stone on any empty point of the 15×15 board.',
      'Right after the very first stone, the other player may tap SWAP instead of placing: that stone becomes theirs and the opener moves again.',
      'So open with a stone you would be equally happy to keep or to give away.',
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
      'Swap rule: right after the first stone, the other player may tap SWAP instead of placing — the opening stone becomes theirs, mirrored onto their own edges, and the opener moves again.',
    ],
    win: 'First chain linking your two edges wins. Draws are mathematically impossible.',
  },

  minesweeper: {
    objective: 'Clear the identical seeded minefield faster than everyone else (2–8 players).',
    howToPlay: [
      'Everyone sweeps the SAME 12×12 board with 22 hidden mines, simultaneously.',
      'Tap to reveal a cell; numbers show adjacent mines; zeros flood-fill.',
      'Long-press, press F on the focused cell, or toggle FLAG mode to mark suspected mines — flags are private.',
      'Tap a satisfied number to chord-reveal its remaining neighbors.',
      'Hit a mine and you’re out of the round, ranked below everyone still sweeping.',
    ],
    win: 'Fastest to reveal all 122 safe cells wins the round. First to 3 round wins takes the match.',
  },

  herd: {
    objective: 'Answer like the majority — and avoid becoming the odd one out.',
    howToPlay: [
      '3–8 players. Each round everyone secretly answers the same prompt before the timer runs out (45s; the room\'s timer setting can stretch it or turn it off). Answers stay hidden until the reveal.',
      'Answers that mean the same thing group together — plurals, spacing, hyphens, "a"/"the" and "&"/"and" don\'t matter (cherries = cherry, hot-dog = hot dog).',
      'Every member of the biggest group(s) scores a point. If nobody matched, nobody scores.',
      'If exactly one player matched nobody, they are stuck with the Pink Cow. The Cow holder cannot win — shed it before you reach 8 points.',
      'With timers on, the reveal moves on by itself after 10 seconds — or tap NEXT PROMPT NOW.',
    ],
    win: 'The match ends when a player without the Pink Cow reaches 8 points. Highest score wins; players tied on the top score share the win.',
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
    objective: 'Catch your opponent’s lie more often than they catch yours.',
    howToPlay: [
      'Every round both players secretly write three statements about themselves — two truths and one lie — and mark the lie (3 minutes).',
      'Then both read the other’s statements and lock in a guess at the lie (1 minute). Tap to select, then LOCK GUESS.',
      'Both lies are revealed together. Catching your opponent’s lie scores 1 point. If a revealed lie doesn’t match what was locked in, that player’s catch doesn’t count and the other player gets the point.',
    ],
    win: 'First to 3 points with the lead wins. Tied at 3 or more? Keep playing rounds until someone leads.',
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
    objective: 'Team guessing — read the clue-giver’s mind to land near a hidden target on a spectrum.',
    howToPlay: [
      '3–8 players. Each round one player is the clue-giver and sees a hidden target on a 0–100 dial between two opposites. Nobody else can see it.',
      'The clue-giver has 90 seconds to give a one-word clue that points at the target — no numbers, and not either word on the dial.',
      'Everyone else has 60 seconds to move the dial to where they think the target is. The room timer setting stretches or turns off these clocks.',
      'A clue-giver who runs out of time or leaves is skipped — the clue passes to the next player on a fresh pair. Pairs don’t repeat in a room until the deck runs out.',
    ],
    win: 'Guessers score up to 50 for landing close to the target (bullseye = 50); the clue-giver scores the average of their guessers’ scores. The role rotates each round. First to 200 wins — if several players pass 200 in the same round, the highest score wins, and an exact tie is shared.',
  },

  fibbage: {
    objective: 'Fool others with fake answers while finding the real one.',
    howToPlay: [
      '3–8 players. Everyone sees a trivia prompt with a missing answer.',
      'You have 60 seconds to write a believable fake answer (a lie). Lies that are really the truth — a different spelling, a typo, the same number — are refused.',
      'All lies are shuffled in with the truth and shown in capitals. You have 45 seconds to vote for the answer you think is real.',
      'The answers stay up for 10 seconds (or until everyone is READY), then the next prompt starts. The room timer setting stretches or turns off these clocks.',
    ],
    win: 'Score 1,000 for finding the truth and 500 for every player your lie fools. A match is 5 prompts and the last one scores double. Highest total wins; an exact tie is shared.',
  },

  arrows: {
    objective: 'Race your rival to clear the same arrow board first.',
    howToPlay: [
      'You and your rival each get an identical board of snake-shaped arrows and play at the same time.',
      'Tap an arrow to send it sliding off the board along the way its head points.',
      'It only leaves if nothing is in its path — tap a blocked arrow and it bumps, flashes red and costs a life.',
      'Clear the arrows that are in the way first. You have 3 lives per round.',
    ],
    win: 'First to clear their whole board wins the round; running out of lives loses it. Boards get bigger each round (easy, medium, hard) — win 2 of the 3 to take the match.',
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
    objective: "Crack your opponent's secret 5-letter word in fewer guesses than they need to crack yours.",
    howToPlay: [
      'Each player picks a secret 5-letter word. Only a salted commitment is shared, so nobody can peek or swap words.',
      'You guess at the same time — you at their word, they at yours. Green: right letter, right spot. Yellow: right letter, wrong spot. Gray: not in the word.',
      'You get up to 6 guesses. Once one player finishes, the other has 90 seconds to finish too.',
      'At the end both words are revealed and every mark is checked against them.',
    ],
    win: 'Solve in fewer guesses than your opponent to win the round; on equal guesses the faster solve wins. Both fail: draw. First to 3 round wins takes the match.',
  },

  wordcoop: {
    objective: 'Solve one secret 5-letter word together in six guesses or fewer.',
    howToPlay: [
      'You and your partner share one board and take turns entering guesses.',
      'Green means right letter and spot. Yellow means the letter is elsewhere. Gray means it is absent.',
      'Your partner sees every clue, so talk through each row and plan the next guess together.',
      'If your partner is offline for 20 seconds you can keep playing solo. Your streak, best streak and losses carry over between words.',
    ],
    win: 'Guess the word before all six rows are used. You both win or lose together.',
  },

  lanterns: {
    objective: 'Work together to light five rows of lanterns, each climbing from 1 to 5, while holding cards you can never see.',
    howToPlay: [
      'Each of you holds five cards facing away from you: you see your partner\'s hand, never your own. Every suit has three 1s, two each of 2, 3 and 4, and a single 5.',
      'On your turn, do one thing. CLUE: tap a partner card and name its suit or its number; every matching card in their hand gets marked, and the rest learn what they are not. A clue costs one of 8 clue tokens.',
      'DISCARD one of your cards to win back a clue token (not while all 8 are in hand). PLAY one of your cards onto its suit\'s row: it must be exactly the next number, or a fuse burns and the card is lost.',
      'After a play or discard you draw a new card into the left of your hand. Finishing a row with a 5 returns a clue token. SHORT mode uses four suits (max 20) for a quicker evening.',
    ],
    win: 'The evening ends after three burnt fuses, a perfect table, or one last turn each once the deck runs out. Your score is the sum of the row tops. 20 of 25 (16 of 20 in SHORT) earns a team star for both of you.',
  },

  docking: {
    objective: 'Fly a capsule into the station port together within six burns: the Commander (X) and the Engineer (O) each place secret dice on one shared console.',
    howToPlay: [
      'Each burn starts with talk. Plan freely, then both tap READY: you each roll four dice that only you can see. From then until the burn ends, no talking.',
      'Take turns placing one die at a time. ATTITUDE and THRUST each need one die from both of you. Commander minus Engineer on attitude tilts the capsule (past 3 either way it spins out). The thrust total closes the distance: 4 or less holds, 5 to 8 closes 1, 9 or more closes 2.',
      'Spare dice can clear DEBRIS (two slots a burn; the die must equal a marker\'s value), arm your own SWITCHES (exact value; each armed switch raises the docking limit by 1), bank COOLANT (a token lets any later die move by 1), or be vented.',
      'Flying onto or past uncleared debris loses, so clear the lane before you close in. Pick CADET, PILOT or ACE for a longer approach with more debris.',
    ],
    win: 'Dock on the burn that closes the last distance, with the capsule level (tilt 0) and thrust at or under the docking limit. You both win or lose together; a docking earns a team star for both of you.',
  },

  password: {
    objective: 'Work as a team: give one-word clues so your partner guesses the secret password, then swap roles. Every point counts for both of you.',
    howToPlay: [
      'One player sees the secret password; the other sees only its length. Roles swap every round for 12 rounds, so you each guess 6 times.',
      'The clue-giver has 45 seconds for each one-word clue (3+ letters, no numbers, nothing that spells or reshapes the password). A clue that runs out of time is lost as a miss.',
      'The guesser gets one guess per clue: 30 seconds for the first two, 25 for the next two, then 20. Plurals, US/UK spellings and one typo in longer words still count.',
      'Guessing on clue 1, 2, 3, 4 or 5 adds 5, 4, 3, 2 or 1 points to your team score.',
    ],
    win: 'After 12 rounds your team score (out of 60) earns stars: ★ 20, ★★ 30, ★★★ 40. If your partner is offline for 30 seconds, you can end the match early with the score so far.',
  },

  wordrace: {
    objective: 'Race your opponent to solve the same hidden 5-letter word.',
    howToPlay: [
      'Both players get the same word and can guess at the same time.',
      'Green means right letter and spot, yellow means right letter in another spot, and gray means absent.',
      'You get up to 6 guesses. During play you only see how many rows your opponent has used, the greens in their best row, and whether they solved.',
      'After the first solve the other player has 30 seconds to finish (60 seconds after a fail). The next round starts by itself a few seconds after the reveal.',
    ],
    win: 'Solve when your opponent fails, use fewer guesses, or solve faster on an equal guess count. Both misses draw. First to 3 round wins takes the match.',
  },

  wordhunt: {
    objective: 'Trace more valid words than your opponent on a shared 4×4 letter grid before time runs out.',
    howToPlay: [
      'Both players press READY; the 80-second clock starts once both are ready, on the same grid.',
      'Drag across adjacent tiles (including diagonals) to spell a word — drag back onto the previous tile to undo — or type it in the box and press Enter.',
      'Words must be 3+ letters and can’t reuse a tile in the same word. The Qu tile counts as two letters.',
      'Both players can score the same word — there’s no penalty for overlapping finds. After the round you see the best words nobody found.',
    ],
    win: 'Longer words score more (3–4 letters = 1 point, up to 11 for 8+). Most points when time runs out wins; equal points go to whoever found more words, then the longer longest word; otherwise a draw. First to 3 round wins takes the match.',
  },

  anagrams: {
    objective: 'Score more points than your opponent from the same seven-letter rack.',
    howToPlay: [
      'Each rack opens after a 3-2-1 countdown; the next rack deals itself a few seconds after the reveal.',
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
      '3–8 players. Everyone shares a secret location and a role — except the spy, who knows neither. The spy changes every round: nobody is spy twice in a row, and players who haven’t been spy yet are the likeliest pick.',
      'Ask each other questions (out loud or in chat) to expose who doesn’t know the location, without giving it away. Anyone can open the list of possible locations.',
      'Once, during questioning or the vote, the spy may reveal themselves and guess the location — that ends the round: a right guess wins it for the spy, a wrong guess loses it.',
      'When time runs out, everyone votes on who they think is the spy.',
    ],
    win: 'The player with the most votes is accused. If that’s the spy, everyone else scores a point; if it’s someone else — or there’s a tie for most votes — the spy scores. First to 3 round wins takes the match.',
  },

  headsup: {
    objective: 'Guess as many words as you can while your friends act them out — then act for them.',
    howToPlay: [
      '3–8 players, made for a video call. Each turn one player is the guesser; their screen shows only a timer and GOT IT / PASS.',
      'Everyone else sees the word on their own screen and acts it out or describes it — without saying the word.',
      'Tap GOT IT when the guesser says it, or PASS to skip to the next word. Anyone can tap.',
      'A turn lasts 60 seconds (the room’s timer setting can double it or turn it off). The host picks the category before the match.',
    ],
    win: 'The guesser scores a point for every word they get. Everyone guesses twice in a group of 3–4, once in a bigger group — most points wins, ties share the win.',
  },

  chameleon: {
    objective: 'Give a clue that proves you know the secret word without giving it away — or, as the Chameleon, bluff your way through.',
    howToPlay: [
      '3–8 players. Everyone sees the same topic card of 16 words. All but one player also see which word is secret; that one player is the Chameleon.',
      'In turn, each player types one short clue related to the secret word. Too obvious and the Chameleon learns the word; too vague and you look like the Chameleon.',
      'Then everyone votes for who they think the Chameleon is.',
      'If the Chameleon is caught, they get one guess at the secret word to steal the round.',
    ],
    win: 'Chameleon not caught (or a tied vote): Chameleon +2. Caught but guesses the word: Chameleon +1. Caught and wrong: everyone else +2. First to 5 points wins.',
  },

  codewords: {
    objective: 'Lead your team to all of its secret agents on a 5×5 grid of words before the other team finds theirs — and never touch the assassin.',
    howToPlay: [
      '4–8 players in two teams, ▲ ALPHA and ● BRAVO. Each team has one spymaster (★) who sees the secret key; spymasters rotate every board. The host can shuffle teams or move players in the lobby.',
      'On your turn your spymaster gives a ONE-word clue and a number — how many cards it points to. The clue can’t be (or contain) a word on the board.',
      'Guessers tap a card to point at it (teammates see who is pointing where), then tap it again — or GUESS — to lock it in. You get up to number + 1 guesses.',
      'Your own agent: keep guessing. A bystander or the other team’s agent ends your turn. After at least one guess you may END TURN.',
      'Every revealed card is checked against a commitment published before play, so nobody can change the key mid-game.',
    ],
    win: 'A team wins the moment all of its agents are uncovered (the starting team has 9, the other 8) — even if the rivals uncover the last one. Touch the assassin and your team loses on the spot.',
  },

  justone: {
    objective: 'Work together to get the guesser to say as many mystery words as possible, one clue each.',
    howToPlay: [
      '3–8 players, all on one team. Each card, one player is the guesser (it rotates); everyone else sees the mystery word.',
      'Each clue-giver secretly writes ONE one-word clue. Clues stay hidden until everyone is in.',
      'Identical or near-identical clues cancel each other out — case, plurals and simple word endings don’t count as different. A clue that is the mystery word is removed too.',
      'The guesser sees only the surviving clues and gets one guess — or can pass.',
    ],
    win: 'Co-op: 13 cards, one team score. A right guess scores 1, a pass scores 0, and a wrong guess also throws away the next card (on the last card it costs a point instead). 13 is perfect.',
  },

  sketch: {
    objective: 'One player draws a secret word while everyone else races to guess it in chat.',
    howToPlay: [
      '2–8 players. Each round, one player is the artist and picks a secret word from 3 options: EASY, MEDIUM or HARD.',
      'The artist draws it on the shared canvas — no letters or numbers in the drawing.',
      'Everyone else types guesses — the word length is shown as blanks. Plurals, spacing and hyphens don\'t matter, and some words also accept a short form ("bath" for "taking a bath").',
      'A near miss shows you a private CLOSE! hint and stays out of the chat.',
      'Guessing correctly locks you in early and reveals the word to you — keep it secret from the others still guessing.',
    ],
    win: 'Guessers score by how fast they guess correctly; the artist scores per correct guesser. MEDIUM words pay ×1.2 and HARD words ×1.5. Everyone draws twice (three times in a 2-player match) — most total points wins, ties share the win.',
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
