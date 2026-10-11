/* eslint-disable react-refresh/only-export-components */
// TOON builders — board games part three and the memory games.
import { F, A, Ground, Anim, Ball, Star, Spark, Face, Blobby, Heart, Pips, Seg, Ring, Glint } from '../toonKit'

const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i + Math.PI / 6
  return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`
}).join(' ')

const Card = ({ x, y, w = 15, h = 19, fill = F.cream, rot = 0, children }) => (
  <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
    <rect x={x} y={y} width={w} height={h} rx="2.6" fill={fill} />
    {children}
  </g>
)

const Lantern = ({ x, y, fill, mood }) => (
  <g>
    <path d={`M${x} ${y - 6}V${y}`} fill="none" strokeWidth="1.4" />
    <rect x={x - 3} y={y - 1.4} width="6" height="2.6" rx="1" fill={F.yellowD} />
    <ellipse cx={x} cy={y + 7} rx="6.4" ry="7.2" fill={fill} />
    <Glint x={x - 2.4} y={y + 3.4} w={2.6} h={1.5} />
    <rect x={x - 2.6} y={y + 13.4} width="5.2" height="2.2" rx="1" fill={F.yellowD} />
    <Face x={x} y={y + 7} s={0.5} mood={mood} blink={false} />
  </g>
)

export default {
  hex: () => (
    <>
      <Ground a="p1" b="p2" />
      <path d="M6 14L24 6L30 10L12 18Z" fill={F.red} stroke="none" />
      <path d="M34 54L52 46L58 50L40 58Z" fill={F.red} stroke="none" />
      <path d="M6 14L12 18L40 58L34 54Z" fill={F.blue} stroke="none" />
      <path d="M24 6L30 10L58 50L52 46Z" fill={F.blue} stroke="none" />
      {[0, 1, 2, 3].flatMap(r => [0, 1, 2, 3].map(c => {
        const x = 20 + c * 9.6 + r * 4.8, y = 17 + r * 8.6
        const stone = { '0,0': F.red, '1,1': F.red, '2,1': F.red, '3,2': F.red, '1,2': F.blue, '2,3': F.blue, '0,2': F.blue }[`${r},${c}`]
        return (
          <g key={`${r}${c}`}>
            <polygon points={hexPts(x, y, 5.1)} fill={F.cream} strokeWidth="1.4" />
            {stone && <Ball x={x} y={y} r={3.4} fill={stone} />}
          </g>
        )
      }))}
      <Anim k="drop" t={2.6} o="50% 100%"><Blobby x={39.4} y={34.4} r={4.4} fill={F.red} mood="grin" /></Anim>
      <Anim k="twinkle" t={1.8}><Spark x={54} y={14} r={3.6} fill={F.yellow} /></Anim>
    </>
  ),

  battleship: () => (
    <>
      <Ground a="p1" b="p2" floor={38} floorRole="p1" />
      <g fill="none" stroke={A('white', 0.7)} strokeWidth="1.4" strokeLinecap="round"><path d="M4 48Q9 44 14 48T24 48M40 56Q45 52 50 56T60 56" /></g>
      <Anim k="bob" t={2.6}>
        <path d="M8 34H48L42 46H14Z" fill={F.greyD} />
        <rect x="16" y="24" width="20" height="10" rx="2" fill={F.grey} />
        <rect x="21" y="16" width="7" height="9" rx="1.6" fill={F.red} />
        <rect x="30" y="26" width="12" height="4" rx="2" fill={F.coal} />
        <Face x={26} y={29.6} s={0.55} mood="wow" />
        <path d="M14 38H42" stroke={A('white', 0.5)} strokeWidth="1.4" fill="none" />
      </Anim>
      <Anim k="pop" t={2.4}><Star x={52} y={20} r={9} fill={F.orange} rot={12} /></Anim>
      <Star x={52} y={20} r={5} fill={F.yellow} />
      <Anim k="float" t={2.4}><circle cx="52" cy="10" r="3" fill={F.grey} /></Anim>
      <Ring x={52} y={20} r={11.5} stroke={F.red} w={1.6} />
      <Anim k="twinkle" t={1.9}><Spark x={10} y={14} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  faceoff: () => {
    const Head = ({ x, y, hair, beard }) => (
      <g>
        <circle cx={x + 7.5} cy={y + 10} r="5.4" fill={F.skin} strokeWidth="1.5" />
        <path d={`M${x + 2} ${y + 8.6}Q${x + 7.5} ${y + 1.6} ${x + 13} ${y + 8.6}Z`} fill={hair} strokeWidth="1.4" />
        {beard && <path d={`M${x + 3} ${y + 12}Q${x + 7.5} ${y + 19} ${x + 12} ${y + 12}Z`} fill={hair} strokeWidth="1.4" />}
        <circle cx={x + 5.4} cy={y + 10} r="0.9" fill={F.ink} stroke="none" /><circle cx={x + 9.6} cy={y + 10} r="0.9" fill={F.ink} stroke="none" />
      </g>
    )
    const Back = ({ x, y }) => (
      <Card x={x} y={y} fill={F.indigo}>
        <circle cx={x + 7.5} cy={y + 9.5} r="3.6" fill={A('white', 0.35)} stroke="none" />
      </Card>
    )
    return (
      <>
        <Ground a="p2" b="cta" />
        <Card x={6} y={8} fill={F.cream}><Head x={6} y={8} hair={F.brownD} beard /></Card>
        <Back x={24.5} y={8} />
        <Card x={43} y={8} fill={F.cream}><Head x={43} y={8} hair={F.yellowD} /></Card>
        <Back x={6} y={33} />
        <Anim k="jelly" t={2.4}><Card x={24.5} y={33} fill={F.yellow}><Head x={24.5} y={33} hair={F.red} /></Card></Anim>
        <Card x={43} y={33} fill={F.cream}><Head x={43} y={33} hair={F.coal} beard /></Card>
        <Anim k="twinkle" t={1.8}><Spark x={58} y={30} r={3.4} fill={F.yellow} /></Anim>
      </>
    )
  },

  mancala: () => (
    <>
      <Ground a="cta" b="p1" />
      <rect x="4" y="16" width="56" height="32" rx="11" fill={F.brown} />
      <rect x="7" y="19" width="9" height="26" rx="4.5" fill={F.brownD} />
      <rect x="48" y="19" width="9" height="26" rx="4.5" fill={F.brownD} />
      {[0, 1, 2, 3].flatMap(c => [0, 1].map(r => (
        <ellipse key={`${c}${r}`} cx={24 + c * 6.4 + (c > 1 ? 0 : 0)} cy={25 + r * 14} rx="3" ry="3.6" fill={F.brownD} strokeWidth="1.2" />
      )))}
      {[[24.4, 25, F.red], [30.8, 25, F.sky], [37.2, 39, F.yellow], [30.8, 39, F.green], [43.6, 25, F.pink], [24.4, 39, F.sky]].map(([x, y, f], i) => <circle key={i} cx={x} cy={y} r="1.9" fill={f} strokeWidth="1" />)}
      <Ball x={11.5} y={31} r={2.2} fill={F.red} glint={false} />
      <Ball x={52.5} y={33} r={2.2} fill={F.sky} glint={false} />
      <Anim k="hop" t={2.4} o="50% 100%"><Blobby x={34} y={10} r={5.2} fill={F.yellow} mood="grin" /></Anim>
      <Anim k="twinkle" t={1.8}><Spark x={54} y={8} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  checkers: () => (
    <>
      <Ground a="p1" b="p2" />
      <g>
        {[0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(c => (
          <rect key={`${r}${c}`} x={7 + c * 10} y={7 + r * 10} width="10" height="10" fill={(r + c) % 2 ? F.brown : F.cream} stroke="none" />
        )))}
        <rect x="7" y="7" width="50" height="50" rx="3" fill="none" />
      </g>
      <Ball x={42} y={22} r={4} fill={F.coal} />
      <Ball x={22} y={22} r={4} fill={F.coal} />
      <Ball x={52} y={12} r={4} fill={F.coal} />
      <Ball x={12} y={52} r={4} fill={F.red} />
      <Ball x={32} y={52} r={4} fill={F.red} />
      <Ball x={22} y={42} r={4} fill={F.red} />
      <path d="M32 42L42 32" fill="none" stroke={F.yellow} strokeWidth="1.6" strokeDasharray="2 2.6" />
      <Anim k="hop" t={2.4} o="50% 100%">
        <Ball x={32} y={32} r={5.6} fill={F.red} />
        <path d="M27.4 24.6L29 20L32 23L35 20L36.6 24.6Z" fill={F.yellow} />
        <Face x={32} y={33} s={0.7} mood="grin" />
      </Anim>
    </>
  ),

  lanterns: () => (
    <>
      <Ground a="p2" b="cta" />
      <rect x="4" y="4" width="56" height="56" rx="6" fill={F.night} />
      <path d="M2 10Q32 20 62 10" fill="none" stroke={F.yellowD} strokeWidth="1.6" />
      <g stroke="none" fill={F.white}><circle cx="52" cy="8" r="1" /><circle cx="10" cy="30" r="1" /><circle cx="56" cy="34" r="1" /></g>
      <Anim k="sway" t={3} o="50% 0%"><Lantern x={14} y={16} fill={F.red} mood="happy" /></Anim>
      <Anim k="sway" t={3} d={0.5} o="50% 0%"><Lantern x={32} y={20} fill={F.yellow} mood="grin" /></Anim>
      <Anim k="sway" t={3} d={1} o="50% 0%"><Lantern x={50} y={16} fill={F.pink} mood="wow" /></Anim>
      <Card x={10} y={42} fill={F.cream} rot={-8}><circle cx="17.5" cy="52" r="3.4" fill={F.red} stroke="none" /></Card>
      <Card x={41} y={42} fill={F.cream} rot={8}><circle cx="48.5" cy="52" r="3.4" fill={F.blue} stroke="none" /></Card>
    </>
  ),

  hunch: () => (
    <>
      <Ground a="p1" b="cta" />
      <Card x={6} y={22} w={20} h={28} rot={-14} fill={F.cream}><Pips x={16} y={36} n={3} d={4.2} r={1.5} fill={F.red} /></Card>
      <Card x={38} y={22} w={20} h={28} rot={14} fill={F.cream}><Pips x={48} y={36} n={6} d={3.8} r={1.4} fill={F.blue} /></Card>
      <Anim k="bob" t={2.4}>
        <Card x={22} y={14} w={20} h={28} fill={F.paper}><Pips x={32} y={26} n={4} d={4} r={1.5} fill={F.green} /></Card>
        <Face x={32} y={36} s={0.55} mood="focus" />
      </Anim>
      <Anim k="pop" t={2.6}><path d="M26 52Q32 47 38 52" fill="none" stroke={F.ink} strokeWidth="2" /></Anim>
      <Anim k="twinkle" t={1.8}><Spark x={54} y={10} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  simon: () => (
    <>
      <Ground a="p1" b="p2" />
      <path d="M32 32V8A24 24 0 0 0 8 32Z" fill={F.green} />
      <path d="M32 32H56A24 24 0 0 0 32 8Z" fill={F.red} />
      <path d="M32 32V56A24 24 0 0 0 56 32Z" fill={F.blue} />
      <path d="M32 32H8A24 24 0 0 0 32 56Z" fill={F.yellow} />
      <Anim k="pulse" t={2.4} o="75% 25%"><path d="M32 32H56A24 24 0 0 0 32 8Z" fill={A('white', 0.5)} stroke="none" /></Anim>
      <circle cx="32" cy="32" r="9" fill={F.coal} />
      <Face x={32} y={32} s={0.92} mood="grin" />
    </>
  ),

  chimp: () => (
    <>
      <Ground a="p2" b="cta" />
      <Card x={5} y={5} w={16} h={16} fill={F.yellow}><Pips x={13} y={13} n={1} r={1.9} /></Card>
      <Card x={43} y={5} w={16} h={16} fill={F.cream}><Pips x={51} y={13} n={2} d={3} /></Card>
      <Card x={44} y={43} w={16} h={16} fill={F.cream}><Pips x={52} y={51} n={3} d={3} r={1.1} /></Card>
      <Anim k="bob" t={2.6}>
        <circle cx="14" cy="38" r="5.4" fill={F.brown} /><circle cx="14" cy="38" r="2.6" fill={F.skinD} stroke="none" />
        <circle cx="42" cy="38" r="5.4" fill={F.brown} /><circle cx="42" cy="38" r="2.6" fill={F.skinD} stroke="none" />
        <ellipse cx="28" cy="38" rx="15" ry="14.5" fill={F.brown} />
        <ellipse cx="28" cy="44" rx="10" ry="8" fill={F.skin} />
        <Face x={28} y={39} s={1} mood="grin" />
      </Anim>
    </>
  ),

  numbermemory: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="6" y="10" width="52" height="36" rx="5" fill={F.coal} />
      <rect x="10" y="14" width="44" height="28" rx="3" fill={F.night} strokeWidth="1.4" />
      {[8, 3, 9, 1, 5].map((n, i) => <Anim key={i} k="pop" t={2.6} d={i * 0.18}><Seg x={14.8 + i * 8.6} y={26} h={10} n={n} fill={F.lime} /></Anim>)}
      <rect x="14" y="36" width="36" height="3.4" rx="1.7" fill={F.coal} strokeWidth="1" />
      <Anim k="slide" t={2.6}><rect x="14" y="36" width="20" height="3.4" rx="1.7" fill={F.yellow} strokeWidth="1" /></Anim>
      <rect x="26" y="46" width="12" height="6" fill={F.greyD} />
      <rect x="18" y="52" width="28" height="5" rx="2.5" fill={F.grey} />
      <Anim k="bob" t={2.3}><Face x={47} y={48} s={0.55} mood="wow" /></Anim>
    </>
  ),

  visualmemory: () => (
    <>
      <Ground a="p2" b="p1" />
      <rect x="6" y="6" width="52" height="52" rx="6" fill={F.indigo} />
      {[0, 1, 2].flatMap(r => [0, 1, 2].map(c => {
        const lit = (r === 0 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 0)
        const x = 10 + c * 16.4, y = 10 + r * 16.4
        return <rect key={`${r}${c}`} x={x} y={y} width="14.4" height="14.4" rx="3.4" fill={lit ? F.yellow : F.blue} strokeWidth="1.6" />
      }))}
      <Anim k="pulse" t={2.2}><Face x={42.4} y={25.4} s={0.78} mood="happy" /></Anim>
      <Anim k="pulse" t={2.2} d={0.4}><Face x={26} y={17.8} s={0.78} mood="wow" /></Anim>
      <Face x={17.6} y={50.4} s={0.78} mood="smug" />
      <Anim k="twinkle" t={1.8}><Spark x={56} y={8} r={3.6} fill={F.white} /></Anim>
    </>
  ),

  pairs: () => (
    <>
      <Ground a="p1" b="p2" />
      <Card x={6} y={9} w={16} h={21} fill={F.indigo}><Star x={14} y={19.5} r={3.4} fill={A('white', 0.5)} /></Card>
      <Card x={24} y={9} w={16} h={21} fill={F.indigo}><Star x={32} y={19.5} r={3.4} fill={A('white', 0.5)} /></Card>
      <Anim k="jelly" t={2.4}><Card x={42} y={9} w={16} h={21} fill={F.cream}><Heart x={50} y={20} s={1.2} /></Card></Anim>
      <Card x={6} y={34} w={16} h={21} fill={F.indigo}><Star x={14} y={44.5} r={3.4} fill={A('white', 0.5)} /></Card>
      <Anim k="jelly" t={2.4} d={0.3}><Card x={24} y={34} w={16} h={21} fill={F.cream}><Heart x={32} y={45} s={1.2} /></Card></Anim>
      <Card x={42} y={34} w={16} h={21} fill={F.indigo}><Star x={50} y={44.5} r={3.4} fill={A('white', 0.5)} /></Card>
    </>
  ),
}
