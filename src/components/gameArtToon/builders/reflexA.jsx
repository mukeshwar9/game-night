 
// TOON builders — reflex and skill games, part one.
import { F, A, Ground, Anim, Ball, Star, Spark, Face, Blobby, Letters, Glint } from '../toonKit'

export default {
  reaction: () => (
    <>
      <Ground a="cta" b="p1" />
      <rect x="6" y="40" width="52" height="18" rx="6" fill={F.greyD} />
      <rect x="12" y="36" width="40" height="10" rx="4" fill={F.grey} />
      <Anim k="squash" o="50% 100%">
        <path d="M14 40Q14 20 32 20Q50 20 50 40Z" fill={F.red} />
        <Glint x={24} y={27} w={9} h={4} />
        <Face x={32} y={33} s={0.95} mood="wow" />
      </Anim>
      <Anim k="pop"><Letters text="GO" x={12} y={11} h={9} w={2.2} fill={F.yellow} /></Anim>
      <Anim k="twinkle"><path d="M50 4L44 14H50L46 22L56 11H50Z" fill={F.yellow} /></Anim>
    </>
  ),

  aim: () => (
    <>
      <Ground a="p1" b="p2" />
      <circle cx="30" cy="34" r="25" fill={F.red} />
      <circle cx="30" cy="34" r="18" fill={F.white} />
      <circle cx="30" cy="34" r="11.4" fill={F.red} />
      <circle cx="30" cy="34" r="6" fill={F.white} />
      <Face x={30} y={34.4} s={0.62} mood="wow" blink={false} />
      <Anim k="spin" t={6} o="50% 50%"><g fill="none" stroke={F.blue} strokeWidth="1.6"><circle cx="47" cy="17" r="8" /><path d="M47 6V12M47 22V28M36 17H42M52 17H58" /></g></Anim>
      <Anim k="pop"><Ball x={10} y={12} r={5} fill={F.yellow} /></Anim>
      <Anim k="pop" d={0.7}><Ball x={52} y={54} r={4.4} fill={F.pink} /></Anim>
    </>
  ),

  chopchop: () => (
    <>
      <Ground a="p2" b="cta" />
      <rect x="10" y="40" width="22" height="20" rx="2.6" fill={F.tan} /><path d="M10 50H32M21 40V60" fill="none" stroke={F.brownD} strokeWidth="1.4" />
      <rect x="32" y="40" width="22" height="20" rx="2.6" fill={F.tan} /><path d="M32 50H54M43 40V60" fill="none" stroke={F.brownD} strokeWidth="1.4" />
      <Anim k="hop" o="50% 100%">
        <rect x="21" y="20" width="22" height="20" rx="2.6" fill={F.tan} /><path d="M21 30H43" fill="none" stroke={F.brownD} strokeWidth="1.4" />
        <Face x={32} y={32.6} s={0.95} mood="wow" />
      </Anim>
      <Anim k="shake"><path d="M6 12H58" fill="none" stroke={F.red} strokeWidth="3.4" opacity="0.85" /></Anim>
      <Anim k="twinkle"><Spark x={52} y={26} r={3.6} fill={F.yellow} /></Anim>
    </>
  ),

  bamboozle: () => (
    <>
      <Ground a="p1" b="p2" floor={46} floorRole="p1" />
      <Anim k="jelly" o="50% 100%">
        <path d="M10 48Q8 26 30 24Q50 24 52 48Z" fill={F.grey} />
        <Glint x={22} y={32} w={8} h={4} />
        <Face x={31} y={39} s={1.05} mood="smug" />
      </Anim>
      <Anim k="sway" o="100% 100%"><path d="M62 54L50 10" fill="none" stroke={F.brown} strokeWidth="6" /></Anim>
      <g stroke="none" fill={A('white', 0.8)}><ellipse cx="12" cy="52" rx="4" ry="2" /><ellipse cx="54" cy="55" rx="5" ry="2" /></g>
      <Anim k="twinkle"><Spark x={12} y={14} r={3.6} fill={F.yellow} /></Anim>
    </>
  ),

  typing: () => (
    <>
      <Ground a="p2" b="p1" />
      <rect x="5" y="6" width="54" height="32" rx="4" fill={F.coal} />
      <rect x="9" y="10" width="46" height="24" rx="2.6" fill={F.night} strokeWidth="1.4" />
      <Letters text="THE" x={17} y={17.6} h={6} w={1.4} fill={F.lime} />
      <Anim k="slide"><Letters text="QUICK" x={40} y={17.6} h={5.4} w={1.2} fill={F.yellow} /></Anim>
      <rect x="12" y="25" width="40" height="3.4" rx="1.7" fill={F.coal} strokeWidth="1" />
      <Anim k="slide"><rect x="12" y="25" width="22" height="3.4" rx="1.7" fill={F.lime} strokeWidth="1" /></Anim>
      <rect x="4" y="42" width="56" height="17" rx="4" fill={F.grey} />
      {[0, 1, 2, 3, 4, 5].map(i => <Anim key={i} k="squash" t={1.8} d={i * 0.15} o="50% 100%"><rect x={7 + i * 8.6} y="45" width="7" height="6" rx="1.6" fill={F.cream} strokeWidth="1.3" /></Anim>)}
      <rect x="14" y="53" width="36" height="4.4" rx="2" fill={F.cream} strokeWidth="1.3" />
      <Anim k="bob"><Face x={50} y={32} s={0.4} mood="grin" blink={false} /></Anim>
    </>
  ),

  math: () => (
    <>
      <Ground a="p1" b="cta" />
      <rect x="4" y="6" width="56" height="42" rx="4" fill={F.greenD} />
      <rect x="4" y="6" width="56" height="42" rx="4" fill="none" stroke={F.brown} strokeWidth="3" />
      <Letters text="7X8=" x={24} y={22} h={11} w={2} fill={F.white} />
      <Anim k="pop"><Letters text="56" x={46} y={22} h={11} w={2} fill={F.yellow} /></Anim>
      <path d="M12 34H38" fill="none" stroke={A('white', 0.6)} strokeWidth="1.6" strokeDasharray="3 3" />
      <rect x="8" y="49" width="30" height="5" rx="2.4" fill={F.tan} />
      <Anim k="hop" o="50% 100%"><Blobby x={50} y={51} r={7.4} fill={F.sky} mood="grin" /></Anim>
      <Anim k="twinkle"><Spark x={55} y={34} r={3} fill={F.white} /></Anim>
    </>
  ),

  updraft: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect width="64" height="64" fill={A('sky', 0.5)} stroke="none" />
      <g fill={F.white}>
        <ellipse cx="14" cy="54" rx="10" ry="4.4" /><ellipse cx="50" cy="42" rx="10" ry="4.4" /><ellipse cx="18" cy="30" rx="10" ry="4.4" /><ellipse cx="46" cy="16" rx="10" ry="4.4" />
      </g>
      <Anim k="hop" o="50% 100%"><Blobby x={50} y={34} r={5.6} fill={F.red} mood="grin" /></Anim>
      <g fill="none" stroke={F.sky} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 4"><path d="M20 52Q34 46 46 38M42 36Q28 34 22 26" /></g>
      <Anim k="float"><path d="M58 52V44M55 47L58 43L61 47" fill="none" stroke={F.sky} strokeWidth="1.8" /></Anim>
      <Anim k="twinkle"><Star x={32} y={8} r={4} /></Anim>
    </>
  ),

  pong: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="4" y="8" width="56" height="38" rx="7" fill={F.greyD} />
      <rect x="9" y="13" width="46" height="28" rx="4" fill={F.night} strokeWidth="1.4" />
      <path d="M32 14V40" stroke={F.indigo} strokeWidth="1.4" strokeDasharray="2 2.4" fill="none" />
      <Anim k="bob" d={0.3}><rect x="12" y="19" width="3.4" height="11" rx="1.7" fill={F.lime} strokeWidth="1" /></Anim>
      <Anim k="bob"><rect x="49" y="24" width="3.4" height="11" rx="1.7" fill={F.pink} strokeWidth="1" /></Anim>
      <Anim k="dash"><Ball x={30} y={27} r={3.2} fill={F.white} /></Anim>
      <Face x={30} y={27.2} s={0.34} mood="grin" blink={false} />
      <path d="M26 46L22 54M38 46L42 54" stroke={F.coal} strokeWidth="3" fill="none" />
      <circle cx="52" cy="50" r="2.4" fill={F.red} /><circle cx="44" cy="50" r="2.4" fill={F.yellow} />
      <Anim k="twinkle"><Spark x={8} y={6} r={3} fill={F.yellow} /></Anim>
    </>
  ),
}
