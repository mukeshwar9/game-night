// The approved TOON tiles for the eight sample games (Puck Rush, Yacht, Sticky Fingers, Fender
// Bender, First Cut, Quiver, Side Kick, Tic Tac Toe), as the design board drew them: each returns a
// string of SVG children in a 100×100 box. Their animation is the keyframes in toonSamples.css
// (class names tp-, ty-, ts-, tf-, tc-, tq-, tk-, tt-); with no animation each tile shows its key pose.
// Characters use a fixed cartoon palette (RGB triplets, like avatars); the ground follows the theme.
const T = (k, a = 1) => (a === 1 ? `rgb(var(--c-${k}))` : `rgb(var(--c-${k}) / ${a})`)
const K = 'rgb(43 37 64)'
const C = { red: 'rgb(255 90 95)', orange: 'rgb(255 159 67)', yellow: 'rgb(255 210 63)', green: 'rgb(62 207 142)', dgreen: 'rgb(35 149 95)', teal: 'rgb(46 196 182)', blue: 'rgb(77 124 254)', purple: 'rgb(155 93 229)', pink: 'rgb(255 126 182)', cream: 'rgb(255 246 224)', white: 'rgb(255 255 255)', brown: 'rgb(200 145 90)', dbrown: 'rgb(138 90 51)', road: 'rgb(85 90 110)', sky: 'rgb(191 230 255)', tan: 'rgb(231 176 122)' }
const k = (extra = '') => `stroke="${K}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" ${extra}`
const ground = () => `<rect width="100" height="100" fill="${T('surface')}"/><circle cx="50" cy="58" r="44" fill="${T('p1', 0.16)}"/><circle cx="84" cy="14" r="18" fill="${T('p2', 0.14)}"/>`
function face(x, y, s = 1, mood = 'smile') {
  const ex = 3.2 * s, eyes = mood === 'shut'
    ? `<path d="M${x - ex - 1.6 * s} ${y} q${1.6 * s} ${-1.6 * s} ${3.2 * s} 0 M${x + ex - 1.6 * s} ${y} q${1.6 * s} ${-1.6 * s} ${3.2 * s} 0" stroke="${K}" stroke-width="${1.2 * s}" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="${x - ex}" cy="${y}" rx="${1.5 * s}" ry="${1.9 * s}" fill="${K}"/><ellipse cx="${x + ex}" cy="${y}" rx="${1.5 * s}" ry="${1.9 * s}" fill="${K}"/><circle cx="${x - ex + 0.5 * s}" cy="${y - 0.7 * s}" r="${0.55 * s}" fill="rgb(255 255 255)"/><circle cx="${x + ex + 0.5 * s}" cy="${y - 0.7 * s}" r="${0.55 * s}" fill="rgb(255 255 255)"/>`
  const m = {
    smile: `<path d="M${x - 2 * s} ${y + 2.8 * s} q${2 * s} ${2.2 * s} ${4 * s} 0" stroke="${K}" stroke-width="${1.1 * s}" fill="none" stroke-linecap="round"/>`,
    shut: `<path d="M${x - 2 * s} ${y + 2.8 * s} q${2 * s} ${2.2 * s} ${4 * s} 0" stroke="${K}" stroke-width="${1.1 * s}" fill="none" stroke-linecap="round"/>`,
    wow: `<ellipse cx="${x}" cy="${y + 3.6 * s}" rx="${1.3 * s}" ry="${1.7 * s}" fill="${K}"/>`,
    worry: `<path d="M${x - 2.2 * s} ${y + 3.6 * s} q${1.1 * s} ${-1.2 * s} ${2.2 * s} 0 t${2.2 * s} 0" stroke="${K}" stroke-width="${1.1 * s}" fill="none" stroke-linecap="round"/>`,
    grin: `<path d="M${x - 2.6 * s} ${y + 2.4 * s} h${5.2 * s} q0 ${3 * s} ${-2.6 * s} ${3 * s} q${-2.6 * s} 0 ${-2.6 * s} ${-3 * s} z" fill="${K}"/>`,
  }[mood]
  const cheeks = `<ellipse cx="${x - ex - 1.8 * s}" cy="${y + 2.4 * s}" rx="${1.3 * s}" ry="${0.8 * s}" fill="rgb(255 126 154)" opacity=".55"/><ellipse cx="${x + ex + 1.8 * s}" cy="${y + 2.4 * s}" rx="${1.3 * s}" ry="${0.8 * s}" fill="rgb(255 126 154)" opacity=".55"/>`
  return eyes + m + cheeks
}
const star = (cx, cy, r, n = 8, fill = C.yellow) => {
  let d = ''
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.48 : r; d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}` }
  return `<path d="${d}Z" fill="${fill}" ${k()}/>`
}

const toon = {}
toon.puckrush = () => {
  const puck = (x, y, r, c, mood, s) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${k()}/><path d="M${x - r * 0.55} ${y - r * 0.45} a${r * 0.7} ${r * 0.7} 0 0 1 ${r * 0.6} ${-r * 0.32}" stroke="rgb(255 255 255)" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>${face(x, y, s, mood)}`
  return ground() +
    `<rect x="10" y="10" width="80" height="80" rx="12" fill="${C.sky}" ${k()}/>` +
    `<rect x="9" y="45" width="31" height="8" rx="3" fill="${C.orange}" ${k()}/><rect x="60" y="45" width="31" height="8" rx="3" fill="${C.orange}" ${k()}/>` +
    puck(28, 26, 7, C.blue, 'shut', 0.7) + puck(73, 22, 7, C.blue, 'smile', 0.7) +
    `<g class="tp-band"><path d="M16 80 Q50 92 84 80" fill="none" ${k('stroke-width="2.6"')}/></g><circle cx="16" cy="80" r="2.6" fill="${K}"/><circle cx="84" cy="80" r="2.6" fill="${K}"/>` +
    `<g class="tp-puck"><g class="tp-speed" stroke="${K}" stroke-width="1.8" stroke-linecap="round"><path d="M43 92v6M50 94v6M57 92v6"/></g>${puck(50, 78, 9.5, C.red, 'grin', 0.95)}</g>`
}
toon.yacht = () => {
  const die = (x, y, s, pips) => {
    const pp = { 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]], 3: [[.25, .25], [.5, .5], [.75, .75]] }[pips]
    return `<path d="M${x} ${y} l${s * .25} ${-s * .2} h${s} l${-s * .25} ${s * .2} z" fill="rgb(255 255 255)" ${k()}/><path d="M${x + s} ${y} l${s * .25} ${-s * .2} v${s} l${-s * .25} ${s * .2} z" fill="rgb(242 216 166)" ${k()}/><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * .18}" fill="${C.cream}" ${k()}/>` + pp.map(([u, v]) => `<circle cx="${x + u * s}" cy="${y + v * s}" r="${s * .085}" fill="${K}"/>`).join('')
  }
  return ground() +
    `<ellipse cx="50" cy="86" rx="44" ry="9" fill="${T('p1', 0.28)}"/>` +
    `<g transform="translate(77 30) rotate(-24)"><path d="M-12 -12 h24 l-3 28 h-18 z" fill="${C.purple}" ${k()}/><rect x="-14.5" y="-16" width="29" height="6" rx="2.5" fill="rgb(185 140 240)" ${k()}/>${face(0, 2, 0.8, 'wow')}</g>` +
    `<g class="ty-die2">${die(16, 58, 16, 3)}</g>` +
    `<ellipse class="ty-sh" cx="52" cy="85" rx="17" ry="3.4" fill="${K}" opacity=".22"/>` +
    `<g class="ty-die">${die(36, 50, 32, 6)}</g>`
}
toon.stickyfingers = () => {
  const coin = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="6.5" ry="6.5" fill="${C.yellow}" ${k()}/><path d="M${x} ${y - 3.2}v6.4" stroke="rgb(200 138 18)" stroke-width="2" stroke-linecap="round"/>`
  const glove = (x, y, dir, sleeve) => `<g transform="translate(${x} ${y}) scale(${dir} 1)"><rect x="-26" y="-6" width="20" height="12" rx="4" fill="${sleeve}" ${k()}/><rect x="-9" y="-7.5" width="5" height="15" rx="2.5" fill="rgb(255 255 255)" ${k()}/><path d="M-5 -7 q12 -3 13 4 q1 7 -12 8 z" fill="rgb(255 255 255)" ${k()}/><path d="M-1 -2.5 h5 M-1 1.5 h5" stroke="${K}" stroke-width="1.2" stroke-linecap="round"/></g>`
  return ground() +
    `<ellipse cx="50" cy="88" rx="30" ry="5" fill="${K}" opacity=".18"/>` +
    `<g class="ts-c1">${coin(36, 22)}</g><g class="ts-c2">${coin(64, 18)}</g>` +
    `<g class="ts-bag"><path d="M28 82 Q22 56 40 44 L35 35 Q50 29 65 35 L60 44 Q78 56 72 82 Q50 90 28 82Z" fill="${C.brown}" ${k()}/><rect x="37" y="39" width="26" height="6" rx="3" fill="${C.dbrown}" ${k()}/><text x="50" y="80" font-size="17" font-weight="900" text-anchor="middle" fill="${C.dbrown}" font-family="system-ui, sans-serif">$</text>${face(50, 55, 1.05, 'worry')}</g>` +
    `<g class="ts-gl">${glove(26, 64, 1, C.blue)}</g><g class="ts-gr">${glove(74, 64, -1, C.pink)}</g>`
}
toon.fenderbender = () => {
  const car = (x, color, dir, mood, brows) => `<g transform="translate(${x} 0) scale(${dir} 1)"><rect x="16" y="58" width="6" height="9" rx="2.5" fill="rgb(197 204 216)" ${k()}/><rect x="-19" y="52" width="38" height="17" rx="7" fill="${color}" ${k()}/><path d="M-11 53 Q-9 39 2 39 L7 39 Q15 39 15 53Z" fill="rgb(223 243 255)" ${k()}/><g transform="scale(${dir} 1)">${face(dir * 3.5, 46, 0.72, mood)}</g>${brows ? `<path d="M0 41.5 l4 1.6 M10 41.5 l-4 1.6" stroke="${K}" stroke-width="1.3" stroke-linecap="round"/>` : ''}<circle cx="-10" cy="71" r="6" fill="${K}"/><circle cx="-10" cy="71" r="2.2" fill="rgb(197 204 216)"/><circle cx="10" cy="71" r="6" fill="${K}"/><circle cx="10" cy="71" r="2.2" fill="rgb(197 204 216)"/></g>`
  return ground() +
    `<rect x="-2" y="74" width="104" height="30" fill="${C.road}" ${k()}/><path d="M4 88 H96" stroke="${C.yellow}" stroke-width="2.4" stroke-dasharray="7 6"/>` +
    `<g class="tf-blue">${car(71, C.blue, -1, 'wow', false)}</g>` +
    `<g class="tf-red">${car(29, C.red, 1, 'grin', true)}</g>` +
    `<g class="tf-star">${star(50, 52, 9)}</g>`
}
toon.firstcut = () => {
  const half = (side) => `<path d="M50 30 A22 22 0 0 ${side > 0 ? 1 : 0} 50 74Z" fill="${C.green}" ${k()}/><path d="M50 35 A17 17 0 0 ${side > 0 ? 1 : 0} 50 69Z" fill="${C.red}"/>` + [[8, 0], [5, -8], [5, 8], [11, -4], [11, 5]].map(([dx, dy]) => `<ellipse cx="${50 + side * dx}" cy="${52 + dy}" rx="1.1" ry="1.8" fill="${K}"/>`).join('')
  return ground() +
    `<rect x="8" y="64" width="84" height="26" rx="8" fill="${C.tan}" ${k()}/><circle cx="83" cy="72" r="2.6" fill="${T('surface')}" ${k('stroke-width="1.6"')}/>` +
    `<g transform="rotate(-35 50 52)"><g class="tc-l">${half(-1)}</g><g class="tc-r">${half(1)}</g></g>` +
    `<g class="tc-juice" fill="${C.red}"><circle cx="42" cy="78" r="1.8"/><circle cx="58" cy="80" r="1.4"/><circle cx="50" cy="84" r="1.6"/></g>` +
    `<path class="tc-sw" pathLength="100" d="M14 22 Q44 44 88 78" fill="none" stroke="rgb(255 255 255)" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="100" style="filter:drop-shadow(0 0 1.5px ${K})"/>` +
    `<g class="tc-fake"><path d="M84 13 q4 -6 9 -5" fill="none" stroke="${K}" stroke-width="1.6" stroke-linecap="round"/>${star(93, 8, 3.2, 6, C.orange).replace('stroke-width="2.2"', 'stroke-width="1"')}<circle cx="80" cy="24" r="10" fill="${C.dgreen}" ${k()}/><path d="M73 19 q7 4 14 0 M72 26 q8 4 16 0" stroke="rgb(20 92 58)" stroke-width="1.6" fill="none"/>${face(80, 23, 0.75, 'worry')}<path d="M90 16 q2 3 0 4.5 q-2 -1.5 0 -4.5z" fill="rgb(159 216 255)" stroke="${K}" stroke-width=".8"/></g>`
}
toon.quiver = () => {
  const stuck = (a) => `<g transform="rotate(${a} 50 44)"><path d="M50 22 L52 12" stroke="${C.dbrown}" stroke-width="2.4" stroke-linecap="round"/><path d="M52 12 l-3.5 -4 l4 1.5 l3 -3.5 z" fill="${C.pink}" ${k('stroke-width="1.2"')}/></g>`
  return ground() +
    `<path d="M50 60 L35 93 M50 60 L65 93" stroke="${C.dbrown}" stroke-width="4.5" stroke-linecap="round"/><path d="M50 60 L35 93 M50 60 L65 93" stroke="${C.brown}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<g class="tq-spin"><circle cx="50" cy="44" r="31" fill="rgb(255 255 255)" ${k()}/><circle cx="50" cy="44" r="25" fill="${C.red}"/><circle cx="50" cy="44" r="19" fill="rgb(255 255 255)"/><circle cx="50" cy="44" r="13" fill="${C.red}"/><circle cx="50" cy="44" r="6.5" fill="${C.yellow}" ${k('stroke-width="1.4"')}/>` +
    [0, 90, 180, 270].map(a => `<rect x="48.8" y="13" width="2.4" height="5" rx="1" fill="${K}" transform="rotate(${a} 50 44)"/>`).join('') + stuck(-50) + stuck(130) + `</g>` +
    `<g class="tq-hit">${star(50, 44, 12, 8, 'none').replace(`fill="none"`, `fill="none" stroke-dasharray="2 2"`)}</g>` +
    `<g class="tq-arrow"><path d="M50 44 L86 16" stroke="${K}" stroke-width="4.4" stroke-linecap="round"/><path d="M50 44 L86 16" stroke="${C.tan}" stroke-width="2.4" stroke-linecap="round"/><path d="M84 18 l2 -10 l3 6 l6 -1 l-6 8 z" fill="${C.pink}" ${k('stroke-width="1.4"')}/></g>` +
    `<g transform="translate(14 74) rotate(-14)"><rect x="-7" y="-12" width="14" height="26" rx="5" fill="${C.brown}" ${k()}/><path d="M-3 -12 l-2 -7 M1 -12 l0 -8 M4 -12 l2 -7" stroke="${C.pink}" stroke-width="3" stroke-linecap="round"/></g>`
}
toon.sidekick = () => {
  const bike = (x, y, frame, suit, helm) => `<g transform="translate(${x} ${y})"><circle cx="-11" cy="0" r="6.5" fill="${K}"/><circle cx="-11" cy="0" r="2.4" fill="rgb(197 204 216)"/><circle cx="11" cy="0" r="6.5" fill="${K}"/><circle cx="11" cy="0" r="2.4" fill="rgb(197 204 216)"/><path d="M-13 -3 L-6 -11 H7 L13 -3 L6 0 H-6 Z" fill="${frame}" ${k()}/><rect x="-6" y="-26" width="9" height="16" rx="4.5" fill="${suit}" ${k()}/><circle cx="1" cy="-30" r="6.5" fill="${helm}" ${k()}/><rect x="2" y="-32" width="6" height="3.5" rx="1.5" fill="${K}"/></g>`
  return ground() +
    `<circle cx="22" cy="22" r="11" fill="${C.yellow}" ${k()}/><path d="M-4 66 Q20 50 40 60 T80 54 T104 60 V76 H-4Z" fill="${C.purple}" opacity=".45"/>` +
    `<rect x="-2" y="72" width="104" height="30" fill="${C.road}" ${k()}/><path class="tk-road" d="M-10 88 H110" stroke="rgb(255 255 255)" stroke-width="2.4" stroke-dasharray="8 7"/>` +
    `<g stroke="${K}" stroke-width="1.6" stroke-linecap="round" opacity=".55"><path d="M4 56 h8 M2 64 h10"/></g>` +
    `<g class="tk-rival">${bike(68, 74, C.green, C.purple, C.pink)}</g>` +
    `<g class="tk-bob">${bike(30, 82, C.red, C.blue, C.yellow)}<g class="tk-leg"><path d="M33 58 L54 52" stroke="${K}" stroke-width="7" stroke-linecap="round"/><path d="M33 58 L54 52" stroke="${C.blue}" stroke-width="4.6" stroke-linecap="round"/><ellipse cx="55" cy="51.6" rx="3.6" ry="3" fill="${K}"/></g></g>` +
    `<g class="tk-pow">${star(58, 51, 7)}</g>`
}
toon.tictactoe = () => {
  const cells = [[0, 'X'], [1, 'O'], [4, 'X'], [2, 'O'], [8, 'X']]
  const X = (x, y) => `<path d="M${x - 7} ${y - 7} L${x + 7} ${y + 7} M${x + 7} ${y - 7} L${x - 7} ${y + 7}" stroke="${K}" stroke-width="8.6" stroke-linecap="round"/><path d="M${x - 7} ${y - 7} L${x + 7} ${y + 7} M${x + 7} ${y - 7} L${x - 7} ${y + 7}" stroke="${C.red}" stroke-width="5" stroke-linecap="round"/><circle cx="${x - 1.6}" cy="${y - 0.6}" r="0.9" fill="${K}"/><circle cx="${x + 1.6}" cy="${y - 0.6}" r="0.9" fill="${K}"/>`
  const O = (x, y) => `<circle cx="${x}" cy="${y}" r="7.5" fill="none" stroke="${K}" stroke-width="7.6"/><circle cx="${x}" cy="${y}" r="7.5" fill="none" stroke="${C.teal}" stroke-width="4.2"/>${face(x, y - 0.6, 0.55, 'smile')}`
  return ground() +
    `<rect x="10" y="10" width="80" height="80" rx="10" fill="rgb(255 248 234)" ${k()}/>` +
    `<path d="M36.7 16 V84 M63.3 16 V84 M16 36.7 H84 M16 63.3 H84" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>` +
    cells.map(([c, m], i) => { const x = 23.3 + (c % 3) * 26.7, y = 23.3 + Math.floor(c / 3) * 26.7; return `<g class="tt-m${i}">${m === 'X' ? X(x, y) : O(x, y)}</g>` }).join('') +
    `<g class="tt-win"><path d="M17 17 L83 83" pathLength="100" stroke-dasharray="100" stroke="${K}" stroke-width="6.6" stroke-linecap="round" fill="none"/><path d="M17 17 L83 83" pathLength="100" stroke-dasharray="100" stroke="${C.yellow}" stroke-width="3.6" stroke-linecap="round" fill="none"/></g>`
}

export const SAMPLE_SCENES = toon
