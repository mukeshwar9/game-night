import { createContext } from 'react'

// Whether the in-room game pickers may offer the other seat family: a party
// room can drop into a 2P game (winner stays, see nightLogic.js), and a party
// room that did so can switch back to party games. Provided by Game.jsx and
// read by GameSwitcher, so every page's SWITCH GAME button follows it without
// each page passing a prop. Defaults to false (same-family only), which is
// how plain 2P rooms and any picker outside a room behave.
export const RoomSwitchContext = createContext(false)
