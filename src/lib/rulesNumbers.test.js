import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { GAME_RULES } from './rules'
import { matchTargetFor } from './matchRules'
import { RACE_MATCH_WINS } from './raceLogic'
import { CF_COLS, CF_ROWS, CF5 } from './connectFourLogic'
import { TTT4_SIZE, TTT4_CELL_COUNT } from './tictactoe4Logic'
import { UT_BOARD_COUNT } from './ultimateTttLogic'
import {
  PELLET_PTS, POWER_PTS, POWER_S, GHOST_PTS, RIVAL_PTS, ROUND_SECONDS as PACMAC_ROUND_S, RESPAWN_S,
} from './pacmacLogic'
import { MODES as PONG_MODES } from './pongLogic'
import { WIN_SCORE as SNAKE_MATCH_WINS } from './snakeLogic'
import {
  MAX_WRONG, MIN_DICTIONARY_LETTERS, MIN_ANY_WORD_LETTERS, MAX_WORD_LETTERS, AUTO_ADVANCE_MS,
  SETTING_DEADLINE_MS, GRADING_STALL_MS, GUESSER_IDLE_MS, PRESENCE_GRACE_MS,
} from './hangmanLogic'
import { dbConfig, DB_SIZE, DB_SIZE_CLASSIC } from './dotsAndBoxesLogic'
import { SOS_SIZE } from './sosLogic'
import { CHIMP_GRID } from './chimpLogic'
import { ROUNDS as REACTION_ROUNDS } from './reactionLogic'
import { AIM_GAME_MS } from './aimLogic'
import { DUEL_MS, ROT_PENALTY, STUN_MS, HARVEST_MS, HARVEST_TARGET_PER_PLAYER, TEAM_HEARTS, comboGain } from './pulpLogic'
import { STREAK_FOR_DOUBLE } from './mathLogic'
import { VM_START_LEVEL, VM_MAX_SIDE, VM_RECALL_MS, vmGridSide } from './visualMemoryLogic'
import { GOMOKU_SIZE, GOMOKU_WIN_RUN } from './gomokuLogic'
import { REVERSI_DIM } from './reversiLogic'
import { OC_SIZE, OC_RUN } from './orderChaosLogic'
import { PIG_TARGET } from './diceLogic'
import { FLEET_SPEC, SHIP_CELLS } from './battleshipLogic'
import { INITIAL_PITS } from './mancalaLogic'
import { WIN_SCORE as AIRHOCKEY_WIN } from './airhockeyLogic'
import { STROKE_CAP, PICKUP_SCORE } from './minigolfLogic'
import { ARCHERY_FORMATS, ARROWS_PER_END } from './archeryLogic'
import { ROT_STEPS, TURN_MS as STACK_TURN_MS } from './animalStackLogic'
import { heartsFor } from './animalStackCore'
import { HEX_SIZE } from './hexLogic'
import { ROWS as MINES_ROWS, COLS as MINES_COLS, MINES, SAFE_CELLS } from './minesweeperLogic'
import { HERD_TARGET, ANSWER_MS as HERD_ANSWER_MS, REVEAL_ADVANCE_MS as HERD_REVEAL_MS } from './herdLogic'
import { MATCH_QUESTIONS, QUESTION_MS as TRIVIA_QUESTION_MS, BASE_POINTS, SPEED_POINTS, STREAK_CAP } from './triviaLogic'
import {
  STATEMENT_COUNT, DEFAULT_MATCH_TARGET as TWO_TRUTHS_TARGET, WRITING_DEADLINE_MS, GUESSING_DEADLINE_MS,
} from './twoTruthsLogic'
import {
  WAVELENGTH_MAX_SCORE, WAVELENGTH_WIN_SCORE, WAVELENGTH_CLUE_MS, WAVELENGTH_GUESS_MS,
} from './wavelengthLogic'
import {
  POINTS_FOR_TRUTH, POINTS_PER_FOOL, FIBBAGE_LIE_MS, FIBBAGE_VOTE_MS, FIBBAGE_REVEAL_ADVANCE_MS,
  MATCH_PROMPTS, FINAL_MULTIPLIER as FIBBAGE_FINAL_MULTIPLIER,
} from './fibbageLogic'
import { ARROWS_LIVES, ARROWS_MATCH_TARGET, ARROWS_MAX_ROUNDS } from './arrowsLogic'
import { ARROWS_LEVEL_COUNT } from './arrowsLevelsLogic'
import {
  SUMMIT_M, ROUND_LIMIT_MS as UPDRAFT_ROUND_MS, COOP_GOAL_M, GATE_EVERY, UNITS_PER_M, COOP_LIMIT_MS,
} from './updraftLogic'
import { MATCH_TARGET as UPDRAFT_MATCH_TARGET, COOP_LIVES } from './updraftConfig'
import { ROUND_CAP_S, HITS_WIN_MARGIN, SHIP_MAX_HP } from './spaceduelLogic'
import { GRID_W as PAINT_W, GRID_H as PAINT_H, MATCH_SECONDS as PAINT_SECONDS, ENEMY_SLOW_MULT, MATCH_TARGET as PAINT_MATCH_TARGET } from './paintLogic'
import { CR_COLS, CR_ROWS, CR_COLS_CLASSIC, CR_ROWS_CLASSIC, criticalMass } from './chainReactionLogic'
import { BK_WALLS_PER_PLAYER } from './blockadeLogic'
import { MAX_GUESSES as DUEL_GUESSES, WORD_LENGTH as DUEL_WORD_LENGTH, MATCH_WINS as DUEL_MATCH_WINS, DUEL_FINISH_GRACE_MS } from './wordduelLogic'
import { MAX_GUESSES as COOP_GUESSES, WORD_LENGTH as COOP_WORD_LENGTH, PARTNER_OFFLINE_SOLO_MS } from './wordcoopLogic'
import { HUNCH_MAX_CARD, HUNCH_TARGET_LEVEL, HUNCH_START_LIVES, dealLevel } from './hunchLogic'
import { CONVERGE_CHAINS, CONVERGE_MAX_STEPS, starsFor as convergeStars } from './convergeLogic'
import { MODES as LANTERN_MODES, COPIES, HAND_SIZE, MAX_CLUES, MAX_FUSES, WIN_SHARE } from './lanternsLogic'
import { MAX_BURNS, DICE_PER_SEAT, MAX_TILT, DEBRIS_SLOTS, moveFor, dockLimit } from './dockingLogic'
import { countFace } from './bluffLogic'
import {
  MAX_ROUNDS as PASSWORD_ROUNDS, CLUE_POINTS, MAX_TEAM_SCORE, STAR_THRESHOLDS, GUESS_SECONDS, CLUE_SECONDS,
  PARTNER_OFFLINE_MS, MIN_CLUE_LENGTH,
} from './passwordLogic'
import { MAX_STRIKES } from './wireLogic'
import { STRIKE_PENALTY_MS, SHORT_FUSE_PENALTY_MS, BLACKOUT_EVERY_MS, BLACKOUT_MS } from './wire/modifiers'
import { GAUGE_START, GAUGE_AMBER_AT, GAUGE_VALVES } from './wire/modules/gauge'
import { STRIP_SWITCH_MS } from './wire/modules/lever'
import { MODES as WIRE_MODES } from './wire/modes'
import { MAX_GUESSES as WORDLE_GUESSES } from './wordcoopLogic'
import { MATCH_TARGET as WORDRACE_MATCH, FINISH_GRACE_MS, DONE_GRACE_MS } from './wordraceLogic'
import { ROUND_MS as HUNT_ROUND_MS, MIN_WORD_LENGTH as HUNT_MIN_LEN, MATCH_WINS as HUNT_MATCH_WINS, scoreWord as huntScore } from './wordhuntLogic'
import {
  RACK_SIZE, MIN_WORD_LENGTH as ANAGRAM_MIN_LEN, ROUND_MS as ANAGRAM_ROUND_MS, COUNTDOWN_MS as ANAGRAM_COUNTDOWN_MS, scoreWord as anagramScore,
} from './anagramsLogic'
import { MATCH_TARGET as ANAGRAMS_MATCH_TARGET } from './anagramsConfig'
import { SPYFAIR_MATCH_WINS } from './spyfairLogic'
import { HU_TURN_SECONDS, turnsPerPlayer } from './headsUpLogic'
import { CHAMELEON_GRID, CHAMELEON_MATCH_POINTS, POINTS_ESCAPED, POINTS_STOLEN, POINTS_CAUGHT } from './chameleonLogic'
import { CW_COLS, CW_SIZE, CW_START_CARDS, CW_OTHER_CARDS } from './codeWordsLogic'
import { JO_CARDS, applyOutcome as justOneOutcome } from './justOneLogic'
import { TIER_MULTIPLIERS, cyclesFor } from './sketchLogic'
import { PAIRS_SIZE, PAIRS_TOTAL_PAIRS, PAIRS_QUICK_SIZE, PAIRS_QUICK_CELL_COUNT, PAIRS_CELL_COUNT, pairsClinch } from './pairsLogic'
import { VB_LIVES } from './verbalMemoryLogic'
import { NB_CELLS, NB_LIVES, NB_BLOCK, startNBack } from './nBackLogic'
import { SOLO_LIVES } from './memorySoloLogic'
import { KIM_CHOICES } from './kimsGameLogic'
import { SPLIT_LIVES } from './splitSignalLogic'
import { SIM_DOTS, SIM_EDGE_COUNT } from './simLogic'
import { CHOMP_COLS, CHOMP_ROWS } from './chompLogic'
import { KM_SIZE, KM_COLORS } from './kamisadoLogic'
import { QRT_PIECE_COUNT, QRT_ATTR_NAMES, QRT_SIZE } from './quartoLogic'
import { ST_SIZE, ST_MAX_LEVEL, neighbors as stNeighbors } from './santoriniLogic'

