// Every ART_TYPES game → its TOON builder (a function returning SVG children
// for the 64×64 tile). One file per category; gameArtToon.test.js checks the
// registry covers the whole ART_TYPES list.
import boardA from './boardA'
import boardB from './boardB'
import boardC from './boardC'
import wordDice from './wordDice'
import party from './party'
import reflexA from './reflexA'
import reflexB from './reflexB'
import reflexC from './reflexC'
import samples from './samples'

export const BUILDERS = { ...boardA, ...boardB, ...boardC, ...wordDice, ...party, ...reflexA, ...reflexB, ...reflexC, ...samples }
