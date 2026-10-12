 
// Drawing helpers for the TOON builders. Everything lives in a 64×64 viewBox
// under a root <g> that sets the ink outline (stroke inherits), so a builder
// only picks fills. Characters use the fixed palette (toonPalette.js); the
// ground follows the theme tokens.
import { F, A, themed } from './toonPalette'
import { textStrokes, textWidth } from '../../lib/artGlyphs'

export { F, A }

// The tile's ground: surface plus two soft wash circles in the theme's player
// accents (a/b: p1 p2 p3 p4 cta win danger), and an optional floor band.
export function Ground({ a = 'p1', b = 'p2', floor, floorRole = 'deep' }) {
  return (
    <g stroke="none">
      <rect width="64" height="64" style={themed('surface')} />
      <circle cx="6" cy="4" r="30" style={themed(a, 0.24)} />
      <circle cx="62" cy="64" r="30" style={themed(b, 0.24)} />
      {floor != null && <rect y={floor} width="64" height={64 - floor} style={themed(floorRole, 0.9)} />}
    </g>
  )
}

// A group that loops one of the toon.css keyframes. Every loop runs on the shared 2.4 s clock so a
// tile's parts move on one beat; d = start delay (s, at most 0.5) staggers a part off it, t = loop length (s)
// is for the continuous kinds only (spin, blink), o = transform-origin ('50% 100%' squashes from
// the feet).
export function Anim({ k, d = 0, t, o, children }) {
  const style = { '--k': `tn-${k}`, '--d': `${Math.min(d, 0.5)}s` }
  if (t && (k === 'spin' || k === 'blink')) style['--t'] = `${t}s`
  if (o) style['--o'] = o
  return <g className="tn" style={style}>{children}</g>
}

// A soft white glint, drawn over a fill.
export const Glint = ({ x, y, w = 4, h = 2, rot = -25 }) => (
  <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} fill={A('white', 0.6)} stroke="none" transform={`rotate(${rot} ${x} ${y})`} />
)

export const Ball = ({ x, y, r, fill = F.red, glint = true }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={fill} />
    {glint && <Glint x={x - r * 0.35} y={y - r * 0.4} w={r * 0.7} h={r * 0.38} />}
  </g>
)

// A rounded block with a glint strip across the top.
export const Block = ({ x, y, w, h, r = 3, fill = F.blue, glint = true }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} />
    {glint && <rect x={x + 2} y={y + 1.6} width={Math.max(1, w - 4)} height="1.6" rx="0.8" fill={A('white', 0.5)} stroke="none" />}
  </g>
)

export const Star = ({ x, y, r = 4, fill = F.yellow, rot = 0 }) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const d = i % 2 ? r * 0.46 : r
    return `${(x + Math.cos(a) * d).toFixed(2)},${(y + Math.sin(a) * d).toFixed(2)}`
  }).join(' ')
  return <polygon points={pts} fill={fill} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined} />
}

// A four-point sparkle (no outline).
export const Spark = ({ x, y, r = 3, fill = F.white }) => (
  <path
    d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
    fill={fill}
    stroke="none"
  />
)

export const Heart = ({ x, y, s = 1, fill = F.red }) => (
  <path
    d={`M${x} ${y + 4 * s}C${x - 7 * s} ${y - 1 * s} ${x - 4 * s} ${y - 6 * s} ${x} ${y - 2.4 * s}C${x + 4 * s} ${y - 6 * s} ${x + 7 * s} ${y - 1 * s} ${x} ${y + 4 * s}Z`}
    fill={fill}
  />
)

// A face on whatever is drawn under it. mood: happy | grin | wow | sad | smug | focus.
export function Face({ x, y, s = 1, mood = 'happy', look = 0, blink = true }) {
  const ey = y - 1.2 * s
  const gap = 3.6 * s
  const eye = (cx) => (
    <g key={cx}>
      <ellipse cx={cx} cy={ey} rx={2.5 * s} ry={2.9 * s} fill={F.white} strokeWidth={1.1 * s} />
      <circle cx={cx + look * 0.9 * s} cy={ey + 0.3 * s} r={1.35 * s} fill={F.ink} stroke="none" />
      <circle cx={cx + look * 0.9 * s + 0.5 * s} cy={ey - 0.4 * s} r={0.45 * s} fill={F.white} stroke="none" />
    </g>
  )
  const eyes = (
    <g>
      {eye(x - gap)}
      {eye(x + gap)}
    </g>
  )
  const sw = { fill: 'none', strokeWidth: 1.3 * s, strokeLinecap: 'round' }
  let mouth
  if (mood === 'grin') {
    mouth = <path d={`M${x - 3.2 * s} ${y + 3 * s}Q${x} ${y + 8.4 * s} ${x + 3.2 * s} ${y + 3 * s}Z`} fill={F.ink} strokeWidth={0.8 * s} />
  } else if (mood === 'wow') {
    mouth = <ellipse cx={x} cy={y + 5 * s} rx={1.7 * s} ry={2.3 * s} fill={F.ink} strokeWidth={0.6 * s} />
  } else if (mood === 'sad') {
    mouth = <path d={`M${x - 2.4 * s} ${y + 5.6 * s}Q${x} ${y + 3.2 * s} ${x + 2.4 * s} ${y + 5.6 * s}`} {...sw} />
  } else if (mood === 'smug') {
    mouth = <path d={`M${x - 2.6 * s} ${y + 4 * s}Q${x + 0.6 * s} ${y + 6.2 * s} ${x + 3 * s} ${y + 3.4 * s}`} {...sw} />
  } else if (mood === 'focus') {
    mouth = <path d={`M${x - 2 * s} ${y + 4.6 * s}H${x + 2 * s}`} {...sw} />
  } else {
    mouth = <path d={`M${x - 2.8 * s} ${y + 3.4 * s}Q${x} ${y + 6.8 * s} ${x + 2.8 * s} ${y + 3.4 * s}`} {...sw} />
  }
  return (
    <g>
      <g stroke="none" fill={A('pink', 0.55)}>
        <ellipse cx={x - gap - 2.2 * s} cy={y + 3.4 * s} rx={1.7 * s} ry={1.1 * s} />
        <ellipse cx={x + gap + 2.2 * s} cy={y + 3.4 * s} rx={1.7 * s} ry={1.1 * s} />
      </g>
      {blink ? <Anim k="blink" t={3.6} d={(x * 0.13) % 1.4}>{eyes}</Anim> : eyes}
      {mouth}
    </g>
  )
}

