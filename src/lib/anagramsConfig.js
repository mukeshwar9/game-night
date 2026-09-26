// @ts-check
// Anagrams constants that code outside the game needs. Kept apart from
// anagramsLogic.js, which pulls in the ~125 KB word lists (commonWords →
// dictionary): matchRules.js only needs the match target, and importing the
// logic module from there put those lists on every room's first load.
export const MATCH_TARGET = 2
