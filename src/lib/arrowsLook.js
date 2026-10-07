// Arrows board look: pure helpers for the portal palette names and the
// curved-V bend of a double arrow (no DOM, no React).

export const PORTAL_COLOUR_NAMES = ['blue', 'orange', 'magenta', 'teal']

/** Colour name of a portal pair (index wraps at four). */
export function portalColourName(c) {
  return PORTAL_COLOUR_NAMES[((c % 4) + 4) % 4]
}

/** Screen-reader label: the colour names the pair instead of its letter. */
export function portalColourLabel(portal, end) {
  const colour = portalColourName(portal.c)
  const [x, y] = portal[end]
  const where = `column ${x + 1}, row ${y + 1}`
  const turn = portal.turn ? ', turns the arrow a quarter clockwise' : ''
  if (portal.oneway) {
    return end === 'a'
      ? `Portal, ${colour} pair, entrance, ${where}, leads to its exit ring${turn}`
      : `Portal, ${colour} pair, exit only, ${where}, arrows come out here but cannot enter`
  }
  return `Portal, ${colour} pair, ${where}, leads to the other ${colour} ring${turn}`
}

/**
 * The bend of a double arrow as two quadratic arcs that leave each prong
 * straight and meet in a point behind the spine. `p1`/`p2` are the prong ends,
 * (ux, uy) the unit vector the heads point along.
 */
export function vBendD(p1, p2, ux, uy, bulge) {
  const f = (v) => Math.round(v * 100) / 100
  const vx = (p1[0] + p2[0]) / 2 - ux * bulge
  const vy = (p1[1] + p2[1]) / 2 - uy * bulge
  const k = 0.75
  return ` Q${f(p1[0] - ux * bulge * k)} ${f(p1[1] - uy * bulge * k)} ${f(vx)} ${f(vy)}` +
    ` Q${f(p2[0] - ux * bulge * k)} ${f(p2[1] - uy * bulge * k)} ${f(p2[0])} ${f(p2[1])}`
}
