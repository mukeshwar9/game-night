/* eslint-disable react-refresh/only-export-components */
// TOON builders — word games and dice games.
import { F, A, Ground, Anim, Spark, Face, Blobby, Heart, Die, Letters, Bubble, Glint } from '../toonKit'

// A letter tile (rounded square) with its stroke letter.
const Tile = ({ x, y, s = 12, ch, fill = F.cream, ink = F.ink }) => (
  <g>
    <rect x={x} y={y} width={s} height={s} rx={s * 0.22} fill={fill} />
    {ch && <Letters text={ch} x={x + s / 2} y={y + s / 2} h={s * 0.5} fill={ink} w={s * 0.11} />}
  </g>
)

export default {
  hangwoman: () => (
    <>
      <Ground a="p2" b="cta" />
      <g fill="none" strokeLinecap="round"><path d="M8 54H34M16 54V8H42V14" stroke={F.brown} strokeWidth="4" /><path d="M16 20L24 8" stroke={F.brown} strokeWidth="3" /></g>
      <Anim k="sway" o="50% 0%">
        <path d="M42 14V20" fill="none" strokeWidth="1.6" />
        <ellipse cx="42" cy="28" rx="7" ry="7.4" fill={F.pink} />
        <Face x={42} y={28.4} s={0.95} mood="wow" />
        <path d="M42 35.4V45M42 38L36 43M42 38L48 43M42 45L37 52M42 45L47 52" fill="none" stroke={F.pinkD} strokeWidth="2" />
      </Anim>
      {[0, 1, 2].map(i => <Tile key={i} x={10 + i * 12} y={4} s={10} ch={['G', 'A', ''][i]} />)}
      <Anim k="twinkle"><Spark x={56} y={50} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  twotruths: () => (
    <>
      <Ground a="p1" b="p2" />
      {[[13, F.green, '✓'], [32, F.green, '✓'], [51, F.red, 'x']].map(([x, c, m], i) => (
        <Anim key={i} k={i === 2 ? 'shake' : 'bob'} t={2.4} d={i * 0.3}>
          <ellipse cx={x} cy={55} rx="9" ry="8" fill={[F.sky, F.yellow, F.purple][i]} />
          <circle cx={x} cy={43} r="7" fill={F.skin} />
          <Face x={x} y={43.4} s={0.78} mood={i === 2 ? 'smug' : 'grin'} blink={false} />
          <rect x={x - 8} y={14} width="16" height="16" rx="3" fill={F.white} />
          <path d={`M${x} 30V37`} fill="none" strokeWidth="1.6" />
          {m === 'x'
            ? <path d={`M${x - 3.6} 18.4L${x + 3.6} 25.6M${x + 3.6} 18.4L${x - 3.6} 25.6`} fill="none" stroke={c} strokeWidth="2.6" />
            : <path d={`M${x - 4} 22L${x - 1} 25.4L${x + 4.4} 18.6`} fill="none" stroke={c} strokeWidth="2.6" />}
        </Anim>
      ))}
    </>
  ),

  wordduel: () => (
    <>
      <Ground a="p1" b="p2" />
      <g>
        {[0, 1, 2].flatMap(r => [0, 1, 2, 3, 4].map(c => {
          const fills = [[F.coal, F.yellow, F.coal, F.coal, F.yellow], [F.green, F.coal, F.yellow, F.coal, F.green], [F.green, F.green, F.green, F.green, F.green]]
          return <rect key={`${r}${c}`} x={5 + c * 10.5} y={7 + r * 10.5} width="9.4" height="9.4" rx="2" fill={fills[r][c]} strokeWidth="1.5" />
        }))}
      </g>
      <Anim k="pop"><Letters text="WIN" x={31} y={52} h={9} fill={F.red} w={2.2} /></Anim>
      <Blobby x={9} y={53} r={5} fill={F.red} mood="grin" look={1} />
      <Blobby x={55} y={53} r={5} fill={F.blue} mood="sad" look={-1} />
      <Anim k="twinkle"><Spark x={57} y={12} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  wordcoop: () => (
    <>
      <Ground a="p2" b="cta" />
      <Anim k="pulse"><Heart x={32} y={13} s={1.5} fill={F.red} /></Anim>
      {['W', 'O', 'R', 'D'].map((ch, i) => <Anim key={i} k="bob" t={2.2} d={i * 0.2}><Tile x={6 + i * 13.6} y={24} s={12.4} ch={ch} fill={F.cream} /></Anim>)}
      <Anim k="hop" o="50% 100%"><Blobby x={16} y={52} r={6} fill={F.sky} mood="happy" look={1} /></Anim>
      <Anim k="hop" d={0.3} o="50% 100%"><Blobby x={48} y={52} r={6} fill={F.pink} mood="grin" look={-1} /></Anim>
      <path d="M24 52H40" fill="none" stroke={F.yellow} strokeWidth="2.4" strokeDasharray="1 4" />
    </>
  ),

  converge: () => (
    <>
      <Ground a="p1" b="p2" />
      <Anim k="bob">
        <Bubble x={4} y={6} w={26} h={14}><Letters text="SUN" x={17} y={13} h={8} w={1.7} fill={F.blue} /></Bubble>
      </Anim>
      <Anim k="bob" d={0.4}>
        <g transform="translate(64 0) scale(-1 1)"><Bubble x={4} y={6} w={26} h={14} /></g>
        <Letters text="SUN" x={47} y={13} h={8} w={1.7} fill={F.red} />
      </Anim>
      <Blobby x={15} y={46} r={8} fill={F.blue} mood="wow" look={1} />
      <Blobby x={49} y={46} r={8} fill={F.red} mood="wow" look={-1} />
      <Anim k="pulse"><Heart x={32} y={42} s={1.3} fill={F.yellow} /></Anim>
    </>
  ),

  wordrace: () => (
    <>
      <Ground a="p1" b="p2" />
      {[0, 1, 2].map(i => <rect key={i} x="5" y={8 + i * 17} width="54" height="14" rx="3" fill={[F.cream, F.paper, F.cream][i]} strokeWidth="1.6" />)}
      <g fill={F.ink} stroke="none">{[0, 1, 2, 3].flatMap(r => [0, 1].map(c => (r + c) % 2 ? null : <rect key={`${r}${c}`} x={53 + c * 3} y={8 + r * 3.5} width="3" height="3.5" />))}</g>
      <Anim k="dash"><Blobby x={14} y={15} r={5.6} fill={F.red} mood="grin" look={1} /></Anim>
      <Anim k="dash" d={0.5}><Blobby x={14} y={32} r={5.6} fill={F.blue} mood="happy" look={1} /></Anim>
      <Anim k="dash" d={1}><Blobby x={14} y={49} r={5.6} fill={F.green} mood="focus" look={1} /></Anim>
      <Tile x={30} y={9} s={11} ch="W" fill={F.yellow} /><Tile x={30} y={26} s={11} ch="O" fill={F.yellow} /><Tile x={30} y={43} s={11} ch="R" fill={F.yellow} />
    </>
  ),

  wordhunt: () => (
    <>
      <Ground a="cta" b="p1" />
      <rect x="5" y="5" width="54" height="54" rx="6" fill={F.paper} />
      {[['C', 'A', 'T', 'S'], ['O', 'R', 'D', 'W'], ['N', 'E', 'I', 'U'], ['H', 'O', 'L', 'Y']].flatMap((row, r) => row.map((ch, c) => (
        <g key={`${r}${c}`}>
          <Letters text={ch} x={12.4 + c * 13.2} y={13 + r * 13.2} h={7} w={1.5} fill={r === 0 ? F.red : F.ink} />
        </g>
      )))}
      <path d="M12 13H51" fill="none" stroke={A('red', 0.4)} strokeWidth="7" strokeLinecap="round" />
      <Anim k="sway" o="20% 80%">
        <circle cx="44" cy="40" r="8.6" fill={A('sky', 0.35)} strokeWidth="2.6" />
        <path d="M50 46L58 55" fill="none" stroke={F.brown} strokeWidth="4" />
        <Face x={44} y={40.4} s={0.7} mood="wow" blink={false} />
      </Anim>
    </>
  ),

  password: () => (
    <>
      <Ground a="p2" b="p1" />
      <rect x="6" y="9" width="52" height="38" rx="5" fill={F.coal} />
      <rect x="10" y="13" width="44" height="30" rx="3" fill={F.night} strokeWidth="1.4" />
      <Anim k="bob">
        <path d="M25 29V24A7 7 0 0 1 39 24V29" fill="none" stroke={F.grey} strokeWidth="3" />
        <rect x="21" y="28" width="22" height="14" rx="3.4" fill={F.yellow} />
        <Face x={32} y={35} s={0.62} mood="smug" />
      </Anim>
      <g fill={F.lime} stroke="none">{[0, 1, 2, 3, 4].map(i => <circle key={i} cx={19 + i * 6.6} cy={19} r="1.3" />)}</g>
      <rect x="24" y="47" width="16" height="5" fill={F.greyD} />
      <rect x="16" y="52" width="32" height="6" rx="3" fill={F.grey} />
      <Anim k="pop"><Letters text="SH" x={52} y={51} h={7} w={1.6} fill={F.red} /></Anim>
    </>
  ),

  anagrams: () => (
    <>
      <Ground a="p1" b="cta" />
      {[['C', 6, 22, -10, F.yellow], ['A', 18, 12, 8, F.sky], ['T', 33, 24, -6, F.pink], ['S', 46, 14, 12, F.lime]].map(([ch, x, y, r, f], i) => (
        <Anim key={ch} k="hop" t={2.6} d={i * 0.3} o="50% 100%">
          <g transform={`rotate(${r} ${x + 6.5} ${y + 6.5})`}><Tile x={x} y={y} s={13} ch={ch} fill={f} /></g>
        </Anim>
      ))}
      <g fill="none" stroke={F.red} strokeWidth="2.4" strokeLinecap="round"><path d="M14 50Q32 58 50 50" /><path d="M46 46L50 50L45 54" /></g>
      <Face x={32} y={44} s={0.7} mood="grin" />
    </>
  ),

  dice: () => (
    <>
      <Ground a="p2" b="cta" />
      <Anim k="hop" o="50% 100%">
        <ellipse cx="32" cy="42" rx="19" ry="16" fill={F.pink} />
        <path d="M17 32L14 22L25 28Z" fill={F.pinkD} /><path d="M47 32L50 22L39 28Z" fill={F.pinkD} />
        <ellipse cx="32" cy="45" rx="8.4" ry="6" fill={F.pinkD} />
        <circle cx="29" cy="45" r="1.4" fill={F.ink} stroke="none" /><circle cx="35" cy="45" r="1.4" fill={F.ink} stroke="none" />
        <Face x={32} y={37} s={0.95} mood="grin" />
      </Anim>
      <Anim k="drop"><Die x={4} y={5} s={15} n={1} /></Anim>
      <Anim k="drop" d={0.3}><Die x={45} y={4} s={15} n={1} /></Anim>
      <Anim k="twinkle"><Spark x={32} y={9} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  bluff: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="4" y="52" width="56" height="6" rx="3" fill={F.brown} />
      <Anim k="shake" o="50% 100%">
        <path d="M10 52L14 18H32L36 52Z" fill={F.brown} />
        <rect x="12" y="14" width="22" height="6" rx="3" fill={F.brownD} />
        <Face x={23} y={36} s={0.9} mood="smug" />
        <Glint x={16} y={28} w={2} h={8} rot={0} />
      </Anim>
      <Die x={40} y={38} s={13} n={4} />
      <Die x={49} y={26} s={11} n={2} />
      <Anim k="bob"><Bubble x={36} y={5} w={22} h={12}><Letters text="?" x={47} y={11} h={7} w={1.8} fill={F.red} /></Bubble></Anim>
    </>
  ),

  docking: () => (
    <>
      <Ground a="p2" b="p1" />
      <rect x="4" y="4" width="56" height="56" rx="6" fill={F.night} />
      <g stroke="none" fill={F.white}><circle cx="12" cy="12" r="1" /><circle cx="52" cy="10" r="1.2" /><circle cx="8" cy="46" r="1" /><circle cx="56" cy="50" r="1" /></g>
      <rect x="38" y="14" width="10" height="38" rx="3" fill={F.grey} />
      <rect x="30" y="26" width="26" height="12" rx="3" fill={F.greyD} />
      <rect x="42" y="18" width="14" height="4" fill={F.yellow} /><rect x="42" y="44" width="14" height="4" fill={F.yellow} />
      <Anim k="dash">
        <ellipse cx="18" cy="32" rx="12" ry="7.4" fill={F.white} />
        <path d="M8 29L3 24V40L8 35Z" fill={F.red} />
        <Face x={19} y={31.6} s={0.62} mood="grin" />
      </Anim>
      <Anim k="twinkle"><Die x={8} y={8} s={10} n={5} /></Anim>
    </>
  ),
}
