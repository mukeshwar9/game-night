// The memory games built on the shared run/duel engine (MemoryRunSolo,
// MemoryDuelGame). Each kit names its board and how it deals:
//   mode 'level'  — one deal per level, played by both (resolveLevelRace in duels)
//   mode 'stream' — one seeded run, played by both until out of lives (score race)
import { lazyWithRetry } from './lazyWithRetry'
import { dealCups } from './cupShuffleLogic'
import { dealWhatChanged } from './whatChangedLogic'
import { dealKim } from './kimsGameLogic'
import { dealNameTags } from './nameTagsLogic'

export const MEMORY_KITS = {
  cupshuffle: {
    mode: 'level', deal: dealCups, unit: 'LEVELS',
    Board: lazyWithRetry(() => import('../components/memory/CupShuffleBoard')),
    start: { title: 'FOLLOW THE BALL', how: 'WATCH WHICH CUP HIDES THE BALL, FOLLOW IT THROUGH THE SHUFFLE, THEN TAP IT. 3 LIVES.' },
  },
  whatchanged: {
    mode: 'level', deal: dealWhatChanged, unit: 'LEVELS',
    Board: lazyWithRetry(() => import('../components/memory/WhatChangedBoard')),
    start: { title: 'SPOT THE CHANGE', how: 'STUDY THE SCENE. IT BLINKS OUT AND COMES BACK WITH ONE THING CHANGED — TAP IT. 3 LIVES.' },
  },
  kimsgame: {
    mode: 'level', deal: dealKim, unit: 'LEVELS',
    Board: lazyWithRetry(() => import('../components/memory/KimsGameBoard')),
    start: { title: "WHAT'S MISSING?", how: 'STUDY THE TRAY. IT IS COVERED, THEN SHOWN AGAIN WITH ONE OBJECT GONE — PICK IT. 3 LIVES.' },
  },
  nametags: {
    mode: 'level', deal: dealNameTags, unit: 'LEVELS',
    Board: lazyWithRetry(() => import('../components/memory/NameTagsBoard')),
    start: { title: 'FACES AND NAMES', how: 'REMEMBER WHO IS WHO. THE TAGS COME OFF AND THE FACES SHUFFLE — TAG THEM AGAIN. 3 LIVES.' },
  },
  verbalmemory: {
    mode: 'stream', unit: 'WORDS',
    Board: lazyWithRetry(() => import('../components/memory/VerbalMemoryBoard')),
    start: { title: 'SEEN OR NEW?', how: 'WORDS COME ONE AT A TIME. TAP SEEN IF IT CAME UP BEFORE IN THIS RUN, NEW IF NOT. 3 LIVES.' },
  },
  nback: {
    mode: 'stream', unit: 'POINTS',
    Board: lazyWithRetry(() => import('../components/memory/NBackBoard')),
    start: { title: 'N STEPS BACK', how: 'A CELL LIGHTS EACH STEP. TAP MATCH WHEN IT IS THE SAME CELL AS N STEPS AGO. N GROWS AS YOU GET IT RIGHT. 3 LIVES.' },
  },
}

export const getMemoryKit = type => MEMORY_KITS[type] ?? null
