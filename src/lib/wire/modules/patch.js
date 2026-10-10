// WIRE CROSSED module: PATCH BAY. Coloured plugs (one per colour letter) sit
// on the left, numbered sockets on the right; the manual routes every plug to
// a socket. Tier I: 3 plugs and one routing column. Tier II: 4 plugs and two
// columns, picked by an indicator that is on this bomb ("use column A if SIG
// is lit, else B"). Tier III: as II, but the bay starts tangled: 3 cables are
// already patched into wrong sockets (`device.initial`, with at least 2
// crossings).
//
// Plug `p` is the p-th plug from the top (colour `device.plugs[p]`), socket `s`
// the s-th from the top, both 0-based. A patch into a wrong socket is a strike
// and the cable springs out. Cables `a` and `b` cross when their plug order and
// socket order are opposite; the one patched later lies on top. From tier III
// a cable with a crossing cable on top of it cannot be unplugged (strike).
//
// Progress is `mods[i] = { touched, links: { plug: socket }, stack: [plugs in
// patch order] }`. Firebase drops empty objects and arrays, so an untouched
// module reads its state from `device.initial` and `touched` marks the rest.
//
// Pure — no DOM, no Firebase, no React.
import { pick, sample, shuffle } from '../rng'
import { COLOR_LETTERS, INDICATOR_LABELS, WIRE_COLORS, isLit } from '../shell'

export const PATCH_PLUGS = { 1: 3, 2: 4, 3: 4 }
/** Tier III: how many cables start patched (all wrong). */
export const TANGLE_CABLES = 3
export const TANGLE_MIN_CROSSINGS = 2
export const COLUMN_NAMES = ['A', 'B']

const validIndex = (v, n) => Number.isInteger(v) && v >= 0 && v < n

/** Cable pairs [a, b] whose plug order and socket order are opposite. */
export function crossings(links) {
  const plugs = Object.keys(links).map(Number).sort((a, b) => a - b)
  const out = []
  for (let x = 0; x < plugs.length; x++) {
    for (let y = x + 1; y < plugs.length; y++) {
      if (links[plugs[x]] > links[plugs[y]]) out.push([plugs[x], plugs[y]])
    }
  }
  return out
}

/** Plugs whose cable crosses `plug` and was patched after it (it lies on top). */
export function coveredBy(links, stack, plug) {
  const at = stack.indexOf(plug)
  if (at < 0) return []
  return stack.slice(at + 1).filter(other => (links[other] - links[plug]) * (other - plug) < 0)
}

/** Which manual column applies on this bomb (0 = A, 1 = B). */
export const columnIndex = (module, bomb) => {
  const rule = module.manual.rule
  if (!rule) return 0
  return bomb?.indicators && isLit(bomb, rule.label) ? 0 : 1
}

/** The routing that applies: array of socket per plug. */
export const patchRouting = (module, bomb) => module.manual.columns[columnIndex(module, bomb)]

/**
 * Normalised progress of module `i`: { links, stack }. Reads by explicit key
 * (Firebase may return arrays or numeric-keyed objects) and falls back to the
 * generator's tangle until the module has been touched.
 */
export function patchState(wire, i, module) {
  const n = module.device.plugs.length
  const raw = wire?.mods?.[i]
  if (!raw?.touched) {
    const init = module.device.initial
    return init ? { links: { ...init.links }, stack: [...init.stack] } : { links: {}, stack: [] }
  }
  const links = {}
  const used = new Set()
  Object.entries(raw.links || {}).forEach(([k, v]) => {
    if (v == null) return
    const plug = parseInt(k, 10)
    const socket = Number(v)
    if (validIndex(plug, n) && validIndex(socket, n) && !used.has(socket)) {
      links[plug] = socket
      used.add(socket)
    }
  })
  const stack = []
  Object.entries(raw.stack || {})
    .filter(([, v]) => v != null)
    .map(([k, v]) => [parseInt(k, 10), Number(v)])
    .filter(([k, v]) => Number.isInteger(k) && v in links)
    .sort((a, b) => a[0] - b[0])
    .forEach(([, v]) => { if (!stack.includes(v)) stack.push(v) })
  Object.keys(links).map(Number).forEach(p => { if (!stack.includes(p)) stack.push(p) })
  return { links, stack }
}

/** True when every plug sits in its routed socket. */
export const patchSolved = (module, bomb, links) => {
  const routing = patchRouting(module, bomb)
  return routing.every((socket, plug) => links[plug] === socket)
}

const nameOf = (module, plug) => COLOR_LETTERS[module.device.plugs[plug]]

function genTangle(rng, n, columns) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const chosen = sample(rng, Array.from({ length: n }, (_, p) => p), TANGLE_CABLES)
    const sockets = sample(rng, Array.from({ length: n }, (_, s) => s), TANGLE_CABLES)
    const links = {}
    chosen.forEach((p, k) => { links[p] = sockets[k] })
    if (chosen.some(p => columns.some(col => col[p] === links[p]))) continue
    if (crossings(links).length < TANGLE_MIN_CROSSINGS) continue
    return { links, stack: shuffle(rng, chosen) }
  }
  /* c8 ignore next */
  throw new Error('patch tangle generation failed')
}