// Every number a HOW TO PLAY sheet states (src/lib/rules.js) must be backed by
// the code that enforces it. Players read these sheets as the contract, and a
// rule that says one thing while the game does another reads as a rigged game
// (the competitor review found the most-upvoted complaints about JindoBlu's
// Two Player Games were exactly this: wrong win counts and wrong move rules).
//
// Each game lists `checks`: [number as written, value from the code]. Every
// digit in the game's sheet must appear among its checks or in `prose`
// (numbers that are not game parameters, like "180°" or a 3-2-1 countdown),
// so a new number in a sheet without a matching check fails here.

// games.js pulls in board components that touch `localStorage` at module
// load time — stub it before the dynamic import (see games.test.js).
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let GAME_TYPES
beforeAll(async () => {
  ;({ GAME_TYPES } = await import('./games'))
})

const cfg = (type) => GAME_TYPES.find(g => g.type === type)
const side = (type) => Math.sqrt(cfg(type).boardSize)
const first = (type) => matchTargetFor({ gameType: type })
const secs = (ms) => ms / 1000
// Numeric constants that live only in a page component (pages pull in
// Firebase and React, so the test reads the source instead of importing it).
const pageConst = (file, name) => {
  const src = readFileSync(new URL(`../pages/${file}`, import.meta.url), 'utf8')
  const m = src.match(new RegExp(`const ${name} = ([\\d_.]+)`))
  if (!m) throw new Error(`${name} not found in ${file}`)
  return Number(m[1].replace(/_/g, ''))
}
// "2–8 players" is the registry's player range.
const players = (type, lo, hi) => [[lo, cfg(type).minPlayers], [hi, cfg(type).maxPlayers]]

