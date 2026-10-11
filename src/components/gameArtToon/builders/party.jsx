/* eslint-disable react-refresh/only-export-components */
// TOON builders — party games.
import { F, A, Ground, Anim, Star, Spark, Face, Blobby, Letters, Bubble } from '../toonKit'

const Sheep = ({ x, y, s = 1, fill = F.white, mood = 'happy' }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-7" y="5" width="3" height="6" rx="1.4" fill={F.coal} /><rect x="4" y="5" width="3" height="6" rx="1.4" fill={F.coal} />
    <circle cx="-5" cy="-1" r="6" fill={fill} /><circle cx="5" cy="-1" r="6" fill={fill} /><circle cx="0" cy="-5" r="6" fill={fill} /><ellipse cx="0" cy="2" rx="9" ry="6.4" fill={fill} />
    <ellipse cx="10" cy="-1" rx="5" ry="5.4" fill={fill === F.white ? F.coal : F.white} />
    <Face x={10} y={-1} s={0.46} mood={mood} blink={false} />
  </g>
)

const Person = ({ x, y, fill, mood = 'happy', s = 1, hat }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="12" rx="9" ry="8" fill={fill} />
    <circle cx="0" cy="-1" r="7.4" fill={F.skin} />
    {hat}
    <Face x={0} y={-0.6} s={0.82} mood={mood} blink={false} />
  </g>
)

