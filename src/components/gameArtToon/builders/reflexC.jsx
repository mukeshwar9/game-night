// TOON builders — reflex and skill games, part three.
import { F, Ground, Anim, Ball, Star, Spark, Face, Blobby, Letters } from '../toonKit'

export default {
  bonkbuggies: () => (
    <>
      <Ground a="p1" b="p2" floor={46} floorRole="p2" />
      <Anim k="dash">
        <rect x="6" y="30" width="22" height="12" rx="5" fill={F.red} /><circle cx="12" cy="46" r="5" fill={F.coal} /><circle cx="24" cy="46" r="5" fill={F.coal} />
        <circle cx="17" cy="24" r="7.4" fill={F.yellow} /><Face x={17} y={24.6} s={0.7} mood="grin" blink={false} />
      </Anim>
      <Anim k="shake">
        <rect x="36" y="30" width="22" height="12" rx="5" fill={F.blue} /><circle cx="42" cy="46" r="5" fill={F.coal} /><circle cx="54" cy="46" r="5" fill={F.coal} />
        <circle cx="47" cy="24" r="7.4" fill={F.sky} /><Face x={47} y={24.6} s={0.7} mood="wow" blink={false} />
      </Anim>
      <Anim k="pop"><Star x={32} y={30} r={7} fill={F.yellow} /></Anim>
    </>
  ),

  artillery: () => (
    <>
      <Ground a="p1" b="p2" floor={46} floorRole="p1" />
      <path d="M0 50Q14 38 28 50V64H0Z" fill={F.green} /><path d="M38 52Q52 36 64 48V64H38Z" fill={F.greenD} />
      <Anim k="sway" o="30% 70%">
        <rect x="6" y="30" width="22" height="9" rx="4.4" fill={F.coal} transform="rotate(-28 12 36)" />
      </Anim>
      <circle cx="12" cy="42" r="7" fill={F.greyD} /><Face x={12} y={42} s={0.62} mood="grin" blink={false} />
      <path d="M26 24Q36 8 48 26" fill="none" stroke={F.white} strokeWidth="1.8" strokeDasharray="1 4" strokeLinecap="round" />
      <Anim k="bob"><Ball x={37} y={12} r={4.4} fill={F.coal} /></Anim>
      <circle cx="50" cy="42" r="6" fill={F.red} /><circle cx="50" cy="42" r="3" fill={F.white} /><circle cx="50" cy="42" r="1.2" fill={F.red} stroke="none" />
      <Anim k="twinkle"><Spark x={56} y={10} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  darts: () => (
    <>
      <Ground a="p2" b="cta" />
      <circle cx="30" cy="34" r="24" fill={F.coal} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <path key={i} d={`M30 34L${30 + 24 * Math.cos((i * Math.PI) / 4)} ${34 + 24 * Math.sin((i * Math.PI) / 4)}A24 24 0 0 1 ${30 + 24 * Math.cos(((i + 1) * Math.PI) / 4)} ${34 + 24 * Math.sin(((i + 1) * Math.PI) / 4)}Z`} fill={i % 2 ? F.cream : F.green} strokeWidth="1" />)}
      <circle cx="30" cy="34" r="12" fill={F.red} /><circle cx="30" cy="34" r="6" fill={F.white} />
      <Face x={30} y={34.4} s={0.5} mood="focus" blink={false} />
      <Anim k="dash">
        <path d="M60 8L36 30" fill="none" stroke={F.sky} strokeWidth="3" />
        <path d="M62 4L56 6L58 12Z" fill={F.red} />
      </Anim>
      <Anim k="twinkle"><Spark x={56} y={54} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  animalstack: () => (
    <>
      <Ground a="p1" b="p2" />
      <rect x="6" y="52" width="52" height="8" rx="3" fill={F.brown} />
      <rect x="14" y="40" width="36" height="13" rx="6" fill={F.pink} />
      <rect x="18" y="29" width="28" height="12" rx="5.6" fill={F.sky} />
      <Anim k="sway" o="50% 100%">
        <rect x="22" y="18" width="20" height="12" rx="5.4" fill={F.lime} />
        <Anim k="hop" o="50% 100%"><ellipse cx="32" cy="10" rx="8" ry="7.6" fill={F.yellow} /><path d="M26 6L24 0L30 4ZM38 6L40 0L34 4Z" fill={F.yellow} /><Face x={32} y={10.6} s={0.78} mood="wow" /></Anim>
      </Anim>
      <Face x={32} y={46.4} s={0.58} mood="grin" blink={false} /><Face x={32} y={35} s={0.5} mood="happy" blink={false} />
      <Anim k="twinkle"><Spark x={54} y={20} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),

  birdseye: () => (
    <>
      <Ground a="p1" b="cta" floor={50} floorRole="p1" />
      <path d="M10 56V36M10 36L4 26M10 36L18 26" fill="none" stroke={F.brown} strokeWidth="3.6" />
      <path d="M4 26Q10 38 18 26" fill="none" stroke={F.red} strokeWidth="1.6" />
      <Anim k="dash">
        <ellipse cx="14" cy="32" rx="7.6" ry="6.6" fill={F.red} /><path d="M20 30L26 32L20 34Z" fill={F.yellow} /><path d="M8 28L4 24L12 26Z" fill={F.redD} />
        <Face x={13} y={31} s={0.55} mood="grin" blink={false} />
      </Anim>
      <path d="M26 30Q40 14 54 36" fill="none" stroke={F.white} strokeWidth="1.8" strokeDasharray="1 4" strokeLinecap="round" />
      <Anim k="shake"><rect x="46" y="38" width="12" height="12" rx="2.4" fill={F.tan} /><circle cx="52" cy="34" r="4.4" fill={F.lime} /><Face x={52} y={34} s={0.4} mood="wow" blink={false} /></Anim>
    </>
  ),

  wirecrossed: () => (
    <>
      <Ground a="p2" b="p1" />
      <rect x="6" y="10" width="38" height="30" rx="5" fill={F.coal} />
      <rect x="9" y="13" width="32" height="14" rx="2.4" fill={F.night} strokeWidth="1.2" />
      <Anim k="pulse"><Letters text="0:07" x={25} y={20} h={8} w={1.8} fill={F.red} /></Anim>
      <g fill="none" strokeWidth="2.4" strokeLinecap="round"><path d="M12 40Q14 52 22 54" stroke={F.red} /><path d="M20 40Q22 50 30 56" stroke={F.blue} /><path d="M28 40Q30 50 38 54" stroke={F.yellow} /></g>
      <Anim k="shake"><Face x={25} y={33.4} s={0.5} mood="wow" blink={false} /></Anim>
      <rect x="40" y="38" width="20" height="18" rx="2.4" fill={F.cream} transform="rotate(8 50 47)" />
      <g stroke="none" fill={F.greyD}><rect x="44" y="42" width="12" height="1.6" transform="rotate(8 50 47)" /><rect x="44" y="46" width="9" height="1.6" transform="rotate(8 50 47)" /></g>
      <Anim k="sway" o="50% 100%"><path d="M50 12L56 26M58 12L52 26" fill="none" stroke={F.grey} strokeWidth="2.6" /><circle cx="50" cy="10" r="2.6" fill={F.red} /><circle cx="58" cy="10" r="2.6" fill={F.red} /></Anim>
    </>
  ),

  lazysusan: () => (
    <>
      <Ground a="cta" b="p1" />
      <circle cx="32" cy="34" r="27" fill={F.tan} />
      <Anim k="spin" t={9}>
        <circle cx="32" cy="34" r="21" fill={F.cream} strokeWidth="1.6" />
        <ellipse cx="32" cy="18" rx="6.4" ry="4.6" fill={F.pink} /><rect x="27" y="17" width="10" height="3" fill={F.white} stroke="none" />
        <ellipse cx="46" cy="40" rx="6.4" ry="4.6" fill={F.orange} /><ellipse cx="20" cy="42" rx="6.4" ry="4.6" fill={F.lime} />
      </Anim>
      <circle cx="32" cy="34" r="7" fill={F.brown} /><Face x={32} y={34} s={0.62} mood="grin" blink={false} />
      <Anim k="hop" o="50% 100%"><Blobby x={54} y={10} r={5} fill={F.red} mood="wow" /></Anim>
      <Anim k="twinkle"><Spark x={8} y={10} r={3.4} fill={F.yellow} /></Anim>
    </>
  ),
}