// Numbers as written: "1,000" is 1000, "1.2" stays a decimal.
function numbersIn(rules) {
  const text = [rules.objective, ...rules.howToPlay, rules.win].join(' ')
  return (text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) || []).map(n => Number(n.replace(/,/g, '')))
}

const RULE_NUMBERS = {
  tictactoe: () => ({ checks: [[3, side('tictactoe')]] }),
  tictactoe4: () => ({ checks: [[4, TTT4_SIZE], [16, TTT4_CELL_COUNT]] }),
  connectfour: () => ({ checks: [[7, CF_COLS], [6, CF_ROWS], [4, 4]] }),
  ultimatettt: () => ({ checks: [[3, Math.sqrt(UT_BOARD_COUNT)]] }),
  connectfourpop: () => ({ checks: [[7, CF_COLS], [6, CF_ROWS]] }),
  connectfour5: () => ({ checks: [[9, CF5.cols], [7, CF5.rows], [5, CF5.winRun]] }),
  pacmac: () => ({
    checks: [
      [10, PELLET_PTS], [50, POWER_PTS], [6, POWER_S],
      [100, GHOST_PTS[0]], [200, GHOST_PTS[1]], [300, GHOST_PTS[2]], [200, RIVAL_PTS],
      [90, PACMAC_ROUND_S], [3, first('pacmac')],
    ],
  }),
  pong: () => ({
    checks: [[7, PONG_MODES.classic.winScore], [60, PONG_MODES.blitz.timeLimit]],
  }),
  snake: () => ({ checks: [[3, SNAKE_MATCH_WINS], [3, first('snake')]], prose: [180] }),
  hangwoman: () => ({
    checks: [
      [4, MIN_DICTIONARY_LETTERS], [3, MIN_ANY_WORD_LETTERS], [30, MAX_WORD_LETTERS],
      [8, secs(AUTO_ADVANCE_MS)], [2, secs(SETTING_DEADLINE_MS) / 60], [60, secs(GRADING_STALL_MS)],
      [60, secs(GUESSER_IDLE_MS)], [10, secs(PRESENCE_GRACE_MS)], [3, first('hangwoman')],
      [6, MAX_WRONG],
    ],
  }),
  dotsandboxes: () => {
    const c = dbConfig(DB_SIZE)
    return {
      checks: [[36, c.boxCount], [6, Math.sqrt(c.boxCount)], [4, 4], [19, c.clinch], [18, c.boxCount / 2]],
    }
  },
  dotsandboxes4: () => {
    const c = dbConfig(DB_SIZE_CLASSIC)
    return {
      checks: [[16, c.boxCount], [4, Math.sqrt(c.boxCount)], [9, c.clinch], [8, c.boxCount / 2]],
    }
  },
  sos: () => ({ checks: [[7, SOS_SIZE]] }),
  simon: () => ({ checks: [] }),
  chimp: () => ({ checks: [[5, Math.sqrt(CHIMP_GRID)]], prose: [1] /* "tap 1": the first tile */ }),
  numbermemory: () => ({ checks: [] }),
  reaction: () => ({ checks: [...players('reaction', 2, 8), [3, RACE_MATCH_WINS], [4, REACTION_ROUNDS]] }),
  aim: () => ({ checks: [[30, secs(AIM_GAME_MS)], ...players('aim', 2, 8), [3, RACE_MATCH_WINS]] }),
  pulprush: () => ({
    checks: [[45, secs(DUEL_MS)], ...players('pulprush', 2, 8), [5, ROT_PENALTY], [3, RACE_MATCH_WINS], [1, secs(STUN_MS)]],
  }),
  pulpharvest: () => ({
    checks: [
      [60, secs(HARVEST_MS)], ...players('pulpharvest', 2, 8), [60, HARVEST_TARGET_PER_PLAYER], [5, TEAM_HEARTS],
      // Combos start at the third slice in a chain.
      [3, [1, 2, 3].find(n => comboGain(n) > 1)],
    ],
  }),
  typing: () => ({ checks: [...players('typing', 2, 8), [3, RACE_MATCH_WINS]] }),
  math: () => ({
    checks: [...players('math', 2, 8), [3, STREAK_FOR_DOUBLE], [3, RACE_MATCH_WINS]],
    // 60/120/180: the clock options, checked against DURATIONS below.
    prose: [60, 120, 180],
  }),
  visualmemory: () => ({
    checks: [
      [4, vmGridSide(VM_START_LEVEL)], [8, VM_MAX_SIDE], [30, secs(VM_RECALL_MS)],
    ],
    prose: [3, 2, 1], // the 3-2-1 countdown
  }),
  gomoku: () => ({ checks: [[15, GOMOKU_SIZE], [5, GOMOKU_WIN_RUN]] }),
  gomokuswap: () => ({ checks: [[15, GOMOKU_SIZE]] }),
  reversi: () => ({ checks: [[8, REVERSI_DIM]] }),
  orderchaos: () => ({ checks: [[6, OC_SIZE], [5, OC_RUN]] }),
  dice: () => ({ checks: [[100, PIG_TARGET]], prose: [1] /* the bust face */ }),
  'dice-big': () => ({ checks: [[100, PIG_TARGET]], prose: [1] }),
  battleship: () => {
    const size = (ship) => FLEET_SPEC.find(s => s.ship === ship).size
    return {
      checks: [
        [5, size('carrier')], [4, size('battleship')], [3, size('cruiser')], [3, size('submarine')],
        [2, size('destroyer')], [17, SHIP_CELLS], [5, FLEET_SPEC.length],
      ],
    }
  },
  mancala: () => ({ checks: [[24, INITIAL_PITS().reduce((a, b) => a + b, 0) / 2], [6, INITIAL_PITS().slice(0, 6).length]] }),
  checkers: () => ({ checks: [] }),
  airhockey: () => ({ checks: [[7, AIRHOCKEY_WIN]] }),
  minigolf: () => ({
    checks: [[6, STROKE_CAP], [7, PICKUP_SCORE], ...players('minigolf', 2, 4), [4, cfg('minigolf').localMaxPlayers ?? cfg('minigolf').maxPlayers]],
    prose: [1], // "+1" water penalty, checked below
  }),
  artillery: () => ({ checks: [[5, 5], [90, 90], [10, 10], [100, 100]], prose: [0] /* 0 HP */ }),
  archery: () => ({
    checks: [
      [4, ARCHERY_FORMATS.standard.ends], [3, ARROWS_PER_END],
      [70, ARCHERY_FORMATS.standard.distances.at(-1)],
    ],
    prose: [10], // the WA 10-ring is the target face, not a setting
  }),
  archery4: () => ({
    checks: [
      ...players('archery4', 2, 4), [1, cfg('archery4').minPlayers - 1], [3, cfg('archery4').maxPlayers - 1],
      [3, ARROWS_PER_END], [30, secs(pageConst('ArcheryGame.jsx', 'SHOT_CLOCK_MS'))],
      [70, ARCHERY_FORMATS.standard.distances.at(-1)],
    ],
    prose: [10],
  }),
  animalstack: () => ({
    checks: [
      [15, 360 / ROT_STEPS], [2, 2], [3, heartsFor(2)], [3, 3], [4, 4], [2, heartsFor(3)], [2, heartsFor(4)],
      [15, secs(STACK_TURN_MS)],
    ],
  }),
  hex: () => ({ checks: [[11, HEX_SIZE]] }),
  minesweeper: () => ({
    checks: [
      ...players('minesweeper', 2, 8), [12, MINES_ROWS], [12, MINES_COLS], [22, MINES], [122, SAFE_CELLS],
      [3, RACE_MATCH_WINS],
    ],
  }),
  herd: () => ({
    checks: [...players('herd', 3, 8), [45, secs(HERD_ANSWER_MS)], [8, HERD_TARGET], [10, secs(HERD_REVEAL_MS)]],
  }),
  trivia: () => ({
    checks: [
      ...players('trivia', 2, 8), [10, MATCH_QUESTIONS], [15, secs(TRIVIA_QUESTION_MS)],
      [1000, BASE_POINTS + SPEED_POINTS], [300, STREAK_CAP],
    ],
  }),
  twotruths: () => ({
    checks: [
      [3, STATEMENT_COUNT], [3, secs(WRITING_DEADLINE_MS) / 60], [1, secs(GUESSING_DEADLINE_MS) / 60],
      [1, 1], [3, TWO_TRUTHS_TARGET],
    ],
  }),
  bluff: () => ({ checks: [[1, 1]] }),
  wavelength: () => ({
    checks: [
      ...players('wavelength', 3, 8), [90, secs(WAVELENGTH_CLUE_MS)], [60, secs(WAVELENGTH_GUESS_MS)],
      [50, WAVELENGTH_MAX_SCORE], [200, WAVELENGTH_WIN_SCORE],
    ],
    prose: [0, 100], // the dial's ends
  }),
  fibbage: () => ({
    checks: [
      ...players('fibbage', 3, 8), [60, secs(FIBBAGE_LIE_MS)], [45, secs(FIBBAGE_VOTE_MS)],
      [10, secs(FIBBAGE_REVEAL_ADVANCE_MS)], [1000, POINTS_FOR_TRUTH], [500, POINTS_PER_FOOL],
      [5, MATCH_PROMPTS],
    ],
    double: FIBBAGE_FINAL_MULTIPLIER,
  }),
  arrows: () => ({
    checks: [[3, ARROWS_LIVES], [170, ARROWS_LEVEL_COUNT], [2, ARROWS_MATCH_TARGET], [3, ARROWS_MAX_ROUNDS]],
  }),
  updraft: () => ({
    checks: [
      [400, SUMMIT_M], [2, secs(UPDRAFT_ROUND_MS) / 60], [2, UPDRAFT_MATCH_TARGET],
    ],
  }),
  updraftduo: () => ({
    checks: [
      [300, COOP_GOAL_M], [50, GATE_EVERY / UNITS_PER_M], [3, COOP_LIVES], [3, secs(COOP_LIMIT_MS) / 60],
    ],
  }),
  tron: () => ({ checks: [], prose: [180] }),
  sumo: () => ({ checks: [] }),
  spaceduel: () => ({
    checks: [[3, SHIP_MAX_HP], [60, ROUND_CAP_S], [1, HITS_WIN_MARGIN]],
  }),
  paint: () => ({
    checks: [[20, PAINT_W], [20, PAINT_H], [60, PAINT_SECONDS], [70, Math.round(ENEMY_SLOW_MULT * 100)], [3, PAINT_MATCH_TARGET]],
  }),
  chainreaction: () => ({ checks: [[8, CR_COLS], [10, CR_ROWS], ...capacities(CR_COLS, CR_ROWS)] }),
  chainreaction4: () => ({
    checks: [...players('chainreaction4', 2, 4), [8, CR_COLS], [10, CR_ROWS], ...capacities(CR_COLS, CR_ROWS)],
  }),
  chainreaction6: () => ({
    checks: [[6, CR_COLS_CLASSIC], [8, CR_ROWS_CLASSIC], ...capacities(CR_COLS_CLASSIC, CR_ROWS_CLASSIC)],
  }),
  blockade: () => ({ checks: [[10, BK_WALLS_PER_PLAYER]] }),
  wordduel: () => ({
    checks: [[5, DUEL_WORD_LENGTH], [6, DUEL_GUESSES], [90, secs(DUEL_FINISH_GRACE_MS)], [3, DUEL_MATCH_WINS], [3, first('wordduel')]],
  }),
  wordcoop: () => ({ checks: [[5, COOP_WORD_LENGTH], [20, secs(PARTNER_OFFLINE_SOLO_MS)], [6, COOP_GUESSES]] }),
  hunch: () => ({
    checks: [
      [1, 1], [100, HUNCH_MAX_CARD], [12, HUNCH_TARGET_LEVEL], [3, HUNCH_START_LIVES],
      // Level n deals n cards to each player.
      [1, dealLevel(1, 's').X.length], [2, dealLevel(2, 's').X.length],
    ],
  }),
  converge: () => ({
    checks: [
      [1, 1], [2, 2], [3, convergeStars(2)], [3, 3], [4, 4], [2, convergeStars(3)], [2, convergeStars(4)],
      [5, 5], [1, convergeStars(5)], [8, CONVERGE_MAX_STEPS], [1, convergeStars(CONVERGE_MAX_STEPS)],
      [5, CONVERGE_CHAINS], [15, CONVERGE_CHAINS * convergeStars(1)],
    ],
  }),
  lanterns: () => ({
    checks: [
      [5, LANTERN_MODES.full.suits], [1, 1], [5, 5], [5, HAND_SIZE],
      [3, COPIES[1]], [2, COPIES[2]], [2, COPIES[3]], [2, COPIES[4]], [1, COPIES[5]], [3, 3], [4, 4],
      [8, MAX_CLUES], [4, LANTERN_MODES.short.suits], [20, LANTERN_MODES.short.suits * 5],
      [20, LANTERN_MODES.full.suits * 5 * WIN_SHARE], [25, LANTERN_MODES.full.suits * 5],
      [16, LANTERN_MODES.short.suits * 5 * WIN_SHARE], [3, MAX_FUSES],
    ],
  }),
  docking: () => ({
    checks: [
      [6, MAX_BURNS], [4, DICE_PER_SEAT], [3, MAX_TILT],
      [4, 4], [0, moveFor(4)], [5, 5], [8, 8], [1, moveFor(5)], [1, moveFor(8)], [9, 9], [2, moveFor(9)],
      [2, DEBRIS_SLOTS], [0, 0],
    ],
    // Each armed switch raises the docking limit by 1; coolant moves a die by 1.
    prose: [1],
  }),
  password: () => ({
    checks: [
      [12, PASSWORD_ROUNDS], [6, PASSWORD_ROUNDS / 2], [45, CLUE_SECONDS], [3, MIN_CLUE_LENGTH],
      [30, GUESS_SECONDS[0]], [30, GUESS_SECONDS[1]], [25, GUESS_SECONDS[2]], [25, GUESS_SECONDS[3]], [20, GUESS_SECONDS[4]],
      ...CLUE_POINTS.map((p, i) => [i + 1, i + 1]), ...CLUE_POINTS.map(p => [p, p]),
      [5, CLUE_POINTS[0]], [1, CLUE_POINTS[4]], [60, MAX_TEAM_SCORE],
      [20, STAR_THRESHOLDS[0]], [30, STAR_THRESHOLDS[1]], [40, STAR_THRESHOLDS[2]], [30, secs(PARTNER_OFFLINE_MS)],
    ],
  }),
  wirecrossed: () => ({
    checks: [
      [2, secs(STRIP_SWITCH_MS)],
      // PRESSURE GAUGE: Medium level 3 and Hard levels 2-3.
      [3, WIRE_MODES.medium.levels.findIndex(l => l.gauge) + 1],
      [2, WIRE_MODES.hard.levels.findIndex(l => l.gauge) + 1], [3, WIRE_MODES.hard.levels.length],
      [10, GAUGE_START], [50, GAUGE_AMBER_AT], [100, 100], [3, GAUGE_VALVES.length],
      [15, secs(STRIKE_PENALTY_MS)], [25, secs(SHORT_FUSE_PENALTY_MS)],
      [3, secs(BLACKOUT_MS)], [25, secs(BLACKOUT_EVERY_MS)], [3, MAX_STRIKES],
    ],
    prose: [1], // "back to stage 1" of the RELAY module
  }),
  wordrace: () => ({
    checks: [[5, 5], [6, WORDLE_GUESSES], [30, secs(FINISH_GRACE_MS)], [60, secs(DONE_GRACE_MS)], [3, WORDRACE_MATCH]],
  }),
  wordhunt: () => ({
    checks: [
      [4, Math.sqrt(cfg('wordhunt').boardSize ?? 16)], [80, secs(HUNT_ROUND_MS)], [3, HUNT_MIN_LEN],
      [3, 3], [4, 4], [1, huntScore('abc')], [1, huntScore('abcd')], [11, huntScore('abcdefgh')], [8, 8],
      [3, HUNT_MATCH_WINS],
    ],
  }),
  anagrams: () => ({
    checks: [
      [3, ANAGRAM_MIN_LEN], [1, anagramScore('abc')], [4, 4], [2, anagramScore('abcd')],
      [5, 5], [4, anagramScore('abcde')], [6, 6], [7, anagramScore('abcdef')],
      [7, RACK_SIZE], [11, anagramScore('abcdefg') - 5], [5, anagramScore('abcdefg') - 11],
      [90, secs(ANAGRAM_ROUND_MS)], [2, ANAGRAMS_MATCH_TARGET], [3, secs(ANAGRAM_COUNTDOWN_MS)],
    ],
    prose: [2, 1], // the 3-2-1 countdown
  }),
  spyfair: () => ({ checks: [...players('spyfair', 3, 8), [3, SPYFAIR_MATCH_WINS]] }),
  headsup: () => ({
    checks: [...players('headsup', 3, 8), [60, HU_TURN_SECONDS], [3, 3], [4, 4], [2, turnsPerPlayer(3)], [2, turnsPerPlayer(4)], [1, turnsPerPlayer(5)]],
  }),
  chameleon: () => ({
    checks: [
      ...players('chameleon', 3, 8), [16, CHAMELEON_GRID], [2, POINTS_ESCAPED], [1, POINTS_STOLEN],
      [2, POINTS_CAUGHT], [5, CHAMELEON_MATCH_POINTS],
    ],
  }),
  codewords: () => ({
    checks: [
      [5, CW_COLS], [5, CW_SIZE / CW_COLS], ...players('codewords', 4, 8), [1, 1],
      [9, CW_START_CARDS], [8, CW_OTHER_CARDS],
    ],
  }),
  justone: () => ({
    checks: [
      ...players('justone', 3, 8), [13, JO_CARDS],
      [1, justOneOutcome({ score: 0, played: 0 }, 'correct').score],
      [0, justOneOutcome({ score: 0, played: 0 }, 'pass').score],
    ],
  }),
  sketch: () => ({
    checks: [
      ...players('sketch', 2, 8), [3, 3], [1.2, TIER_MULTIPLIERS[2]], [1.5, TIER_MULTIPLIERS[3]], [2, cyclesFor(3)],
    ],
  }),
  pairs: () => ({
    checks: [
      [6, PAIRS_SIZE], [18, PAIRS_TOTAL_PAIRS], [10, pairsClinch(PAIRS_CELL_COUNT)], [9, PAIRS_TOTAL_PAIRS / 2],
    ],
  }),
  pairs4: () => ({
    checks: [
      [4, PAIRS_QUICK_SIZE], [8, PAIRS_QUICK_CELL_COUNT / 2], [5, pairsClinch(PAIRS_QUICK_CELL_COUNT)],
      [4, PAIRS_QUICK_CELL_COUNT / 4],
    ],
  }),
  verbalmemory: () => ({ checks: [[3, VB_LIVES]] }),
  nback: () => ({
    checks: [[3, Math.sqrt(NB_CELLS)], [1, startNBack().n], [20, NB_BLOCK], [3, NB_LIVES]],
  }),
  cupshuffle: () => ({ checks: [[3, SOLO_LIVES]] }),
  whatchanged: () => ({ checks: [[3, SOLO_LIVES]] }),
  kimsgame: () => ({ checks: [[3, SOLO_LIVES], [6, KIM_CHOICES]] }),
  nametags: () => ({ checks: [[3, SOLO_LIVES]] }),
  splitsignal: () => ({ checks: [[3, SPLIT_LIVES]] }),
  sim: () => ({ checks: [[15, SIM_EDGE_COUNT], [6, SIM_DOTS], [2, 2]] }),
  chomp: () => ({ checks: [[5, CHOMP_ROWS], [6, CHOMP_COLS]] }),
  breakthrough: () => ({ checks: [] }),
  ataxx: () => ({ checks: [] }),
  kamisado: () => ({
    checks: [[8, KM_SIZE], [8, new Set(KM_COLORS).size], [3, first('kamisado')]],
  }),
  onitama: () => ({
    checks: [[2, 2]],
    prose: [180], // the board rotates for the other side
  }),
  quarto: () => ({ checks: [[16, QRT_PIECE_COUNT], [4, QRT_ATTR_NAMES.length], [4, QRT_SIZE]] }),
  santorini: () => ({
    checks: [[5, ST_SIZE], [8, stNeighbors(12).length], [4, ST_MAX_LEVEL + 1], [3, ST_MAX_LEVEL]],
  }),
  loa: () => ({ checks: [] }),
  yavalath: () => ({ checks: [[3, 3], [4, 4]] }),
}