export default {
  herd: () => (
    <>
      <Ground a="p1" b="cta" floor={42} floorRole="p1" />
      <Anim k="bob" t={2.4}><Sheep x={14} y={46} s={0.9} /></Anim>
      <Anim k="bob" t={2.4} d={0.4}><Sheep x={36} y={52} s={0.9} /></Anim>
      <Anim k="bob" t={2.4} d={0.8}><Sheep x={20} y={30} s={0.8} /></Anim>
      <Anim k="bob" t={2.4} d={1.2}><Sheep x={42} y={36} s={0.8} /></Anim>
      <Anim k="hop" t={2.4} o="50% 100%"><Sheep x={52} y={52} s={0.95} fill={F.coal} mood="smug" /></Anim>
      <Anim k="twinkle" t={1.8}><Spark x={54} y={12} r={3.6} fill={F.yellow} /></Anim>
    </>
  ),

  trivia: () => (
    <>
      <Ground a="p2" b="cta" />
      <rect x="6" y="6" width="52" height="24" rx="5" fill={F.indigo} />
      <Anim k="pop" t={2.6}><Letters text="?" x={32} y={18} h={14} w={3.2} fill={F.yellow} /></Anim>
      {[[12, F.red], [32, F.green], [52, F.blue]].map(([x, c], i) => (
        <Anim key={i} k={i === 1 ? 'hop' : 'bob'} t={2.4} d={i * 0.25} o="50% 100%">
          <rect x={x - 8} y="38" width="16" height="18" rx="4" fill={c} />
          <circle cx={x} cy="40" r="5.4" fill={F.cream} />
          <Face x={x} y={39.4} s={0.62} mood={i === 1 ? 'grin' : 'happy'} blink={false} />
        </Anim>
      ))}
      <Anim k="twinkle" t={1.8}><Star x={56} y={8} r={4} /></Anim>
    </>
  ),

  wavelength: () => (
    <>
      <Ground a="p2" b="p1" />
      <path d="M6 46A26 26 0 0 1 58 46Z" fill={F.cream} />
      <path d="M12.5 46A19.5 19.5 0 0 1 51.5 46Z" fill={F.sky} strokeWidth="1.4" />
      <path d="M32 46L47 26A24 24 0 0 0 38 22Z" fill={F.yellow} stroke="none" opacity="0.9" />
      <path d="M32 46L38 22A24 24 0 0 0 47 26Z" fill={F.red} stroke="none" opacity="0.9" />
      <Anim k="sway" t={2.8} o="50% 100%">
        <path d="M32 46L32 22" fill="none" stroke={F.coal} strokeWidth="2.6" />
        <circle cx="32" cy="46" r="5.6" fill={F.coal} />
        <Face x={32} y={46} s={0.6} mood="wow" />
      </Anim>
      <rect x="5" y="50" width="20" height="9" rx="3" fill={F.sky} /><rect x="39" y="50" width="20" height="9" rx="3" fill={F.red} />
      <Letters text="C" x={15} y={54.5} h={5} w={1.2} fill={F.white} /><Letters text="H" x={49} y={54.5} h={5} w={1.2} fill={F.white} />
    </>
  ),

  fibbage: () => (
    <>
      <Ground a="p1" b="p2" />
      <Anim k="bob" t={2.4}>
        <ellipse cx="28" cy="48" rx="13" ry="11" fill={F.purple} />
        <circle cx="28" cy="31" r="11" fill={F.skin} />
        <path d="M30 33L52 36L31 38Z" fill={F.skin} />
        <Face x={26} y={29.4} s={1.1} mood="smug" />
      </Anim>
      <Bubble x={22} y={4} w={34} h={13}><Letters text="TRUE" x={39} y={10.5} h={7} w={1.6} fill={F.green} /></Bubble>
      <Anim k="shake" t={2.4}><Blobby x={54} y={53} r={5} fill={F.sky} mood="wow" look={-1} /></Anim>
      <Anim k="twinkle" t={1.8}><Spark x={8} y={12} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  spyfair: () => (
    <>
      <Ground a="p2" b="p1" />
      <Person x={12} y={44} fill={F.sky} s={0.85} />
      <Person x={52} y={44} fill={F.pink} mood="wow" s={0.85} />
      <Anim k="bob" t={2.4}>
        <ellipse cx="32" cy="50" rx="11" ry="10" fill={F.coal} />
        <circle cx="32" cy="34" r="9" fill={F.skin} />
        <path d="M20 31H44L38 21H26Z" fill={F.coal} /><rect x="19" y="30" width="26" height="3.6" rx="1.8" fill={F.coal} />
        <rect x="23" y="33" width="18" height="5.4" rx="2.6" fill={F.coal} />
        <circle cx="28.4" cy="36" r="1" fill={F.white} stroke="none" /><circle cx="35.6" cy="36" r="1" fill={F.white} stroke="none" />
        <path d="M29 42Q32 44 35 42" fill="none" stroke={F.ink} strokeWidth="1.3" />
      </Anim>
      <Anim k="pop" t={2.6}><Letters text="?" x={32} y={9} h={9} w={2.2} fill={F.yellow} /></Anim>
    </>
  ),

  headsup: () => (
    <>
      <Ground a="cta" b="p2" />
      <Anim k="bob" t={2.4}>
        <ellipse cx="32" cy="55" rx="15" ry="9" fill={F.sky} />
        <circle cx="32" cy="38" r="12" fill={F.skin} />
        <g transform="rotate(-8 32 18)"><rect x="19" y="8" width="26" height="14" rx="3" fill={F.cream} /><Letters text="CAT" x={32} y={15} h={7} w={1.6} fill={F.red} /></g>
        <Face x={32} y={39} s={1.2} mood="grin" />
        <path d="M18 52L10 36" fill="none" stroke={F.skin} strokeWidth="4.4" /><path d="M46 52L54 36" fill="none" stroke={F.skin} strokeWidth="4.4" />
      </Anim>
      <Anim k="twinkle" t={1.8}><Spark x={9} y={14} r={3.4} fill={F.yellow} /></Anim>
      <Anim k="twinkle" t={1.8} d={0.5}><Spark x={56} y={12} r={3} fill={F.yellow} /></Anim>
    </>
  ),

  chameleon: () => (
    <>
      <Ground a="p1" b="p2" />
      <path d="M6 22Q14 8 32 8Q54 8 58 28Q60 44 44 48L10 52Q4 38 6 22Z" fill={F.green} />
      <Anim k="wag" t={2.6} o="100% 60%">
        <path d="M58 40Q64 46 56 54Q50 58 46 52" fill="none" stroke={F.green} strokeWidth="4" />
      </Anim>
      <circle cx="22" cy="24" r="8.4" fill={F.cream} /><circle cx="22" cy="24" r="4" fill={F.ink} stroke="none" />
      <Face x={38} y={36} s={0.9} mood="smug" blink={false} />
      <path d="M8 38Q-2 40 4 46Q10 48 14 44" fill={F.pink} />
      <g stroke="none">{[[44, 18, F.yellow], [30, 14, F.sky], [50, 30, F.pink]].map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="2.6" fill={c} />)}</g>
      <rect x="6" y="54" width="52" height="6" rx="3" fill={F.brown} />
    </>
  ),

  sketch: () => (
    <>
      <Ground a="p2" b="cta" />
      <path d="M16 56L24 14M48 56L40 14M32 56V18" fill="none" stroke={F.brown} strokeWidth="3" />
      <rect x="9" y="8" width="46" height="34" rx="3" fill={F.white} />
      <Anim k="bob" t={2.6}>
        <circle cx="32" cy="26" r="9" fill={F.cream} /><path d="M24.6 20L24 13.6L29 17.6ZM39.4 20L40 13.6L35 17.6Z" fill={F.cream} />
        <Face x={32} y={27} s={0.9} mood="happy" />
      </Anim>
      <Anim k="sway" t={2} o="0% 100%">
        <rect x="42" y="30" width="5" height="22" rx="1.6" fill={F.yellow} transform="rotate(35 44 41)" />
        <path d="M50 46L53 51L47 49Z" fill={F.skin} />
      </Anim>
      <Anim k="twinkle" t={1.8}><Spark x={10} y={50} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  codewords: () => {
    const cols = [F.red, F.blue, F.cream, F.cream, F.blue, F.cream, F.coal, F.red, F.cream, F.blue, F.cream, F.red]
    return (
      <>
        <Ground a="p1" b="p2" />
        {[0, 1, 2].flatMap(r => [0, 1, 2, 3].map(c => {
          const i = r * 4 + c
          return (
            <g key={i}>
              <rect x={6 + c * 14.4} y={8 + r * 14} width="13" height="12" rx="2.4" fill={cols[i]} strokeWidth="1.6" />
              <rect x={9 + c * 14.4} y={12.4 + r * 14} width="7" height="2.2" rx="1" fill={A('white', cols[i] === F.cream ? 0 : 0.6)} stroke="none" />
              {cols[i] === F.cream && <rect x={9 + c * 14.4} y={12.4 + r * 14} width="7" height="2.2" rx="1" fill={A('greyD', 0.5)} stroke="none" />}
            </g>
          )
        }))}
        <Anim k="bob" t={2.4}>
          <circle cx="32" cy="54" r="6.4" fill={F.yellow} />
          <Face x={32} y={54} s={0.7} mood="smug" />
          <path d="M26 50H38L35 45H29Z" fill={F.coal} />
        </Anim>
        <Anim k="twinkle" t={1.8}><Spark x={57} y={54} r={3.4} fill={F.yellow} /></Anim>
      </>
    )
  },

  justone: () => (
    <>
      <Ground a="cta" b="p1" />
      <rect x="6" y="6" width="23" height="11" rx="3" fill={F.cream} /><Letters text="SEA" x={17.5} y={11.5} h={5.4} w={1.3} fill={F.greyD} />
      <path d="M8 15L27 8" stroke={F.red} strokeWidth="1.8" fill="none" />
      <rect x="35" y="6" width="23" height="11" rx="3" fill={F.cream} /><Letters text="SEA" x={46.5} y={11.5} h={5.4} w={1.3} fill={F.greyD} />
      <path d="M37 15L56 8" stroke={F.red} strokeWidth="1.8" fill="none" />
      <Anim k="pop" t={2.4}><rect x="18" y="22" width="28" height="13" rx="3.4" fill={F.yellow} /><Letters text="WET" x={32} y={28.5} h={7} w={1.7} fill={F.ink} /></Anim>
      <Anim k="hop" t={2.4} o="50% 100%"><Blobby x={18} y={50} r={7} fill={F.sky} mood="happy" /></Anim>
      <Anim k="hop" t={2.4} d={0.3} o="50% 100%"><Blobby x={46} y={50} r={7} fill={F.pink} mood="grin" /></Anim>
    </>
  ),
}
