// First Cut's sprites: shaded fruit, their round lookalikes, the cut faces a
// half shows after the blade goes through, and the katana. Drawn once as SVG
// defs and referenced by <use>, so a table with a dozen items costs one set of
// gradients. One light, top-left, for every sprite.
//
// Item colours are gameplay information (a lemon must be yellow in every
// theme), so the sprites are fixed, like avatars: .claude/rules/theming-rules.md.
// Everything else on the table reads the theme's own --c-* tokens.

export default function FirstCutSprites() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
      <radialGradient id="fc-g-shade" cx=".36" cy=".32" r=".72"><stop offset=".55" stopColor="rgb(0 0 0)" stopOpacity="0"/><stop offset=".86" stopColor="rgb(0 0 0)" stopOpacity=".28"/><stop offset="1" stopColor="rgb(0 0 0)" stopOpacity=".5"/></radialGradient>
      <radialGradient id="fc-g-spec" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="rgb(255 255 255)" stopOpacity=".95"/><stop offset=".45" stopColor="rgb(255 255 255)" stopOpacity=".35"/><stop offset="1" stopColor="rgb(255 255 255)" stopOpacity="0"/></radialGradient>
      <radialGradient id="fc-g-soft" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="rgb(255 255 255)" stopOpacity=".5"/><stop offset="1" stopColor="rgb(255 255 255)" stopOpacity="0"/></radialGradient>
      <radialGradient id="fc-g-bounce" cx=".7" cy=".82" r=".4"><stop offset="0" stopColor="rgb(255 214 150)" stopOpacity=".35"/><stop offset="1" stopColor="rgb(255 214 150)" stopOpacity="0"/></radialGradient>
      <filter id="fc-f-blur1" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1"/></filter>
      <filter id="fc-f-blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>
      <filter id="fc-f-fuzz" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>
      <pattern id="fc-p-pores" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><circle cx="2" cy="2" r=".8" fill="rgb(150 70 0)" opacity=".4"/><circle cx="2.5" cy="1.6" r=".45" fill="rgb(255 235 190)" opacity=".5"/><circle cx="5.5" cy="5" r=".6" fill="rgb(150 70 0)" opacity=".3"/></pattern>
      <pattern id="fc-p-pebble" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="1" cy="1" r=".75" fill="rgb(60 20 0)" opacity=".42"/><circle cx="3" cy="3" r=".75" fill="rgb(60 20 0)" opacity=".42"/><circle cx="1.3" cy=".7" r=".3" fill="rgb(255 210 170)" opacity=".4"/></pattern>

      <radialGradient id="fc-g-melon" cx=".36" cy=".3" r=".8"><stop offset="0" stopColor="rgb(150 214 110)"/><stop offset=".5" stopColor="rgb(72 160 66)"/><stop offset="1" stopColor="rgb(24 92 44)"/></radialGradient>
      <clipPath id="fc-c-ball"><circle cx="50" cy="52" r="40"/></clipPath>
      <g id="fc-it-melon">
      <circle cx="50" cy="52" r="40" fill="url(#fc-g-melon)"/>
      <g clipPath="url(#fc-c-ball)" filter="url(#fc-f-blur1)" fill="none" stroke="rgb(18 70 36)" strokeLinecap="round" opacity=".85">
      <path d="M30 14 q-5 12 -3 22 q-4 8 -1 20 q-3 10 3 20 q0 8 4 14" strokeWidth="5.5"/>
      <path d="M49 10 q-4 14 0 26 q-4 10 1 22 q-3 12 0 34" strokeWidth="6"/>
      <path d="M68 13 q5 12 2 24 q5 9 1 21 q4 10 -2 20 q0 8 -4 13" strokeWidth="5.5"/>
      <path d="M16 34 q-3 18 2 36" strokeWidth="4"/><path d="M84 34 q3 18 -2 36" strokeWidth="4"/>
      </g>
      <circle cx="50" cy="52" r="40" fill="url(#fc-g-shade)"/><circle cx="50" cy="52" r="40" fill="url(#fc-g-bounce)"/>
      <ellipse cx="35" cy="33" rx="13" ry="8" fill="url(#fc-g-spec)" transform="rotate(-32 35 33)" opacity=".8"/>
      <path d="M50 13 q1 -7 8 -8 q4 0 5 3" fill="none" stroke="rgb(96 70 34)" strokeWidth="3.6" strokeLinecap="round"/>
      <circle cx="50" cy="13.5" r="3.4" fill="rgb(70 96 44)"/>
      </g>
      <radialGradient id="fc-g-vinyl" cx=".36" cy=".3" r=".8"><stop offset="0" stopColor="rgb(255 255 255)"/><stop offset=".6" stopColor="rgb(232 236 240)"/><stop offset="1" stopColor="rgb(150 160 176)"/></radialGradient>
      <radialGradient id="fc-g-vinylg" cx=".36" cy=".3" r=".8"><stop offset="0" stopColor="rgb(120 232 130)"/><stop offset=".6" stopColor="rgb(40 176 84)"/><stop offset="1" stopColor="rgb(12 104 60)"/></radialGradient>
      <g id="fc-it-beach">
      <circle cx="50" cy="52" r="40" fill="url(#fc-g-vinyl)"/>
      <path d="M50 52 L50 12 A40 40 0 0 1 84.6 32 Z M50 52 L84.6 72 A40 40 0 0 1 50 92 Z M50 52 L15.4 72 A40 40 0 0 1 15.4 32 Z" fill="url(#fc-g-vinylg)"/>
      <g stroke="rgb(0 0 0)" strokeOpacity=".16" strokeWidth="1.2" fill="none"><path d="M50 12 V92 M15.4 32 L84.6 72 M84.6 32 L15.4 72"/></g>
      <circle cx="50" cy="52" r="7.5" fill="rgb(246 248 250)" stroke="rgb(0 0 0)" strokeOpacity=".2" strokeWidth="1"/><circle cx="50" cy="52" r="2" fill="rgb(120 130 146)"/>
      <circle cx="50" cy="52" r="40" fill="url(#fc-g-shade)"/>
      <ellipse cx="33" cy="30" rx="15" ry="7" fill="rgb(255 255 255)" opacity=".85" transform="rotate(-36 33 30)"/>
      <ellipse cx="27" cy="43" rx="3" ry="6" fill="rgb(255 255 255)" opacity=".5" transform="rotate(-20 27 43)"/>
      <path d="M22 76 A40 40 0 0 0 78 80" fill="none" stroke="rgb(255 255 255)" strokeOpacity=".35" strokeWidth="2.4" strokeLinecap="round"/>
      </g>
      <radialGradient id="fc-g-orange" cx=".36" cy=".3" r=".8"><stop offset="0" stopColor="rgb(255 200 96)"/><stop offset=".5" stopColor="rgb(246 142 34)"/><stop offset="1" stopColor="rgb(176 78 8)"/></radialGradient>
      <linearGradient id="fc-g-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="rgb(126 204 96)"/><stop offset="1" stopColor="rgb(30 110 52)"/></linearGradient>
      <g id="fc-it-orange">
      <circle cx="50" cy="54" r="38" fill="url(#fc-g-orange)"/><circle cx="50" cy="54" r="38" fill="url(#fc-p-pores)"/>
      <circle cx="50" cy="54" r="38" fill="url(#fc-g-shade)"/><circle cx="50" cy="54" r="38" fill="url(#fc-g-bounce)"/>
      <ellipse cx="36" cy="37" rx="15" ry="10" fill="url(#fc-g-soft)" transform="rotate(-30 36 37)"/>
      <path d="M50 20 l2.5 -5 l3.5 4 l5 -1.5 l-1 5 l4.5 2.5 l-5 2 l-0.5 5 l-4.5 -3 l-4.5 3 l-0.5 -5 l-5 -2 l4.5 -2.5 l-1 -5 l5 1.5 Z" fill="rgb(70 122 50)" transform="translate(50 22) scale(.5) translate(-50 -22)"/>
      <path d="M52 18 q12 -16 28 -6 q-10 15 -28 6 Z" fill="url(#fc-g-leaf)"/><path d="M53 18 q12 -6 25 -5" fill="none" stroke="rgb(20 84 40)" strokeWidth="1.1" opacity=".7"/>
      </g>
      <radialGradient id="fc-g-hoop" cx=".36" cy=".3" r=".8"><stop offset="0" stopColor="rgb(238 142 70)"/><stop offset=".55" stopColor="rgb(204 96 34)"/><stop offset="1" stopColor="rgb(118 44 10)"/></radialGradient>
      <clipPath id="fc-c-ball2"><circle cx="50" cy="54" r="38"/></clipPath>
      <g id="fc-it-hoop">
      <circle cx="50" cy="54" r="38" fill="url(#fc-g-hoop)"/><circle cx="50" cy="54" r="38" fill="url(#fc-p-pebble)"/>
      <g clipPath="url(#fc-c-ball2)" fill="none" strokeLinecap="round">
      <path d="M50 14 V94 M10 54 H90 M22 22 Q46 54 22 86 M78 22 Q54 54 78 86" stroke="rgb(24 16 14)" strokeWidth="3.4"/>
      <path d="M51.4 14 V94 M10 55.4 H90" stroke="rgb(255 190 140)" strokeOpacity=".28" strokeWidth="1"/>
      </g>
      <circle cx="50" cy="54" r="38" fill="url(#fc-g-shade)"/>
      <ellipse cx="36" cy="36" rx="16" ry="10" fill="url(#fc-g-soft)" opacity=".55" transform="rotate(-30 36 36)"/>
      </g>
      <radialGradient id="fc-g-apple" cx=".34" cy=".3" r=".85"><stop offset="0" stopColor="rgb(255 120 100)"/><stop offset=".45" stopColor="rgb(214 36 44)"/><stop offset="1" stopColor="rgb(110 8 24)"/></radialGradient>
      <radialGradient id="fc-g-blush" cx=".7" cy=".62" r=".4"><stop offset="0" stopColor="rgb(250 206 90)" stopOpacity=".55"/><stop offset="1" stopColor="rgb(250 206 90)" stopOpacity="0"/></radialGradient>
      <clipPath id="fc-c-apple"><path d="M50 30 C36 14 10 24 12 52 C14 80 34 94 50 86 C66 94 86 80 88 52 C90 24 64 14 50 30 Z"/></clipPath>
      <g id="fc-it-apple">
      <path d="M50 30 C36 14 10 24 12 52 C14 80 34 94 50 86 C66 94 86 80 88 52 C90 24 64 14 50 30 Z" fill="url(#fc-g-apple)"/>
      <g clipPath="url(#fc-c-apple)">
      <rect x="0" y="0" width="100" height="100" fill="url(#fc-g-blush)"/>
      <g stroke="rgb(255 200 170)" strokeOpacity=".22" strokeWidth="1.1" fill="none"><path d="M30 34 q-8 22 0 46 M40 30 q-6 26 2 54 M62 32 q8 24 0 50 M72 36 q8 20 2 40"/></g>
      <ellipse cx="50" cy="29" rx="12" ry="5" fill="rgb(70 4 16)" opacity=".55" filter="url(#fc-f-blur1)"/>
      <rect x="0" y="0" width="100" height="100" fill="url(#fc-g-shade)"/>
      </g>
      <ellipse cx="30" cy="42" rx="9" ry="14" fill="url(#fc-g-spec)" transform="rotate(24 30 42)"/>
      <ellipse cx="27" cy="38" rx="2.6" ry="5" fill="rgb(255 255 255)" opacity=".8" transform="rotate(24 27 38)"/>
      <path d="M50 30 Q49 18 55 9" fill="none" stroke="rgb(88 58 30)" strokeWidth="3.6" strokeLinecap="round"/>
      <path d="M55 17 q13 -12 25 -3 q-11 12 -25 3 Z" fill="url(#fc-g-leaf)"/><path d="M56 17 q12 -5 22 -3" fill="none" stroke="rgb(20 84 40)" strokeWidth="1.1" opacity=".7"/>
      </g>
      <radialGradient id="fc-g-glass" cx=".34" cy=".3" r=".85"><stop offset="0" stopColor="rgb(255 150 150)"/><stop offset=".3" stopColor="rgb(226 30 48)"/><stop offset=".78" stopColor="rgb(120 4 26)"/><stop offset="1" stopColor="rgb(190 40 60)"/></radialGradient>
      <linearGradient id="fc-g-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgb(150 100 20)"/><stop offset=".3" stopColor="rgb(255 226 130)"/><stop offset=".55" stopColor="rgb(214 160 44)"/><stop offset=".8" stopColor="rgb(255 236 160)"/><stop offset="1" stopColor="rgb(140 92 16)"/></linearGradient>
      <clipPath id="fc-c-bauble"><circle cx="50" cy="56" r="36"/></clipPath>
      <g id="fc-it-bauble">
      <circle cx="50" cy="56" r="36" fill="url(#fc-g-glass)"/>
      <g clipPath="url(#fc-c-bauble)">
      <path d="M10 50 l8 8 l9 -8 l8 8 l9 -8 l9 8 l8 -8 l9 8 l8 -8 l9 8" fill="none" stroke="url(#fc-g-gold)" strokeWidth="5" strokeLinejoin="round"/>
      <path d="M8 74 Q50 92 92 74 L92 100 L8 100 Z" fill="rgb(255 255 255)" opacity=".12"/>
      <path d="M14 40 Q50 26 86 40" fill="none" stroke="rgb(255 255 255)" strokeOpacity=".3" strokeWidth="5" filter="url(#fc-f-blur1)"/>
      </g>
      <circle cx="50" cy="56" r="36" fill="url(#fc-g-shade)" opacity=".7"/>
      <ellipse cx="35" cy="39" rx="9" ry="5.5" fill="rgb(255 255 255)" opacity=".95" transform="rotate(-36 35 39)"/>
      <path d="M40 30 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 l4 -1.6 Z" fill="rgb(255 255 255)" transform="translate(-9 -2)"/>
      <rect x="41" y="13" width="18" height="10" rx="2" fill="url(#fc-g-gold)"/><path d="M41 19 h18" stroke="rgb(110 70 10)" strokeOpacity=".5" strokeWidth="1"/>
      <circle cx="50" cy="9" r="4.6" fill="none" stroke="url(#fc-g-gold)" strokeWidth="2.6"/>
      </g>
      <radialGradient id="fc-g-lemon" cx=".36" cy=".28" r=".85"><stop offset="0" stopColor="rgb(255 246 150)"/><stop offset=".5" stopColor="rgb(246 210 50)"/><stop offset="1" stopColor="rgb(178 132 10)"/></radialGradient>
      <pattern id="fc-p-pores2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><circle cx="2" cy="2" r=".7" fill="rgb(150 110 0)" opacity=".34"/><circle cx="2.4" cy="1.7" r=".4" fill="rgb(255 255 220)" opacity=".5"/><circle cx="5" cy="4.6" r=".5" fill="rgb(150 110 0)" opacity=".26"/></pattern>
      <clipPath id="fc-c-lemon"><path d="M8 54 Q14 46 20 40 C34 16 66 16 80 40 Q86 46 92 54 Q86 62 80 68 C66 92 34 92 20 68 Q14 62 8 54 Z"/></clipPath>
      <g id="fc-it-lemon">
      <path d="M8 54 Q14 46 20 40 C34 16 66 16 80 40 Q86 46 92 54 Q86 62 80 68 C66 92 34 92 20 68 Q14 62 8 54 Z" fill="url(#fc-g-lemon)"/>
      <g clipPath="url(#fc-c-lemon)"><rect width="100" height="100" fill="url(#fc-p-pores2)"/><rect width="100" height="100" fill="url(#fc-g-shade)" opacity=".8"/><rect width="100" height="100" fill="url(#fc-g-bounce)"/></g>
      <ellipse cx="37" cy="39" rx="15" ry="8" fill="url(#fc-g-soft)" transform="rotate(-24 37 39)"/>
      <path d="M52 23 q12 -15 25 -6 q-10 13 -25 6 Z" fill="url(#fc-g-leaf)"/><path d="M53 23 q12 -6 22 -5" fill="none" stroke="rgb(20 84 40)" strokeWidth="1.1" opacity=".7"/>
      </g>
      <radialGradient id="fc-g-felt" cx=".36" cy=".3" r=".8"><stop offset="0" stopColor="rgb(236 250 120)"/><stop offset=".55" stopColor="rgb(196 222 56)"/><stop offset="1" stopColor="rgb(110 138 20)"/></radialGradient>
      <g id="fc-it-tennis">
      <circle cx="50" cy="54" r="37" fill="url(#fc-g-felt)" filter="url(#fc-f-fuzz)"/>
      <g clipPath="url(#fc-c-ball2)" fill="none" strokeLinecap="round">
      <path d="M19 28 Q47 54 19 80 M81 28 Q53 54 81 80" stroke="rgb(120 140 30)" strokeOpacity=".5" strokeWidth="8" filter="url(#fc-f-blur1)"/>
      <path d="M19 28 Q47 54 19 80 M81 28 Q53 54 81 80" stroke="rgb(250 252 240)" strokeWidth="5"/>
      </g>
      <circle cx="50" cy="54" r="38" fill="url(#fc-g-shade)" opacity=".85"/>
      <ellipse cx="38" cy="38" rx="17" ry="11" fill="url(#fc-g-soft)" opacity=".5" transform="rotate(-30 38 38)"/>
      </g>

      <radialGradient id="fc-g-mflesh" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="rgb(255 96 104)"/><stop offset=".75" stopColor="rgb(226 44 62)"/><stop offset="1" stopColor="rgb(248 150 150)"/></radialGradient>
      <g id="fc-cut-melon">
      <circle cx="50" cy="52" r="40" fill="rgb(28 100 48)"/><circle cx="50" cy="52" r="37" fill="rgb(150 208 120)"/><circle cx="50" cy="52" r="34.5" fill="rgb(238 244 214)"/><circle cx="50" cy="52" r="32" fill="url(#fc-g-mflesh)"/>
      <g fill="rgb(40 20 16)"><ellipse cx="38" cy="40" rx="1.8" ry="3" transform="rotate(-30 38 40)"/><ellipse cx="62" cy="40" rx="1.8" ry="3" transform="rotate(30 62 40)"/><ellipse cx="34" cy="58" rx="1.8" ry="3" transform="rotate(-70 34 58)"/><ellipse cx="66" cy="58" rx="1.8" ry="3" transform="rotate(70 66 58)"/><ellipse cx="44" cy="70" rx="1.8" ry="3" transform="rotate(20 44 70)"/><ellipse cx="57" cy="70" rx="1.8" ry="3" transform="rotate(-20 57 70)"/><ellipse cx="44" cy="52" rx="1.6" ry="2.6"/><ellipse cx="57" cy="50" rx="1.6" ry="2.6"/></g>
      <ellipse cx="40" cy="38" rx="12" ry="6" fill="rgb(255 255 255)" opacity=".28" transform="rotate(-30 40 38)"/>
      </g>
      <radialGradient id="fc-g-oflesh" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="rgb(255 226 150)"/><stop offset=".3" stopColor="rgb(255 176 56)"/><stop offset="1" stopColor="rgb(246 140 30)"/></radialGradient>
      <g id="fc-cut-orange">
      <circle cx="50" cy="54" r="38" fill="rgb(236 128 24)"/><circle cx="50" cy="54" r="35" fill="rgb(255 240 206)"/><circle cx="50" cy="54" r="32" fill="url(#fc-g-oflesh)"/>
      <g stroke="rgb(255 240 206)" strokeWidth="2.2" strokeLinecap="round"><path d="M50 22 V86 M18 54 H82 M27.4 31.4 L72.6 76.6 M72.6 31.4 L27.4 76.6"/></g>
      <circle cx="50" cy="54" r="4" fill="rgb(255 244 214)"/>
      <ellipse cx="40" cy="40" rx="11" ry="6" fill="rgb(255 255 255)" opacity=".35" transform="rotate(-30 40 40)"/>
      </g>
      <g id="fc-cut-apple">
      <path d="M50 30 C36 14 10 24 12 52 C14 80 34 94 50 86 C66 94 86 80 88 52 C90 24 64 14 50 30 Z" fill="rgb(190 24 40)"/>
      <path d="M50 30 C36 14 10 24 12 52 C14 80 34 94 50 86 C66 94 86 80 88 52 C90 24 64 14 50 30 Z" fill="rgb(255 246 214)" transform="translate(50 54) scale(.91) translate(-50 -54)"/>
      <path d="M50 40 C40 36 34 48 38 58 C42 68 48 68 50 62 C52 68 58 68 62 58 C66 48 60 36 50 40 Z" fill="rgb(240 222 170)" stroke="rgb(214 190 130)" strokeWidth="1.2"/>
      <ellipse cx="45" cy="54" rx="2.2" ry="4" fill="rgb(70 36 16)" transform="rotate(14 45 54)"/><ellipse cx="55" cy="54" rx="2.2" ry="4" fill="rgb(70 36 16)" transform="rotate(-14 55 54)"/>
      <ellipse cx="34" cy="44" rx="8" ry="5" fill="rgb(255 255 255)" opacity=".5" transform="rotate(-30 34 44)"/>
      </g>
      <radialGradient id="fc-g-lflesh" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="rgb(255 252 200)"/><stop offset=".35" stopColor="rgb(255 236 110)"/><stop offset="1" stopColor="rgb(244 214 70)"/></radialGradient>
      <g id="fc-cut-lemon">
      <path d="M8 54 Q14 46 20 40 C34 16 66 16 80 40 Q86 46 92 54 Q86 62 80 68 C66 92 34 92 20 68 Q14 62 8 54 Z" fill="rgb(236 196 40)"/>
      <ellipse cx="50" cy="54" rx="33" ry="29" fill="rgb(255 250 220)"/><ellipse cx="50" cy="54" rx="30" ry="26" fill="url(#fc-g-lflesh)"/>
      <g stroke="rgb(255 250 220)" strokeWidth="2" strokeLinecap="round"><path d="M50 28 V80 M20 54 H80 M29 36 L71 72 M71 36 L29 72"/></g>
      <circle cx="50" cy="54" r="3.4" fill="rgb(255 252 230)"/>
      <ellipse cx="40" cy="42" rx="10" ry="5" fill="rgb(255 255 255)" opacity=".4" transform="rotate(-26 40 42)"/>
      </g>

      <linearGradient id="fc-g-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(255 255 255)"/><stop offset=".28" stopColor="rgb(214 222 232)"/><stop offset=".52" stopColor="rgb(150 160 174)"/><stop offset=".7" stopColor="rgb(96 106 122)"/><stop offset="1" stopColor="rgb(176 186 200)"/></linearGradient>
      <linearGradient id="fc-g-goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(255 236 160)"/><stop offset=".5" stopColor="rgb(214 160 44)"/><stop offset="1" stopColor="rgb(128 84 12)"/></linearGradient>
      <linearGradient id="fc-g-grip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(255 255 255)" stopOpacity=".4"/><stop offset=".45" stopColor="rgb(255 255 255)" stopOpacity="0"/><stop offset="1" stopColor="rgb(0 0 0)" stopOpacity=".45"/></linearGradient>
      <linearGradient id="fc-g-glint" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgb(255 255 255)" stopOpacity="0"/><stop offset=".5" stopColor="rgb(255 255 255)" stopOpacity=".95"/><stop offset="1" stopColor="rgb(255 255 255)" stopOpacity="0"/></linearGradient>
      <clipPath id="fc-c-blade"><path d="M2 28 C40 9 100 6 160 10 L160 24 C104 20 52 22 16 29 Z"/></clipPath>
      <g id="fc-katana-body">
      <path d="M2 28 C40 9 100 6 160 10 L160 24 C104 20 52 22 16 29 Z" fill="url(#fc-g-steel)" stroke="rgb(40 46 58)" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M10 24 q8 -2 12 -5 q6 2 12 -3 q7 2 13 -2 q7 2 14 -2 q8 2 15 -1 q8 2 16 -1 q8 2 16 0 q8 1 14 0 q8 1 16 1 L160 10 C100 6 40 9 2 28 Z" fill="rgb(255 255 255)" opacity=".55"/>
      <path d="M20 26.5 C54 20.5 104 18 160 21.5" fill="none" stroke="rgb(60 68 82)" strokeOpacity=".55" strokeWidth=".9"/>
      <rect x="158" y="8.5" width="8" height="17" rx="1.5" fill="url(#fc-g-goldv)" stroke="rgb(90 60 10)" strokeWidth=".8"/>
      <ellipse cx="170" cy="17" rx="4.6" ry="15" fill="rgb(34 30 36)" stroke="url(#fc-g-goldv)" strokeWidth="2.2"/>
      <ellipse cx="169" cy="12" rx="1.6" ry="6" fill="rgb(255 255 255)" opacity=".25"/>
      <rect x="174" y="9.5" width="38" height="15" rx="3" fill="currentColor" stroke="rgb(20 18 24)" strokeWidth="1"/>
      <path d="M178 10 l7 14 M186 10 l7 14 M194 10 l7 14 M202 10 l7 14 M185 10 l-7 14 M193 10 l-7 14 M201 10 l-7 14 M209 10 l-7 14" fill="none" stroke="rgb(250 246 236)" strokeOpacity=".85" strokeWidth="1.7"/>
      <rect x="174" y="9.5" width="38" height="15" rx="3" fill="url(#fc-g-grip)"/>
      <rect x="210" y="8.5" width="7" height="17" rx="3" fill="url(#fc-g-goldv)" stroke="rgb(90 60 10)" strokeWidth=".8"/>
      </g>
      <g id="fc-katana"><use href="#fc-katana-body"/></g>
      <g id="fc-fx-spark"><path d="M50 4 L60 38 L96 50 L60 62 L50 96 L40 62 L4 50 L40 38 Z" fill="rgb(255 236 150)"/><circle cx="50" cy="50" r="14" fill="rgb(255 255 255)"/></g>
      <g id="fc-fx-rot">
      <g filter="url(#fc-f-blur1)"><ellipse cx="36" cy="46" rx="11" ry="9" fill="rgb(84 58 28)" opacity=".85"/><ellipse cx="62" cy="66" rx="13" ry="10" fill="rgb(84 58 28)" opacity=".85"/><ellipse cx="64" cy="38" rx="7" ry="6" fill="rgb(84 58 28)" opacity=".8"/></g>
      <ellipse cx="36" cy="46" rx="4" ry="3" fill="rgb(40 26 12)"/><ellipse cx="63" cy="67" rx="5" ry="4" fill="rgb(40 26 12)"/>
      <g fill="rgb(240 244 250)" opacity=".85" stroke="rgb(60 60 70)" strokeWidth="1"><ellipse cx="81" cy="19" rx="7" ry="3.6" transform="rotate(-24 81 19)"/><ellipse cx="92" cy="25" rx="7" ry="3.6" transform="rotate(28 92 25)"/></g>
      <ellipse cx="86" cy="27" rx="4.4" ry="5.4" fill="rgb(26 24 30)"/><circle cx="84.6" cy="24.6" r="1.3" fill="rgb(190 40 40)"/>
      </g>
      <g id="fc-fx-gold">
      <path d="M82 6 l4.4 10 l11 1.2 l-8 7.6 l2.2 11 l-9.6 -5.6 l-9.6 5.6 l2.2 -11 l-8 -7.6 l11 -1.2 Z" fill="url(#fc-g-goldv)" stroke="rgb(120 80 10)" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M78 14 l2 5 l5 .6" fill="none" stroke="rgb(255 255 255)" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round"/>
      </g>
      </defs>
    </svg>
  )
}

/** A whole item. */
export function ItemSprite({ id, className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true"><use href={`#fc-it-${id}`} /></svg>
  )
}

/** What a cut half shows (fruit only; twins have no inside). */
export function CutFace({ id }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><use href={`#fc-cut-${id}`} /></svg>
}

/** One katana: tip left, cutting edge up, grip right. Tinted by the seat via `color`. */
export function Katana({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 220 40" aria-hidden="true">
      <use href="#fc-katana-body" />
      <g clipPath="url(#fc-c-blade)"><rect className="fc-glint" x="0" y="0" width="34" height="40" fill="url(#fc-g-glint)" /></g>
    </svg>
  )
}