// Chain Reaction capacities: 2 in a corner, 3 on an edge, 4 inside.
function capacities(cols, rows) {
  return [[2, criticalMass(0, cols, rows)], [3, criticalMass(1, cols, rows)], [4, criticalMass(cols + 1, cols, rows)]]
}


describe('HOW TO PLAY numbers match the code', () => {
  it('every game with rules has a numbers check', () => {
    expect(Object.keys(GAME_RULES).filter(t => !RULE_NUMBERS[t])).toEqual([])
  })

  for (const type of Object.keys(GAME_RULES)) {
    it(type, () => {
      const spec = RULE_NUMBERS[type]?.()
      expect(spec, `no RULE_NUMBERS entry for ${type}`).toBeTruthy()
      for (const [claimed, actual] of spec.checks) {
        expect(actual, `${type}: the sheet says ${claimed}`).toBe(claimed)
      }
      const covered = new Set([...spec.checks.map(([n]) => n), ...(spec.prose ?? [])])
      const unchecked = numbersIn(GAME_RULES[type]).filter(n => !covered.has(n))
      expect(unchecked, `${type}: numbers in the sheet with no check`).toEqual([])
    })
  }
})

// Rules a single number can't express.
describe('HOW TO PLAY rules match the code', () => {
  it('math offers the 60/120/180-second clocks', () => {
    const src = readFileSync(new URL('./mathLogic.js', import.meta.url), 'utf8')
    expect(src).toMatch(/const DURATIONS = \[60, 120, 180\]/)
  })

  it('minigolf water costs one extra stroke', () => {
    const src = readFileSync(new URL('./minigolfLogic.js', import.meta.url), 'utf8')
    expect(src).toMatch(/strokes \+= r\.water \? 2 : 1/)
  })

  it('fibbage: the last prompt scores double', () => {
    expect(RULE_NUMBERS.fibbage().double).toBe(2)
  })

  it('artillery: angle 5–90° and power 10–100 on every aim control', () => {
    for (const page of ['ArtilleryGame.jsx', 'ArtilleryDemo.jsx']) {
      const src = readFileSync(new URL(`../pages/${page}`, import.meta.url), 'utf8')
      expect(src, page).toMatch(/type="range" min="5" max="90"/)
      expect(src, page).toMatch(/type="range" min="10" max="100"/)
    }
  })

  it('bluff: 1s are wild', () => {
    expect(countFace([1, 1, 4], 4)).toBe(3)
    expect(countFace([1, 1, 4], 1)).toBe(2)
  })

  it('docking: every armed switch raises the docking limit by 1', () => {
    const round = (armed) => ({ systems: Array.from({ length: 2 }, (_, i) => ({ armed: i < armed })) })
    expect(dockLimit(round(1)) - dockLimit(round(0))).toBe(1)
    expect(dockLimit(round(2)) - dockLimit(round(1))).toBe(1)
  })

  it('pacmac respawns two seconds after a catch', () => {
    expect(RESPAWN_S).toBe(2)
  })
})