// A little round character: body blob + face, ready to hop.
export const Blobby = ({ x, y, r = 6, fill = F.sky, mood = 'happy', look = 0 }) => (
  <g>
    <ellipse cx={x} cy={y} rx={r} ry={r * 0.94} fill={fill} />
    <Glint x={x - r * 0.45} y={y - r * 0.55} w={r * 0.7} h={r * 0.36} />
    <Face x={x} y={y + r * 0.05} s={r / 6.4} mood={mood} look={look} />
  </g>
)

export const X = ({ x, y, s = 5, fill = F.red, w = 2.6 }) => (
  <path d={`M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`} fill="none" stroke={fill} strokeWidth={w} strokeLinecap="round" />
)

export const Ring = ({ x, y, r = 5, stroke = F.blue, w = 2.6 }) => (
  <circle cx={x} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={w} />
)

// A speech bubble with a short tail pointing down-left.
export const Bubble = ({ x, y, w = 16, h = 11, children }) => (
  <g>
    <path
      d={`M${x + 3} ${y + h}L${x - 1.5} ${y + h + 4.5}L${x + 8} ${y + h}`}
      fill={F.white}
      strokeLinejoin="round"
    />
    <rect x={x} y={y} width={w} height={h} rx="4" fill={F.white} />
    <rect x={x + 2} y={y + h - 2.2} width="7" height="3.4" fill={F.white} stroke="none" />
    {children}
  </g>
)

// Dots on a die face, centred at (x, y), 1–6.
export const Pips = ({ x, y, n, d = 3.4, r = 1.15, fill = F.ink }) => {
  const at = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  }[n]
  return (
    <g stroke="none" fill={fill}>
      {at.map(([dx, dy], i) => <circle key={i} cx={x + dx * d} cy={y + dy * d} r={r} />)}
    </g>
  )
}

export const Die = ({ x, y, s = 14, n = 6, fill = F.white }) => (
  <g>
    <rect x={x} y={y} width={s} height={s} rx={s * 0.22} fill={fill} />
    <Pips x={x + s / 2} y={y + s / 2} n={n} d={s * 0.25} r={s * 0.085} />
  </g>
)

// One 7-segment digit (0–9), h tall, centred horizontally on x.
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' }
export function Seg({ x, y, h = 12, n, fill = F.lime }) {
  const w = h * 0.55, hh = h / 2
  const L = {
    a: [[-w / 2, -hh], [w / 2, -hh]], b: [[w / 2, -hh], [w / 2, 0]], c: [[w / 2, 0], [w / 2, hh]], d: [[-w / 2, hh], [w / 2, hh]],
    e: [[-w / 2, 0], [-w / 2, hh]], f: [[-w / 2, -hh], [-w / 2, 0]], g: [[-w / 2, 0], [w / 2, 0]],
  }
  return (
    <g fill="none" stroke={fill} strokeWidth={h * 0.17} strokeLinecap="round">
      {[...SEGS[n]].map(k => <path key={k} d={`M${x + L[k][0][0]} ${y + L[k][0][1]}L${x + L[k][1][0]} ${y + L[k][1][1]}`} />)}
    </g>
  )
}

// Stroke letters (lib/artGlyphs.js), centred on x; h is the letter height.
export function Letters({ text, x, y, h = 8, fill = F.ink, w = h * 0.2 }) {
  const strokes = textStrokes(text, x - textWidth(text, h) / 2, y - h / 2, h)
  return (
    <g fill="none" stroke={fill} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {strokes.map((pts, i) => <path key={i} d={`M${pts.map(([a, b]) => `${a.toFixed(2)} ${b.toFixed(2)}`).join('L')}`} />)}
    </g>
  )
}
