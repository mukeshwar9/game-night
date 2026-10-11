/* eslint-disable react-refresh/only-export-components */
// TOON builders — reflex and skill games, part two.
import { F, A, Ground, Anim, Ball, Star, Spark, Face, Blobby, Letters } from '../toonKit'

const Ghost = ({ x, y, fill, mood = 'happy' }) => (
  <g>
    <path d={`M${x - 6} ${y + 6}V${y - 1}A6 6 0 0 1 ${x + 6} ${y - 1}V${y + 6}L${x + 3} ${y + 4}L${x} ${y + 6}L${x - 3} ${y + 4}Z`} fill={fill} />
    <Face x={x} y={y - 0.6} s={0.58} mood={mood} blink={false} />
  </g>
)

export default {
  snake: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="5" y="5" width="54" height="54" rx="6" fill={F.green} />
      <path d="M12 52H34V30H20V16H46" fill="none" stroke={F.lime} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 52H34V30H20V16H46" fill="none" stroke={F.greenD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 7" />
      <Anim k="pulse" t={2.2}>
        <circle cx="48" cy="16" r="6.6" fill={F.lime} />
        <Face x={48} y={16} s={0.72} mood="wow" />
      </Anim>
      <Anim k="bob" t={2}><Ball x={52} y={44} r={4.4} fill={F.red} /></Anim>
      <path d="M52 39.6Q54 36 57 37" fill="none" stroke={F.brown} strokeWidth="1.6" />
    </>
  ),

  tron: () => (
    <>
      <Ground a="p2" b="p1" />
      <rect x="4" y="4" width="56" height="56" rx="5" fill={F.night} />
      <g fill="none" stroke={F.indigo} strokeWidth="0.9" opacity="0.8"><path d="M4 18H60M4 32H60M4 46H60M18 4V60M32 4V60M46 4V60" /></g>
      <path d="M10 52V40H28V24H44" fill="none" stroke={F.sky} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M54 12V28H40V46H22" fill="none" stroke={F.orange} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <Anim k="dash" t={2}><rect x="40" y="19" width="13" height="9" rx="3.4" fill={F.sky} /><Face x={47} y={23.6} s={0.5} mood="grin" blink={false} /></Anim>
      <rect x="15" y="41" width="13" height="9" rx="3.4" fill={F.orange} />
      <Anim k="twinkle" t={1.6}><Spark x={56} y={56} r={3.4} fill={F.white} /></Anim>
    </>
  ),

  sumo: () => (
    <>
      <Ground a="cta" b="p1" />
      <ellipse cx="32" cy="46" rx="29" ry="12" fill={F.tan} />
      <ellipse cx="32" cy="44" rx="25" ry="9.4" fill={F.cream} strokeWidth="1.6" />
      <Anim k="dash" t={2.2}><Blobby x={22} y={32} r={11} fill={F.red} mood="grin" look={1} /></Anim>
      <Anim k="shake" t={2.2}><Blobby x={43} y={33} r={10} fill={F.blue} mood="wow" look={-1} /></Anim>
      <path d="M31 24L36 28L31 31" fill="none" stroke={F.yellow} strokeWidth="2.4" />
      <Anim k="twinkle" t={1.7}><Star x={54} y={10} r={4.4} /></Anim>
    </>
  ),

  spaceduel: () => (
    <>
      <Ground a="p2" b="p1" />
      <rect x="4" y="4" width="56" height="56" rx="6" fill={F.night} />
      <g stroke="none" fill={F.white}><circle cx="12" cy="12" r="1" /><circle cx="52" cy="8" r="1.2" /><circle cx="56" cy="40" r="1" /><circle cx="10" cy="50" r="1" /></g>
      <circle cx="32" cy="34" r="12" fill={F.orange} /><path d="M22 28Q32 34 42 26M21 38Q32 42 43 36" fill="none" stroke={F.orangeD} strokeWidth="2" />
      <Anim k="sway" t={2.6} o="50% 50%"><g><path d="M10 14L22 10L16 20Z" fill={F.sky} /><circle cx="17" cy="14.6" r="1.4" fill={F.white} stroke="none" /></g></Anim>
      <Anim k="sway" t={2.6} d={0.7}><g><path d="M54 52L42 56L48 46Z" fill={F.pink} /></g></Anim>
      <path d="M20 17L28 24" fill="none" stroke={F.yellow} strokeWidth="1.6" strokeDasharray="2 3" />
      <Anim k="pulse" t={1.8}><Face x={32} y={34.4} s={0.9} mood="wow" /></Anim>
    </>
  ),

  paint: () => (
    <>
      <Ground a="p1" b="p2" />
      {[0, 1, 2, 3, 4].flatMap(r => [0, 1, 2, 3, 4].map(c => {
        const col = c + (4 - r) < 4 ? F.red : c + (4 - r) > 4 ? F.blue : F.cream
        return <rect key={`${r}${c}`} x={6 + c * 10.4} y={6 + r * 10.4} width="10.4" height="10.4" fill={col === F.cream ? F.cream : col} stroke="none" />
      }))}
      <rect x="6" y="6" width="52" height="52" rx="4" fill="none" />
      <Anim k="dash" t={2.2}><Blobby x={20} y={44} r={5.6} fill={F.orange} mood="grin" look={1} /></Anim>
      <Blobby x={44} y={20} r={5.6} fill={F.indigo} mood="smug" look={-1} />
      <g stroke="none" fill={A('white', 0.7)}><circle cx="14" cy="14" r="1.4" /><circle cx="52" cy="52" r="1.4" /></g>
    </>
  ),

  pacmac: () => (
    <>
      <Ground a="p2" b="cta" />
      <rect x="4" y="6" width="56" height="52" rx="5" fill={F.night} />
      <g fill="none" stroke={F.blue} strokeWidth="2.4" strokeLinecap="round"><path d="M12 16H28M36 16H52M12 48H28M36 48H52M20 24V40M44 24V40M28 32H36" /></g>
      <g stroke="none" fill={F.yellow}>{[16, 24, 32, 40, 48].map(x => <circle key={x} cx={x} cy="32" r="1.2" />)}</g>
      <Anim k="dash" t={1.8}>
        <path d="M18 32L26 26A9 9 0 1 0 26 38Z" fill={F.yellow} transform="translate(-4 0)" />
        <circle cx="19" cy="25" r="1.4" fill={F.ink} stroke="none" transform="translate(-4 0)" />
      </Anim>
      <Anim k="bob" t={2}><Ghost x={44} y={32} fill={F.red} mood="wow" /></Anim>
      <Anim k="bob" t={2} d={0.5}><Ghost x={52} y={50} fill={F.pink} /></Anim>
    </>
  ),

  minesweeper: () => (
    <>
      <Ground a="p1" b="p2" />
      {[0, 1, 2, 3].flatMap(r => [0, 1, 2, 3].map(c => {
        const open = (r + c) % 3 !== 0 && !(r === 3 && c === 3)
        return <rect key={`${r}${c}`} x={7 + c * 12.5} y={7 + r * 12.5} width="12" height="12" rx="2.4" fill={open ? F.cream : F.grey} strokeWidth="1.4" />
      }))}
      <Letters text="1" x={25.4} y={19.5} h={6} w={1.6} fill={F.blue} /><Letters text="2" x={38} y={32} h={6} w={1.6} fill={F.green} />
      <Letters text="3" x={13} y={44.5} h={6} w={1.6} fill={F.red} /><Letters text="1" x={50.5} y={19.5} h={6} w={1.6} fill={F.blue} />
      <Anim k="sway" t={2.6} o="30% 100%"><path d="M13 12V25" fill="none" strokeWidth="1.8" /><path d="M13 12L21 15L13 19Z" fill={F.red} /></Anim>
      <Anim k="pulse" t={2}><circle cx="50.5" cy="50.5" r="4.6" fill={F.coal} /><Face x={50.5} y={50.5} s={0.5} mood="wow" blink={false} /></Anim>
    </>
  ),

  airhockey: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="6" y="4" width="52" height="56" rx="10" fill={F.cream} />
      <g fill="none" stroke={F.blue} strokeWidth="1.6" opacity="0.7"><path d="M6 32H58" /><circle cx="32" cy="32" r="8" /></g>
      <rect x="22" y="2" width="20" height="4" rx="2" fill={F.coal} /><rect x="22" y="58" width="20" height="4" rx="2" fill={F.coal} />
      <Anim k="slide" t={2.2}><Blobby x={26} y={14} r={7} fill={F.blue} mood="grin" look={1} /></Anim>
      <Anim k="slide" t={2.2} d={0.5}><Blobby x={38} y={50} r={7} fill={F.red} mood="focus" /></Anim>
      <Anim k="bob" t={1.8}><Ball x={32} y={32} r={3.6} fill={F.coal} /></Anim>
    </>
  ),

  puckrush: () => (
    <>
      <Ground a="cta" b="p2" />
      <rect x="4" y="4" width="56" height="56" rx="6" fill={F.sky} />
      <g fill="none" stroke={A('white', 0.8)} strokeWidth="1.4"><path d="M4 22H60M4 42H60" /></g>
      <rect x="36" y="12" width="6" height="14" rx="3" fill={F.coal} /><rect x="36" y="38" width="6" height="14" rx="3" fill={F.coal} />
      <path d="M44 32H58" stroke={F.red} strokeWidth="1.6" fill="none" strokeDasharray="1 3" />
      <path d="M22 32L8 32" stroke={F.coal} strokeWidth="1.6" fill="none" strokeDasharray="2 2.4" />
      <Anim k="dash" t={2.2}>
        <ellipse cx="26" cy="33" rx="8.4" ry="6.4" fill={F.coal} /><ellipse cx="26" cy="31" rx="8.4" ry="6" fill={F.greyD} />
        <Face x={26} y={31} s={0.7} mood="grin" blink={false} />
      </Anim>
      <ellipse cx="10" cy="14" rx="4.6" ry="3.4" fill={F.coal} /><ellipse cx="12" cy="50" rx="4.6" ry="3.4" fill={F.coal} />
      <Anim k="twinkle" t={1.7}><Spark x={50} y={32} r={3.6} fill={F.yellow} /></Anim>
    </>
  ),

  stickyfingers: () => (
    <>
      <Ground a="p2" b="cta" />
      <Anim k="jelly" t={2.4}>
        <path d="M18 24Q14 56 32 56Q50 56 46 24Z" fill={F.green} />
        <path d="M22 24L18 14H46L42 24Z" fill={F.greenD} />
        <ellipse cx="32" cy="14" rx="14" ry="3.4" fill={F.greenD} />
        <circle cx="32" cy="38" r="7" fill={F.yellow} /><Face x={32} y={37} s={0.78} mood="grin" />
      </Anim>
      <Anim k="wag" t={2.4} o="100% 50%"><path d="M4 30Q10 28 18 34" fill="none" stroke={F.skin} strokeWidth="5.4" /><circle cx="18" cy="34" r="4" fill={F.skin} /></Anim>
      <Anim k="wag" t={2.4} d={0.5} o="0% 50%"><path d="M60 30Q54 28 46 34" fill="none" stroke={F.skinD} strokeWidth="5.4" /><circle cx="46" cy="34" r="4" fill={F.skinD} /></Anim>
      <Anim k="twinkle" t={1.7}><Spark x={54} y={10} r={3.6} fill={F.yellow} /></Anim>
    </>
  ),
}
