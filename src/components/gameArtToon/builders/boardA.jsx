/* eslint-disable react-refresh/only-export-components */
// TOON builders — classic board games, part one.
import { F, A, Ground, Anim, Ball, Block, Star, Spark, Face, Blobby, X, Ring, Glint } from '../toonKit'

// A chunky pawn: base, body, head with a face.
const Pawn = ({ x, y, fill, mood = 'happy', s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="0" rx="6.4" ry="2.6" fill={fill} />
    <path d="M-4.2 0C-4 -5 -2.4 -7 0 -7S4 -5 4.2 0Z" fill={fill} />
    <circle cx="0" cy="-10" r="4.6" fill={fill} />
    <Glint x={-1.6} y={-11.8} w={2.6} h={1.4} />
    <Face x="0" y="-9.6" s={0.5} mood={mood} blink={false} />
  </g>
)

// A tall tower piece with a coloured cap.
const Tower = ({ x, y, fill, cap }) => (
  <g>
    <rect x={x - 4.2} y={y - 11} width="8.4" height="11" rx="2.4" fill={fill} />
    <ellipse cx={x} cy={y - 11} rx="4.2" ry="2" fill={cap} />
    <Glint x={x - 1.8} y={y - 6} w={1.8} h={4.4} rot={0} />
  </g>
)

export default {
  tictactoe: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="9" y="9" width="46" height="46" rx="7" fill={F.cream} />
      <path d="M24.3 12V52M39.7 12V52M12 24.3H52M12 39.7H52" fill="none" stroke={F.brown} strokeWidth="2.4" />
      <Ring x={32} y={32} r={4.6} stroke={F.blue} w={2.8} />
      <Ring x={47} y={17} r={4.6} stroke={F.blue} w={2.8} />
      <X x={17} y={47} s={4.2} fill={F.red} />
      <Anim k="pop" t={2.6}><X x={17} y={17} s={4.2} fill={F.red} /></Anim>
      <Anim k="pop" t={2.6} d={0.25}><X x={32} y={32} s={0} fill={F.red} /></Anim>
      <Anim k="pop" t={2.6} d={0.5}><X x={47} y={47} s={4.2} fill={F.red} /></Anim>
      <path d="M13 13L51 51" fill="none" stroke={F.yellow} strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      <Anim k="bob" t={2.2}><Face x={32} y={30} s={0.7} mood="grin" /></Anim>
    </>
  ),

  sim: () => (
    <>
      <Ground a="p1" b="p2" />
      <g fill="none" strokeLinecap="round">
        <path d="M32 9L53 21L53 43L32 55L11 43L11 21Z" stroke={A('greyD', 0.35)} strokeWidth="1.6" />
        <path d="M32 9L53 43M32 9L11 43M11 43L53 43" stroke={F.red} strokeWidth="2.8" />
        <path d="M11 21L53 21M11 21L32 55M53 21L32 55" stroke={F.blue} strokeWidth="2.8" />
      </g>
      <Anim k="pulse" t={2.4}><Ball x={32} y={9} r={5.4} fill={F.yellow} /></Anim>
      <Anim k="pulse" t={2.4} d={0.4}><Ball x={53} y={21} r={5.4} fill={F.white} /></Anim>
      <Ball x={53} y={43} r={5.4} fill={F.white} />
      <Anim k="pulse" t={2.4} d={0.8}><Ball x={32} y={55} r={5.4} fill={F.white} /></Anim>
      <Ball x={11} y={43} r={5.4} fill={F.white} />
      <Ball x={11} y={21} r={5.4} fill={F.white} />
      <Face x={32} y={9.4} s={0.78} mood="wow" />
    </>
  ),

  chomp: () => (
    <>
      <Ground a="cta" b="p2" />
      <g>
        {[0, 1, 2, 3].flatMap(r => [0, 1, 2, 3, 4].map(c => {
          const bitten = (r === 3 && c >= 3) || (r === 2 && c === 4)
          if (bitten) return null
          const poison = r === 0 && c === 0
          return <Block key={`${r}${c}`} x={8 + c * 9.6} y={12 + r * 9.6} w="9.6" h="9.6" r="2" fill={poison ? F.lime : F.brown} glint={!poison} />
        }))}
      </g>
      <Anim k="shake" t={2.4}><Face x={12.8} y={16.8} s={0.62} mood="sad" blink={false} /></Anim>
      <Anim k="hop" t={2.4} o="50% 100%">
        <path d="M45 50A8 8 0 1 1 57 56L51 51Z" fill={F.yellow} />
        <circle cx="50.2" cy="45.8" r="1.2" fill={F.ink} stroke="none" />
      </Anim>
      <g stroke="none" fill={F.brownD}><circle cx="43" cy="44" r="1.2" /><circle cx="41" cy="50" r="1" /></g>
    </>
  ),

  breakthrough: () => (
    <>
      <Ground a="p2" b="p1" />
      <g>
        {[0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => (
          <rect key={`${r}${c}`} x={8 + c * 12} y={8 + r * 12} width="12" height="12" fill={(r + c) % 2 ? F.tan : F.cream} stroke="none" />
        )))}
        <rect x="8" y="8" width="48" height="48" rx="3" fill="none" />
      </g>
      <Pawn x={14} y={19} fill={F.blue} mood="smug" s={0.8} />
      <Pawn x={26} y={19} fill={F.blue} mood="smug" s={0.8} />
      <Pawn x={38} y={19} fill={F.blue} mood="wow" s={0.8} />
      <Pawn x={50} y={19} fill={F.blue} mood="smug" s={0.8} />
      <Pawn x={14} y={55} fill={F.red} s={0.8} />
      <Anim k="hop" t={2.4} o="50% 100%"><Pawn x={38} y={43} fill={F.red} mood="grin" s={0.8} /></Anim>
      <Pawn x={50} y={55} fill={F.red} s={0.8} />
      <Anim k="twinkle" t={1.6}><Star x={54} y={8} r={4} /></Anim>
    </>
  ),

  ataxx: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="7" y="7" width="50" height="50" rx="5" fill={F.teal} />
      <g fill="none" stroke={F.tealD} strokeWidth="1.1"><path d="M17 7V57M27 7V57M37 7V57M47 7V57M7 17H57M7 27H57M7 37H57M7 47H57" /></g>
      <Blobby x={12} y={12} r={4.2} fill={F.blue} mood="happy" />
      <Blobby x={22} y={12} r={4.2} fill={F.blue} mood="smug" />
      <Blobby x={52} y={52} r={4.2} fill={F.red} mood="grin" />
      <Blobby x={42} y={52} r={4.2} fill={F.red} mood="happy" />
      <Blobby x={52} y={42} r={4.2} fill={F.red} mood="wow" />
      <Anim k="jelly" t={2.4}><Blobby x={32} y={32} r={5.4} fill={F.red} mood="grin" /></Anim>
      <Anim k="pop" t={2.4} d={0.2}><Blobby x={42} y={32} r={4.6} fill={F.red} mood="happy" /></Anim>
      <Blobby x={22} y={22} r={4.2} fill={F.blue} mood="wow" />
      <path d="M35 29Q38 26 40 29" fill="none" stroke={F.yellow} strokeWidth="1.8" />
    </>
  ),

  kamisado: () => {
    const cols = [F.orange, F.blue, F.purple, F.pink, F.yellow, F.green, F.red, F.brown, F.tan, F.teal, F.sky, F.lime, F.indigo, F.orangeD, F.blueD, F.greenD]
    return (
      <>
        <Ground a="p2" b="cta" />
        <g>
          {[0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => (
            <rect key={`${r}${c}`} x={8 + c * 12} y={14 + r * 11} width="12" height="11" fill={cols[(r * 5 + c * 3) % cols.length]} />
          )))}
        </g>
        <Tower x={14} y={50} fill={F.coal} cap={F.orange} />
        <Tower x={26} y={50} fill={F.coal} cap={F.blue} />
        <Anim k="hop" t={2.4} o="50% 100%">
          <Tower x={38} y={39} fill={F.cream} cap={F.pink} />
          <Face x={38} y={31.6} s={0.62} mood="grin" blink={false} />
        </Anim>
        <Tower x={50} y={17} fill={F.coal} cap={F.yellow} />
        <Anim k="twinkle" t={1.8}><Spark x={50} y={7} r={3.4} fill={F.yellow} /></Anim>
      </>
    )
  },

  onitama: () => (
    <>
      <Ground a="p1" b="cta" />
      <g transform="rotate(-9 20 36)">
        <rect x="6" y="18" width="26" height="36" rx="3.5" fill={F.cream} />
        <g stroke="none" fill={F.red}>
          {[[0, 0], [1, -1], [1, 1], [-1, 0], [0, 1]].map(([dx, dy], i) => <rect key={i} x={15.6 + dx * 4.6} y={34.6 + dy * 4.6} width="3.8" height="3.8" rx="0.8" />)}
        </g>
        <rect x="14.4" y="32.4" width="5" height="5" rx="1" fill={F.ink} stroke="none" />
      </g>
      <g transform="rotate(8 46 38)">
        <rect x="34" y="20" width="26" height="36" rx="3.5" fill={F.paper} />
        <g stroke="none" fill={F.blue}>
          {[[0, -1], [-1, 1], [1, 1], [0, 0]].map(([dx, dy], i) => <rect key={i} x={44.6 + dx * 4.6} y={36.6 + dy * 4.6} width="3.8" height="3.8" rx="0.8" />)}
        </g>
      </g>
      <Anim k="bob" t={2.4}>
        <ellipse cx="32" cy="26" rx="8.4" ry="8" fill={F.skin} />
        <path d="M23.6 22.4Q32 15 40.4 22.4L40.4 24.6Q32 21 23.6 24.6Z" fill={F.red} />
        <path d="M40 23L47 26L41 27Z" fill={F.red} />
        <Face x={32} y={28} s={0.62} mood="focus" />
      </Anim>
    </>
  ),

  quarto: () => (
    <>
      <Ground a="cta" b="p1" />
      <rect x="6" y="28" width="52" height="28" rx="4" fill={F.tan} />
      <g fill="none" stroke={F.brownD} strokeWidth="1.2"><path d="M19 28V56M32 28V56M45 28V56M6 42H58" /></g>
      <g>
        <rect x="9.6" y="36" width="6.8" height="13" rx="3.4" fill={F.brown} />
        <rect x="22.6" y="40" width="7.8" height="8" rx="1.4" fill={F.cream} />
        <rect x="34.6" y="34" width="8" height="14" rx="1.4" fill={F.brown} />
        <circle cx="38.6" cy="37" r="1.7" fill={F.ink} stroke="none" />
        <rect x="47.6" y="41" width="7.4" height="7" rx="3.5" fill={F.cream} />
      </g>
      <Anim k="bob" t={2.2}>
        <rect x="24" y="5" width="10" height="17" rx="5" fill={F.cream} />
        <Face x={29} y={11} s={0.62} mood="wow" />
        <Glint x={26.6} y={8.4} w={1.8} h={6} rot={0} />
      </Anim>
      <Anim k="twinkle" t={1.6} d={0.4}><Spark x={44} y={12} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  santorini: () => (
    <>
      <Ground a="p1" b="p2" floor={50} floorRole="p1" />
      <g>
        <Block x="8" y="40" w="48" h="12" r="3" fill={F.white} />
        <Block x="14" y="30" w="36" h="11" r="3" fill={F.cream} />
        <Block x="20" y="21" w="24" h="10" r="3" fill={F.paper} />
      </g>
      <path d="M25.5 21A6.5 6.5 0 0 1 38.5 21Z" fill={F.blue} />
      <Anim k="hop" t={2.4} o="50% 100%">
        <Blobby x={14} y={35} r={4.6} fill={F.orange} mood="grin" look={1} />
      </Anim>
      <Anim k="bob" t={2.8}><Blobby x={46} y={26} r={4.2} fill={F.purple} mood="wow" /></Anim>
      <g stroke="none" fill={A('white', 0.9)}>
        <ellipse cx="50" cy="10" rx="8" ry="3.2" />
        <ellipse cx="14" cy="14" rx="6" ry="2.6" />
      </g>
      <Anim k="pulse" t={3}><Ball x={54} y={20} r={3} fill={F.yellow} glint={false} /></Anim>
    </>
  ),

  loa: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="6" y="6" width="52" height="52" rx="5" fill={F.tan} />
      <g fill="none" stroke={F.brownD} strokeWidth="1.1"><path d="M19 6V58M32 6V58M45 6V58M6 19H58M6 32H58M6 45H58" /></g>
      <Ball x={12.5} y={12.5} r={4.8} fill={F.coal} />
      <Ball x={12.5} y={38.5} r={4.8} fill={F.coal} />
      <Ball x={51.5} y={25.5} r={4.8} fill={F.coal} />
      <Ball x={38.5} y={51.5} r={4.8} fill={F.white} />
      <Ball x={25.5} y={51.5} r={4.8} fill={F.white} />
      <Ball x={51.5} y={51.5} r={4.8} fill={F.white} />
      <path d="M19 26L51 26" fill="none" stroke={F.red} strokeWidth="1.6" strokeDasharray="2.4 2.8" />
      <Anim k="dash" t={2.4}>
        <Ball x={19} y={26} r={5.2} fill={F.white} />
        <Face x={19} y={26.4} s={0.72} mood="grin" />
      </Anim>
      <Ball x={32} y={26} r={4.8} fill={F.coal} />
    </>
  ),
}
