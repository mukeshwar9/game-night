// WIRE CROSSED module registry. Every module file default-exports the same
// interface (docs/prds/wire-crossed-modes.md §7.2):
//
//   type, name, maxTier                          (highest tier the module is dealt at)
//   generate(rng, tier, ctx)                     -> { type, tier, device, manual, ...solution }
//   judge(module, bomb, wire, i, action, now)    -> { ok, solved, progress, text } | null
//   solveNext(module, bomb, wire, i, now)        -> the next correct action (tests + e2e only)
//   applyErrata?(manual, patch), errataCandidates?(rng, module)
//
// A module is drawn into a bomb only once it is registered here, so adding one
// is a new file plus one line below; modes.js pools filter on this registry.
// `gauge` is registered but is in no pool: generateBomb appends it on "+G" levels.
//
// Pure — no DOM, no Firebase, no React.
import wires from './wires'
import keypad from './keypad'
import lever from './lever'
import maze from './maze'
import patch from './patch'
import switchboard from './switch'
import pulse from './pulse'
import relay from './relay'
import callsign from './callsign'
import gauge from './gauge'

export const MODULES = { wires, keypad, lever, maze, patch, switch: switchboard, pulse, relay, callsign, gauge }

/** Registered module types in registry order. */
export const MODULE_TYPES = Object.keys(MODULES)
export const MODULE_NAMES = Object.fromEntries(Object.values(MODULES).map(m => [m.type, m.name]))
