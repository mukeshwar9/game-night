/* eslint-disable react-refresh/only-export-components */
// TOON builders — classic board games, part two.
import { F, A, Ground, Anim, Ball, Star, Spark, Face, Blobby, X, Ring } from '../toonKit'

const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i + Math.PI / 6
  return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`
}).join(' ')

// An S drawn as a thick stroke, centred at (x, y).
const SGlyph = ({ x, y, s = 1, stroke = F.red }) => (
  <path
    d={`M${x + 4.4 * s} ${y - 4.6 * s}C${x + 2 * s} ${y - 8 * s} ${x - 5 * s} ${y - 6 * s} ${x - 3.4 * s} ${y - 2 * s}C${x - 2 * s} ${y + 1.4 * s} ${x + 4 * s} ${y + 0.8 * s} ${x + 4.4 * s} ${y + 4.8 * s}C${x + 3 * s} ${y + 9 * s} ${x - 4 * s} ${y + 8 * s} ${x - 4.6 * s} ${y + 4.4 * s}`}
    fill="none"
    stroke={stroke}
    strokeWidth={3 * s}
    strokeLinecap="round"
  />
)

export default {
  yavalath: () => (
    <>
      <Ground a="p2" b="cta" />
      {[[22, 18], [32, 18], [42, 18], [17, 27], [27, 27], [37, 27], [47, 27], [12, 36], [22, 36], [32, 36], [42, 36], [52, 36], [17, 45], [27, 45], [37, 45], [47, 45], [22, 54], [32, 54], [42, 54]].map(([cx, cy], i) => (
        <polygon key={i} points={hexPts(cx, cy, 6.2)} fill={F.cream} strokeWidth="1.5" />
      ))}
      <Ball x={22} y={36} r={4.2} fill={F.yellow} />
      <Ball x={32} y={36} r={4.2} fill={F.yellow} />
      <Anim k="pop"><Ball x={42} y={36} r={4.2} fill={F.yellow} /></Anim>
      <Ball x={27} y={27} r={4.2} fill={F.red} />
      <Ball x={37} y={27} r={4.2} fill={F.red} />
      <Ball x={32} y={18} r={4.2} fill={F.red} />
      <Anim k="drop" o="50% 100%"><Blobby x={32} y={45} r={4.8} fill={F.purple} mood="wow" /></Anim>
      <Anim k="twinkle"><Spark x={54} y={14} r={4} fill={F.yellow} /></Anim>
    </>
  ),

  connectfour: () => (
    <>
      <Ground a="p1" b="cta" />
      <rect x="7" y="16" width="50" height="42" rx="5" fill={F.blue} />
      {[0, 1, 2, 3].flatMap(r => [0, 1, 2, 3, 4].map(c => {
        const col = [[3, 0, F.red], [3, 1, F.yellow], [3, 2, F.red], [3, 3, F.red], [2, 2, F.yellow], [2, 3, F.yellow], [1, 3, F.red], [3, 4, F.yellow], [2, 1, F.red]].find(([rr, cc]) => rr === r && cc === c)
        return <circle key={`${r}${c}`} cx={15 + c * 8.6} cy={24 + r * 9} r="3.7" fill={col ? col[2] : F.cream} strokeWidth="1.2" />
      }))}
      <Anim k="drop" o="50% 100%">
        <circle cx="32.2" cy="8.4" r="5.2" fill={F.red} />
        <Face x={32.2} y={8.4} s={0.62} mood="wow" blink={false} />
      </Anim>
      <rect x="9" y="56" width="8" height="5" rx="1.6" fill={F.blueD} />
      <rect x="47" y="56" width="8" height="5" rx="1.6" fill={F.blueD} />
    </>
  ),

  dotsandboxes: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="10" y="10" width="20" height="20" fill={A('red', 0.45)} stroke="none" />
      <rect x="30" y="30" width="20" height="20" fill={A('blue', 0.45)} stroke="none" />
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M10 10H30V30H10Z" stroke={F.red} />
        <path d="M30 30H50V50H30Z" stroke={F.blue} />
        <path d="M30 10H50M50 10V30M10 30V50M10 50H30" stroke={F.greyD} strokeWidth="2" />
        <Anim k="pop"><path d="M30 30H50" stroke={F.blue} /></Anim>
      </g>
      <Face x={20} y={19} s={0.8} mood="grin" />
      <Face x={40} y={39} s={0.8} mood="smug" />
      {[10, 30, 50].flatMap(x => [10, 30, 50].map(y => <circle key={`${x}${y}`} cx={x} cy={y} r="3.2" fill={F.ink} stroke="none" />))}
      <Anim k="twinkle"><Star x={54} y={10} r={4.4} /></Anim>
    </>
  ),

  sos: () => (
    <>
      <Ground a="cta" b="p1" />
      <rect x="6" y="6" width="52" height="52" rx="6" fill={F.cream} />
      <g fill="none" stroke={F.tan} strokeWidth="1.3"><path d="M19 8V56M32 8V56M45 8V56M8 19H56M8 32H56M8 45H56" /></g>
      <SGlyph x={12.5} y={32} s={0.9} stroke={F.red} />
      <Anim k="pop"><Ring x={26} y={32} r={4.2} stroke={F.blue} w={2.8} /></Anim>
      <SGlyph x={39.5} y={32} s={0.9} stroke={F.red} />
      <SGlyph x={12.5} y={12.5} s={0.9} stroke={F.green} />
      <Ring x={26} y={51} r={4} stroke={F.green} w={2.6} />
      <SGlyph x={51.5} y={51} s={0.9} stroke={F.green} />
      <path d="M7 32H56" stroke={F.yellow} strokeWidth="1.8" opacity="0.8" />
      <Anim k="bob"><Face x={26} y={32} s={0.45} mood="grin" blink={false} /></Anim>
    </>
  ),

  arrows: () => {
    const Arrow = ({ x, y, rot, fill }) => (
      <g transform={`rotate(${rot} ${x} ${y})`}>
        <path d={`M${x - 6} ${y - 2.4}H${x + 1}V${y - 6}L${x + 7} ${y}L${x + 1} ${y + 6}V${y + 2.4}H${x - 6}Z`} fill={fill} />
      </g>
    )
    return (
      <>
        <Ground a="p2" b="p1" />
        <rect x="6" y="6" width="52" height="52" rx="6" fill={F.indigo} />
        {[0, 1, 2, 3].flatMap(r => [0, 1, 2, 3].map(c => {
          const rots = [0, 90, 180, 270, 90, 0, 270, 180, 180, 270, 0, 90, 270, 180, 90, 0]
          const hero = r === 1 && c === 2
          return hero ? null : <Arrow key={`${r}${c}`} x={14.5 + c * 12} y={14.5 + r * 12} rot={rots[r * 4 + c]} fill={(r + c) % 2 ? F.cream : F.sky} />
        }))}
        <Anim k="slide">
          <circle cx="38.5" cy="26.5" r="7.4" fill={F.yellow} />
          <Face x={38.5} y={26.5} s={0.72} mood="wow" />
        </Anim>
        <Anim k="twinkle"><Spark x={55} y={9} r={3.4} fill={F.yellow} /></Anim>
      </>
    )
  },

  gomoku: () => (
    <>
      <Ground a="cta" b="p1" />
      <rect x="6" y="6" width="52" height="52" rx="5" fill={F.tan} />
      <g fill="none" stroke={F.brownD} strokeWidth="1.2"><path d="M14 10V54M23 10V54M32 10V54M41 10V54M50 10V54M10 14H54M10 23H54M10 32H54M10 41H54M10 50H54" /></g>
      {[[14, 14], [23, 23], [32, 32], [41, 41], [50, 50]].map(([x, y], i) => (
        <Anim key={i} k="pop" t={2.6} d={i * 0.18}><Ball x={x} y={y} r={4.3} fill={F.coal} /></Anim>
      ))}
      <Ball x={32} y={14} r={4.3} fill={F.white} />
      <Ball x={23} y={41} r={4.3} fill={F.white} />
      <Ball x={50} y={23} r={4.3} fill={F.white} />
      <Face x={32} y={32.4} s={0.58} mood="grin" blink={false} />
      <path d="M11 11L53 53" fill="none" stroke={F.yellow} strokeWidth="1.8" opacity="0.85" />
    </>
  ),

  reversi: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="6" y="6" width="52" height="52" rx="5" fill={F.green} />
      <g fill="none" stroke={F.greenD} strokeWidth="1.2"><path d="M19 6V58M32 6V58M45 6V58M6 19H58M6 32H58M6 45H58" /></g>
      <Ball x={25.5} y={25.5} r={5.4} fill={F.white} />
      <Ball x={38.5} y={38.5} r={5.4} fill={F.white} />
      <Ball x={38.5} y={25.5} r={5.4} fill={F.coal} />
      <Ball x={25.5} y={38.5} r={5.4} fill={F.coal} />
      <Ball x={12.5} y={12.5} r={5.4} fill={F.coal} />
      <Ball x={51.5} y={51.5} r={5.4} fill={F.white} />
      <Anim k="spin" t={2.8}>
        <ellipse cx="38.5" cy="12.5" rx="5.4" ry="5.4" fill={F.white} />
      </Anim>
      <Anim k="pulse"><Face x={25.5} y={25.8} s={0.62} mood="happy" blink={false} /></Anim>
      <Face x={38.5} y={38.8} s={0.62} mood="wow" blink={false} />
    </>
  ),

  chainreaction: () => (
    <>
      <Ground a="p2" b="cta" />
      <rect x="6" y="6" width="52" height="52" rx="6" fill={F.night} />
      <g fill="none" stroke={F.indigo} strokeWidth="1.2"><path d="M23.3 8V56M40.7 8V56M8 23.3H56M8 40.7H56" /></g>
      <Anim k="pulse">
        <circle cx="32" cy="32" r="7.4" fill={F.red} />
        <Face x={32} y={32.4} s={0.78} mood="wow" />
      </Anim>
      <g stroke="none" fill={F.yellow}>
        <Anim k="twinkle"><Star x={32} y={32} r={13} fill={A('yellow', 0.55)} rot={18} /></Anim>
      </g>
      <Ball x={14.5} y={14.5} r={4.4} fill={F.blue} />
      <Ball x={14.5} y={49.5} r={3.4} fill={F.blue} />
      <Ball x={49.5} y={14.5} r={4.4} fill={F.green} />
      <Ball x={49.5} y={49.5} r={4.4} fill={F.green} />
      <Ball x={49.5} y={32} r={3.2} fill={F.green} />
      <Ball x={32} y={14.5} r={3.2} fill={F.blue} />
    </>
  ),

  blockade: () => (
    <>
      <Ground a="p1" b="p2" />
      <g>
        {[0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => (
          <rect key={`${r}${c}`} x={8 + c * 12} y={8 + r * 12} width="12" height="12" fill={(r + c) % 2 ? F.tan : F.cream} stroke="none" />
        )))}
        <rect x="8" y="8" width="48" height="48" rx="3" fill="none" />
      </g>
      <rect x="18" y="29.4" width="22" height="4.4" rx="2" fill={F.brown} />
      <rect x="37.6" y="40" width="4.4" height="14" rx="2" fill={F.brown} />
      <Anim k="dash"><Blobby x={14} y={50} r={5} fill={F.red} mood="grin" look={1} /></Anim>
      <Blobby x={50} y={14} r={5} fill={F.blue} mood="smug" look={-1} />
      <path d="M20 50H34" fill="none" stroke={F.red} strokeWidth="1.8" strokeDasharray="2 3" />
      <Anim k="shake"><rect x="14" y="15.6" width="4.4" height="14" rx="2" fill={F.brown} /></Anim>
    </>
  ),

  orderchaos: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="6" y="6" width="52" height="52" rx="6" fill={F.cream} />
      <g fill="none" stroke={F.tan} strokeWidth="1.3"><path d="M19 8V56M32 8V56M45 8V56M8 19H56M8 32H56M8 45H56" /></g>
      {[[12.5, 12.5], [25.5, 25.5], [38.5, 38.5], [51.5, 51.5]].map(([x, y], i) => (
        <Anim key={i} k="pop" t={2.6} d={i * 0.2}><Ring x={x} y={y} r={4.2} stroke={F.blue} w={2.8} /></Anim>
      ))}
      <X x={38.5} y={12.5} s={3.8} fill={F.red} />
      <X x={12.5} y={38.5} s={3.8} fill={F.red} />
      <X x={51.5} y={25.5} s={3.8} fill={F.red} />
      <X x={25.5} y={51.5} s={3.8} fill={F.red} />
      <path d="M10 10L54 54" fill="none" stroke={F.yellow} strokeWidth="1.8" opacity="0.85" />
      <Anim k="bob"><Face x={32} y={32} s={0.62} mood="smug" /></Anim>
    </>
  ),
}
