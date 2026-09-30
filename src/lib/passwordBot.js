// passwordBot.js — pure bot-decision layer for the solo PASSWORD DUEL demo.
// NO React, NO Firebase, NO DOM.
//
// The bot clue-giver only ever puzzles over words in BOT_CLUE_DECK, each of
// which ships with a handful of hand-written one-word clues. That keeps its
// clues actually guessable for the human (a dictionary-free bot cannot infer a
// good clue from an arbitrary deck word). If a word's curated clues are spent,
// pickBotClue falls back to a legal generated hint so a round can never stall.
//
// pickBotGuess takes an injectable `rng` so callers/tests can drive it
// deterministically; its accuracy rises with the clue number, so a bot guesser
// gets warmer as the round drags on.

import { PASSWORD_DECK } from './decks/password'
import { normalizeText, validateClue } from './passwordLogic'

// Curated clue bank. Every clue is a single word that passes validateClue for
// its word (no containment either direction, 16 chars max). Four clues per word
// plus the generated fallbacks comfortably cover MAX_CLUES (5) guesses.
export const BOT_CLUE_DECK = [
  { word: 'apple', tier: 1, clues: ['fruit', 'red', 'orchard', 'juice'] },
  { word: 'chair', tier: 1, clues: ['furniture', 'seat', 'wooden', 'sitting'] },
  { word: 'river', tier: 1, clues: ['water', 'flow', 'stream', 'banks'] },
  { word: 'house', tier: 1, clues: ['home', 'building', 'roof', 'family'] },
  { word: 'bread', tier: 1, clues: ['toast', 'loaf', 'bakery', 'slice'] },
  { word: 'cloud', tier: 1, clues: ['sky', 'rain', 'fluffy', 'white'] },
  { word: 'flower', tier: 1, clues: ['petal', 'bloom', 'smell', 'vase'] },
  { word: 'ocean', tier: 1, clues: ['sea', 'salt', 'waves', 'deep'] },
  { word: 'table', tier: 1, clues: ['desk', 'legs', 'dinner', 'wood'] },
  { word: 'train', tier: 1, clues: ['railway', 'station', 'track', 'carriage'] },
  { word: 'planet', tier: 1, clues: ['orbit', 'space', 'world', 'round'] },
  { word: 'guitar', tier: 1, clues: ['strings', 'music', 'instrument', 'band'] },
  { word: 'window', tier: 1, clues: ['glass', 'pane', 'view', 'frame'] },
  { word: 'garden', tier: 1, clues: ['plants', 'soil', 'flowers', 'grow'] },
  { word: 'castle', tier: 1, clues: ['fort', 'king', 'stone', 'tower'] },
  { word: 'pencil', tier: 1, clues: ['write', 'eraser', 'wood', 'sharp'] },
  { word: 'camera', tier: 1, clues: ['photo', 'lens', 'picture', 'flash'] },
  { word: 'coffee', tier: 1, clues: ['drink', 'bean', 'morning', 'mug'] },
  { word: 'bridge', tier: 1, clues: ['cross', 'river', 'span', 'road'] },
  { word: 'rocket', tier: 1, clues: ['launch', 'space', 'fast', 'moon'] },
]

// Simulated accuracy for the bot guesser by clue number (1..5). Low on the
// first clue, near-certain by the fifth — so a stumped human still gets a
// resolution before the reveal.
export const BOT_GUESS_ACCURACY = [0.2, 0.35, 0.5, 0.65, 0.8]

// Always returns a clue string that validateClue accepts for `word`, or null in
// the (unreachable for the shipped decks) case that no candidate validates.
export function pickBotClue({ word, previousClues = [] }) {
  const normalized = normalizeText(word)
  const entry = BOT_CLUE_DECK.find(item => item.word === normalized)
  const candidates = entry ? [...entry.clues] : []
  const letter = normalized[0] || ''
  candidates.push(`starts${letter}`, `begins${letter}`, `initial${letter}`)
  for (let i = 0; i < 20; i += 1) candidates.push(`hint${letter}${i}`)
  for (const clue of candidates) {
    if (validateClue({ clue, word, previousClues }).valid) return clue
  }
  return null
}

// Decides the bot's guess: correctly with probability from BOT_GUESS_ACCURACY,
// otherwise a random wrong word drawn from the public deck.
export function pickBotGuess({ word, deck = PASSWORD_DECK, clueNumber = 1, rng = Math.random }) {
  const index = Math.min(Math.max(clueNumber, 1), BOT_GUESS_ACCURACY.length) - 1
  if (rng() < BOT_GUESS_ACCURACY[index]) return word
  const pool = (deck || [])
    .map(entry => entry.word)
    .filter(candidate => normalizeText(candidate) !== normalizeText(word))
  if (!pool.length) return word
  return pool[Math.floor(rng() * pool.length)]
}
