// TOON characters and props sit on a fixed cartoon palette (like avatars, so a
// red apple stays red in 1-BIT MONO); only the ground follows the theme
// tokens. Colours are RGB channel triplets — never hex strings in src/.
export const K = {
  ink: '52 38 66', white: '255 255 255', cream: '255 246 220', paper: '250 238 205',
  red: '240 84 84', redD: '196 56 70', orange: '255 146 60', orangeD: '222 108 40',
  yellow: '255 205 60', yellowD: '226 164 36', lime: '150 208 84', green: '70 180 110', greenD: '44 138 82',
  teal: '50 190 190', tealD: '30 148 156', sky: '104 188 244', blue: '70 124 232', blueD: '48 88 188',
  indigo: '112 100 222', purple: '164 104 224', purpleD: '124 72 184', pink: '255 132 184', pinkD: '222 92 148',
  brown: '170 114 72', brownD: '128 80 50', tan: '226 184 134', grey: '176 176 192', greyD: '112 112 134',
  skin: '255 208 164', skinD: '216 156 112', night: '40 36 78', coal: '70 66 96',
}

const wrap = (t, a) => (a == null ? `rgb(${t})` : `rgb(${t} / ${a})`)

// F.red → 'rgb(240 84 84)'; A('red', .4) → with alpha.
export const F = Object.fromEntries(Object.entries(K).map(([k, v]) => [k, wrap(v)]))
export const A = (name, alpha) => wrap(K[name], alpha)

// Theme-token fills for the ground: spread onto an element's style.
export const themed = (role, alpha) => ({ fill: wrap(`var(--c-${role})`, alpha) })
