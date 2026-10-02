// @ts-check
import { GAME_TYPES, getGameConfig } from './games'

// Which registry entries a GamePicker may offer. Pure, so the in-room
// switcher's seat-family rule and the solo hub's allow-list are unit-tested
// without rendering the picker.
//
// - `excludeType`: the room's current game — hidden, and (unless
//   `crossFamily`) every game of the other seat family with it: party rooms
//   key players by uid, 2P rooms by 'X'/'O'.
// - `allowTypes`: when set, only these types (bases or variants) are offered —
//   the solo hub passes the games that have a playable /solo page. An allow
//   list replaces the seat-family rule, which only matters inside a room.
/**
 * @param {{ excludeType?: string | null, allowTypes?: Iterable<string> | null, crossFamily?: boolean }} [options]
 */
export function makePickerScope({ excludeType = null, allowTypes = null, crossFamily = false } = {}) {
  const allowed = allowTypes ? new Set(allowTypes) : null
  const excludeCfg = excludeType ? getGameConfig(excludeType) : null
  const wrongFamily = (t) => !allowed && !!excludeCfg && !crossFamily && !!t.nPlayer !== !!excludeCfg.nPlayer
  // Shared by the grid and search: off-limits whether listed or found by name.
  const isOffLimits = (t) => t.type === excludeType || (allowed ? !allowed.has(t.type) : wrongFamily(t))
  return {
    // Grid entries: variants are never listed on their own — they are reached
    // through their base game's MODES button (or by search).
    isHidden: (t) => !!t.variantOf || isOffLimits(t),
    isOffLimits,
    // A base game's variants that this picker may offer.
    variantsFor: (baseType) => GAME_TYPES.filter(t => t.variantOf === baseType && !isOffLimits(t)),
  }
}