/**
 * Errata: `patch = { column, a, b }` swaps the sockets of plugs a and b in
 * routing column `column`, so the column stays a permutation.
 */
function applyErrata(manual, patch) {
  const columns = manual.columns.map((col, k) => {
    if (k !== patch.column) return col
    const next = [...col]
    next[patch.a] = col[patch.b]
    next[patch.b] = col[patch.a]
    return next
  })
  return { ...manual, columns }
}

const routeText = (module, column, plugs) => plugs.map(p => `${nameOf(module, p)} to ${column[p] + 1}`).join(', ')

export default {
  type: 'patch',
  name: 'PATCH BAY',
  maxTier: 3,

  generate(rng, tier = 1, ctx = {}) {
    const n = PATCH_PLUGS[tier] ?? PATCH_PLUGS[1]
    const index = Array.from({ length: n }, (_, k) => k)
    const plugs = sample(rng, WIRE_COLORS, n)
    const first = shuffle(rng, index)
    const columns = [first]
    const manual = { columns }
    if (tier >= 2) {
      let second = shuffle(rng, index)
      while (second.every((s, k) => s === first[k])) second = shuffle(rng, index)
      columns.push(second)
      const labels = (ctx.indicators || []).map(ind => ind.label)
      manual.rule = { label: pick(rng, labels.length ? labels : INDICATOR_LABELS) }
    }
    const device = { plugs, sockets: n }
    if (tier >= 3) {
      // Wrong under the column this bomb uses; without indicators, under column A.
      const lit = (ctx.indicators || []).some(ind => ind.lit && ind.label === manual.rule.label)
      device.initial = genTangle(rng, n, [columns[lit || !ctx.indicators ? 0 : 1]])
    }
    return { type: 'patch', tier, device, manual }
  },

  applyErrata,

  /** Patches to the column this bomb uses (a swap in an unused column changes nothing). */
  errataCandidates(rng, module, bomb) {
    const n = module.device.plugs.length
    const column = columnIndex(module, bomb)
    const pairs = []
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b])
    return sample(rng, pairs, 3).map(([a, b]) => ({ column, a, b }))
  },

  describeErrata(module, patch) {
    const plugs = [patch.a, patch.b]
    const next = applyErrata(module.manual, patch)
    const title = module.manual.rule ? `COLUMN ${COLUMN_NAMES[patch.column]}` : 'ROUTING'
    return {
      where: `PATCH BAY, ${title}, ${plugs.map(p => nameOf(module, p)).join(' AND ')}`,
      was: `${routeText(module, module.manual.columns[patch.column], plugs)}.`,
      now: `${routeText(module, next.columns[patch.column], plugs)}.`,
    }
  },

  judge(module, bomb, wire, i, action) {
    const n = module.device.plugs.length
    if (action.kind !== 'patch' && action.kind !== 'unplug') return null
    if (!validIndex(action.plug, n)) return null
    const { links, stack } = patchState(wire, i, module)
    const plug = action.plug
    const name = nameOf(module, plug)
    const save = (l, s) => ({ touched: true, links: l, stack: s })

    if (action.kind === 'unplug') {
      if (!(plug in links)) return null
      const covering = module.tier >= 3 ? coveredBy(links, stack, plug) : []
      if (covering.length) {
        return {
          ok: false,
          solved: false,
          progress: save(links, stack),
          text: `UNPLUGGED ${name} — ${covering.map(c => nameOf(module, c)).join(' AND ')} LIES ON TOP`,
        }
      }
      const rest = { ...links }
      delete rest[plug]
      return { ok: true, solved: false, progress: save(rest, stack.filter(p => p !== plug)), text: `UNPLUGGED ${name}` }
    }

    if (!validIndex(action.socket, n) || plug in links) return null
    if (Object.values(links).includes(action.socket)) return null
    const socket = action.socket
    if (patchRouting(module, bomb)[plug] !== socket) {
      return {
        ok: false,
        solved: false,
        progress: save(links, stack),
        text: `PATCHED ${name} TO ${socket + 1} — SPRANG OUT`,
      }
    }
    const nextLinks = { ...links, [plug]: socket }
    return {
      ok: true,
      solved: patchSolved(module, bomb, nextLinks),
      progress: save(nextLinks, [...stack, plug]),
      text: `PATCHED ${name} TO ${socket + 1}`,
    }
  },

  solveNext(module, bomb, wire, i) {
    const { links, stack } = patchState(wire, i, module)
    const routing = patchRouting(module, bomb)
    const anyWrong = Object.keys(links).some(p => links[p] !== routing[p])
    if (anyWrong) return { mod: i, kind: 'unplug', plug: stack[stack.length - 1] }
    const plug = routing.findIndex((_, p) => !(p in links))
    return { mod: i, kind: 'patch', plug, socket: routing[plug] }
  },
}
