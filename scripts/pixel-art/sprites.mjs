// Registry: every ART_TYPES game → its three pixel styles.
import classics from './games/classics.mjs'
import board from './games/board.mjs'
import memory from './games/memory.mjs'
import reflex from './games/reflex.mjs'
import word from './games/word.mjs'
import party from './games/party.mjs'

// Style id → native size in px. Output: public/game-art/pixel/<style>/<type>.png
export const STYLES = { object: 32, cast: 32, scene: 64 }

export const SPRITES = { ...classics, ...board, ...memory, ...reflex, ...word, ...party }
