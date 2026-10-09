// LINE icon rules (the 20 redrawn below; the rest follow once approved):
// 24 grid, ink kept inside 2–22 including caps; structure is a 2px square-cap
// line in currentColor (or retro-dim when secondary); game pieces are solid
// shapes in the game's own colours — X retro-p1, O retro-p2, accent retro-cta.
// LineSvg sets the shared stroke so each icon only draws its shapes.
function LineSvg({ children }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
      {children}
    </svg>
  )
}

export function TicTacToeIcon() {
  return (
    <LineSvg>
      <path d="M8 3V21M16 3V21M3 8H21M3 16H21" className="stroke-retro-dim" />
      <path d="M3.5 3.5L5.5 5.5M5.5 3.5L3.5 5.5M11 11L13 13M13 11L11 13M18.5 18.5L20.5 20.5M20.5 18.5L18.5 20.5" className="stroke-retro-p1" />
      <circle cx="19.5" cy="4.5" r="1.5" className="stroke-retro-p2" />
      <circle cx="4.5" cy="19.5" r="1.5" className="stroke-retro-p2" />
    </LineSvg>
  )
}

export function ConnectFourIcon() {
  const holes = [
    [6.5, 10.5, 'dim'], [10.2, 10.5, 'dim'], [13.8, 10.5, 'dim'], [17.5, 10.5, 'p1'],
    [6.5, 14, 'dim'], [10.2, 14, 'p2'], [13.8, 14, 'p1'], [17.5, 14, 'p2'],
    [6.5, 17.5, 'p2'], [10.2, 17.5, 'p1'], [13.8, 17.5, 'p2'], [17.5, 17.5, 'p2'],
  ]
  return (
    <LineSvg>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      {holes.map(([cx, cy, c]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={c === 'dim' ? 1 : 1.5} stroke="none"
          className={c === 'dim' ? 'fill-retro-dim' : c === 'p1' ? 'fill-retro-p1' : 'fill-retro-p2'} />
      ))}
      <circle cx="17.5" cy="3.5" r="1.5" stroke="none" className="fill-retro-p1" />
    </LineSvg>
  )
}

export function HangwomanIcon() {
  return (
    <LineSvg>
      <path d="M3 21H10M6 21V4H14V6" />
      <circle cx="14" cy="9" r="2.2" stroke="none" className="fill-retro-p2" />
      <path d="M14 12V16M11.5 13.5H16.5M14 16L12 19.5M14 16L16 19.5" className="stroke-retro-p2" />
      <path d="M16 21H17M20 21H21" className="stroke-retro-dim" />
    </LineSvg>
  )
}

export function SosIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* S */}
      <rect x="2"  y="2"  width="6" height="1.5" fill="currentColor" />
      <rect x="2"  y="2"  width="1.5" height="4" fill="currentColor" />
      <rect x="2"  y="5.5" width="6" height="1.5" fill="currentColor" />
      <rect x="6.5" y="5.5" width="1.5" height="4" fill="currentColor" />
      <rect x="2"  y="9"  width="6" height="1.5" fill="currentColor" />
      {/* O */}
      <rect x="9"  y="5.5" width="6" height="1.5" fill="currentColor" />
      <rect x="9"  y="13"  width="6" height="1.5" fill="currentColor" />
      <rect x="9"  y="5.5" width="1.5" height="9" fill="currentColor" />
      <rect x="13.5" y="5.5" width="1.5" height="9" fill="currentColor" />
      {/* S (bottom-right) */}
      <rect x="16" y="13" width="6" height="1.5" fill="currentColor" />
      <rect x="16" y="13" width="1.5" height="4" fill="currentColor" />
      <rect x="16" y="16.5" width="6" height="1.5" fill="currentColor" />
      <rect x="20.5" y="16.5" width="1.5" height="4" fill="currentColor" />
      <rect x="16" y="20"  width="6" height="1.5" fill="currentColor" />
    </svg>
  )
}

export function ChimpIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 3×3 grid — top row fully lit (numbered), rest dim */}
      {[0,1,2,3,4,5,6,7,8].map(i => {
        const x = (i % 3) * 8 + 1, y = Math.floor(i / 3) * 8 + 1
        return <rect key={i} x={x} y={y} width="6" height="6" rx="1"
          fill="currentColor" opacity={i < 3 ? '1' : '0.2'} />
      })}
    </svg>
  )
}

export function NumberMemoryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Big "?" */}
      <text x="3" y="18" fontFamily="monospace" fontSize="18" fill="currentColor" opacity="0.9">?</text>
      {/* Small digit underline */}
      <rect x="2" y="20" width="14" height="2" rx="1" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

export function VisualMemoryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 3×3 grid; some cells lit */}
      {[0,1,2,3,4,5,6,7,8].map(i => {
        const lit = [0,2,4,6,8].includes(i)
        const x = (i % 3) * 8 + 1, y = Math.floor(i / 3) * 8 + 1
        return <rect key={i} x={x} y={y} width="6" height="6" rx="1"
          fill="currentColor" opacity={lit ? '1' : '0.2'} />
      })}
    </svg>
  )
}

// Quarter-ring pad for Simon, from angle a0 to a1 (degrees) around (12, 12).
function simonPad(a0, a1) {
  const p = (r, a) => `${(12 + r * Math.cos(a * Math.PI / 180)).toFixed(2)} ${(12 + r * Math.sin(a * Math.PI / 180)).toFixed(2)}`
  return `M${p(10, a0)}A10 10 0 0 1 ${p(10, a1)}L${p(3.5, a1)}A3.5 3.5 0 0 0 ${p(3.5, a0)}Z`
}

export function SimonIcon() {
  return (
    <LineSvg>
      <g stroke="none">
        <path d={simonPad(185, 265)} className="fill-retro-p1" />
        <path d={simonPad(275, 355)} className="fill-retro-danger" />
        <path d={simonPad(5, 85)} className="fill-retro-p4" />
        <path d={simonPad(95, 175)} className="fill-retro-cta" />
      </g>
    </LineSvg>
  )
}

export function DotsAndBoxesIcon() {
  return (
    <LineSvg>
      <g stroke="none">
        <rect x="5" y="5" width="6" height="6" className="fill-retro-p1" />
        <rect x="13" y="13" width="6" height="6" className="fill-retro-p2" />
      </g>
      <path d="M4 12V4H20M12 4V20M4 12H12M12 20H20V12" />
      <path d="M13 12H19" className="stroke-retro-cta" />
      <g stroke="none" fill="currentColor">
        {[4, 12, 20].flatMap(y => [4, 12, 20].map(x => <rect key={`${x}-${y}`} x={x - 1.5} y={y - 1.5} width="3" height="3" />))}
      </g>
    </LineSvg>
  )
}

export function ReactionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* lightning bolt */}
      <polygon points="14,2 6,13 13,13 10,22 18,11 11,11" fill="currentColor" />
    </svg>
  )
}

export function TypingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* keyboard body */}
      <rect x="1" y="6" width="22" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      {/* top row keys */}
      {[4, 8, 12, 16, 20].map(x => (
        <rect key={x} x={x - 1.5} y="9" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.8" />
      ))}
      {/* middle row keys */}
      {[5, 9, 13, 17].map(x => (
        <rect key={x} x={x - 1.5} y="13" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.6" />
      ))}
      {/* spacebar */}
      <rect x="6" y="16.5" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function MathIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* equals sign — two solid bars */}
      <rect x="3" y="8"  width="18" height="2.5" rx="1" fill="currentColor" />
      <rect x="3" y="13" width="18" height="2.5" rx="1" fill="currentColor" />
      {/* small + cross above — hints at arithmetic */}
      <rect x="10" y="2" width="4"  height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="11.25" y="0.75" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function ArrowsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 20 L3 13 Q3 7 9 7 L15 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 3 L15 7 L11 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function PulpIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 6 A7 7 0 0 0 11 20 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 4 A7 7 0 0 1 14 18 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 21 L21 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2.5" />
      <path d="M13 3 q1 -2 3 -2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function AimIcon() {
  return (
    <LineSvg>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" className="stroke-retro-cta" />
      <path d="M12 3V6M12 18V21M3 12H6M18 12H21" />
      <circle cx="12" cy="12" r="1.6" stroke="none" className="fill-retro-danger" />
    </LineSvg>
  )
}

export function ArcheryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="12" r="1" fill="currentColor" />
      <path d="M8 4 L20 16 M17.2 13.2 L20 16 L17.2 18.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  )
}

export function GomokuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[5, 12, 19].map(p => (
        <g key={p}>
          <line x1={p} y1="3" x2={p} y2="21" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          <line x1="3" y1={p} x2="21" y2={p} stroke="currentColor" strokeWidth="1" opacity="0.5" />
        </g>
      ))}
      <circle cx="5" cy="5" r="2.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="19" cy="19" r="2.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function ReversiIcon() {
  return (
    <LineSvg>
      <rect x="3" y="3" width="18" height="18" rx="2" className="stroke-retro-dim" />
      <g stroke="none">
        <circle cx="8" cy="8" r="3.2" className="fill-retro-p1" />
        <circle cx="16" cy="16" r="3.2" className="fill-retro-p1" />
        <circle cx="16" cy="8" r="3.2" className="fill-retro-p2" />
        <circle cx="8" cy="16" r="3.2" className="fill-retro-p2" />
      </g>
    </LineSvg>
  )
}

export function OrderChaosIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* X */}
      <line x1="3" y1="3" x2="10" y2="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="10" y1="3" x2="3" y2="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* O */}
      <circle cx="17" cy="17" r="4.5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}

export function DiceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      <circle cx="16" cy="8" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="8" cy="16" r="1.6" fill="currentColor" />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
    </svg>
  )
}

export function TwoTruthsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* two checks */}
      <polyline points="2,8 5,11 10,5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="2,16 5,19 10,13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* one cross (the lie) */}
      <line x1="15" y1="9" x2="22" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <line x1="22" y1="9" x2="15" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}

export function BluffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* domino mask — bluff */}
      <path d="M3 8 Q12 4 21 8 Q21 15 12 15 Q3 15 3 8 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" />
      <circle cx="15.5" cy="9.5" r="1.6" fill="currentColor" />
      <line x1="6" y1="18" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

export function WavelengthIcon() {
  return (
    <LineSvg>
      <path d="M3 15A9 9 0 0 1 21 15" />
      <path d="M12 15L17.16 7.63A9 9 0 0 1 19.37 9.84Z" stroke="none" className="fill-retro-cta" />
      <path d="M12 15L7.5 8" />
      <circle cx="12" cy="15" r="2" stroke="none" fill="currentColor" />
      <path d="M3 19H21" className="stroke-retro-dim" />
    </LineSvg>
  )
}

export function FibbageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* speech bubble */}
      <path d="M3 4 H21 V16 H9 L4 20 V16 H3 Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      {/* ... dots */}
      <circle cx="8" cy="10" r="1.3" fill="currentColor" />
      <circle cx="12" cy="10" r="1.3" fill="currentColor" />
      <circle cx="16" cy="10" r="1.3" fill="currentColor" />
    </svg>
  )
}

export function SpyfairIcon() {
  return (
    <LineSvg>
      <g stroke="none">
        <path d="M6.5 10L8 3H16L17.5 10Z" fill="currentColor" />
        <rect x="6.9" y="7.2" width="10.2" height="2" className="fill-retro-p2" />
        <rect x="2" y="10" width="20" height="2" fill="currentColor" />
      </g>
      <circle cx="8.5" cy="17" r="2.3" />
      <circle cx="15.5" cy="17" r="2.3" />
      <path d="M11.5 17H12.5" />
    </LineSvg>
  )
}

export function PongIcon() {
  return (
    <LineSvg>
      <path d="M12 3V21" strokeLinecap="butt" strokeDasharray="2 2" className="stroke-retro-dim" />
      <g stroke="none">
        <rect x="2" y="4" width="3" height="8" fill="currentColor" />
        <rect x="19" y="12" width="3" height="8" fill="currentColor" />
        <rect x="14" y="7" width="3" height="3" className="fill-retro-cta" />
      </g>
    </LineSvg>
  )
}

export function SnakeIcon() {
  return (
    <LineSvg>
      <path d="M3 20H10V13H17V9" />
      <g stroke="none">
        <rect x="15" y="3" width="4" height="5" fill="currentColor" />
        <rect x="17" y="4.5" width="1.5" height="1.5" className="fill-retro-card" />
        <rect x="19" y="17" width="3" height="3" className="fill-retro-cta" />
      </g>
    </LineSvg>
  )
}

export function TronIcon() {
  return (
    <LineSvg>
      <path d="M3 20H15V15" className="stroke-retro-p1" />
      <path d="M21 4H8V7" className="stroke-retro-p2" />
      <g stroke="none">
        <rect x="13" y="11" width="4" height="4" className="fill-retro-p1" />
        <rect x="6" y="7" width="4" height="4" className="fill-retro-p2" />
      </g>
    </LineSvg>
  )
}

export function SumoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* arena ring */}
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      {/* X blob */}
      <circle cx="8" cy="12" r="3" fill="currentColor" />
      {/* O blob */}
      <circle cx="16" cy="12" r="3" fill="currentColor" opacity="0.6" />
      {/* contact spark */}
      <rect x="11.5" y="11" width="1" height="2" fill="currentColor" />
    </svg>
  )
}

export function SpaceDuelIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* X ship — triangle pointing right */}
      <polygon points="3,9 9,12 3,15" fill="currentColor" />
      {/* O ship — triangle pointing left */}
      <polygon points="15,9 21,12 15,15" fill="currentColor" opacity="0.6" />
      {/* bullet between */}
      <rect x="11.5" y="11.5" width="1.5" height="1.5" fill="currentColor" />
      {/* starburst */}
      <circle cx="12" cy="5" r="0.7" fill="currentColor" opacity="0.6" />
      <circle cx="6"  cy="19" r="0.7" fill="currentColor" opacity="0.4" />
      <circle cx="18" cy="19" r="0.7" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

export function PaintIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* territory grid — mixed filled/empty cells suggesting a paint battle */}
      <rect x="2"  y="2"  width="5" height="5" fill="currentColor" />
      <rect x="8"  y="2"  width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="14" y="2"  width="4" height="5" fill="currentColor" opacity="0.7" />
      <rect x="2"  y="8"  width="5" height="5" fill="currentColor" opacity="0.7" />
      <rect x="8"  y="8"  width="5" height="5" fill="currentColor" opacity="0.5" />
      <rect x="14" y="8"  width="4" height="5" fill="currentColor" opacity="0.35" />
      <rect x="2"  y="14" width="5" height="4" fill="currentColor" opacity="0.35" />
      <rect x="8"  y="14" width="5" height="4" fill="currentColor" opacity="0.7" />
      <rect x="14" y="14" width="4" height="4" fill="currentColor" />
      {/* paint splat drop */}
      <circle cx="19" cy="19" r="2.4" fill="currentColor" />
    </svg>
  )
}

export function ChainReactionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* central orb — bright */}
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      {/* 4 exploding satellite orbs */}
      <circle cx="12" cy="4"  r="2" fill="currentColor" opacity="0.75" />
      <circle cx="12" cy="20" r="2" fill="currentColor" opacity="0.75" />
      <circle cx="4"  cy="12" r="2" fill="currentColor" opacity="0.75" />
      <circle cx="20" cy="12" r="2" fill="currentColor" opacity="0.75" />
      {/* radiating lines */}
      <line x1="12" y1="9"  x2="12" y2="6"  stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="12" y1="15" x2="12" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="9"  y1="12" x2="6"  y2="12" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="15" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  )
}

export function BlockadeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 3x3 grid */}
      <line x1="8" y1="2" x2="8" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="16" y1="2" x2="16" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      {/* wall segment blocking the path between the two pawns */}
      <rect x="7" y="7" width="10" height="2" fill="currentColor" />
      {/* opponent pawn, top */}
      <circle cx="12" cy="5" r="2.5" fill="currentColor" opacity="0.5" />
      {/* my pawn, bottom */}
      <circle cx="12" cy="19" r="2.5" fill="currentColor" />
    </svg>
  )
}

export function WordDuelIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* left board */}
      <rect x="1" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <rect x="3" y="5" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.8" />
      <rect x="3" y="7.5" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="3" y="10" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.2" />
      {/* right board */}
      <rect x="13" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <rect x="15" y="5" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="15" y="7.5" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="15" y="10" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.3" />
      {/* VS bar */}
      <rect x="10" y="4" width="4" height="8" rx="0.5" fill="currentColor" opacity="0.9" />
      <line x1="11" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="11" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {/* keyboard */}
      <rect x="2" y="15" width="20" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <rect x="3.5" y="16" width="2.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="6.5" y="16" width="2.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="9.5" y="16" width="2.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="12.5" y="16" width="2.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="3.5" y="18.4" width="2.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="6.5" y="18.4" width="2.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="9.5" y="18.4" width="2.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function WordCoopIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6h3M14 6h3M7 10h3M14 10h3M7 14h3M14 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 19h8M10 16v3M14 16v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
      <circle cx="5" cy="19" r="1.5" fill="currentColor" opacity=".65" />
      <circle cx="19" cy="19" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function HunchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* a rising pile: three cards stepping up, the top one in play */}
      <rect x="2" y="10" width="7" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
      <rect x="8.5" y="6.5" width="7" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" opacity="0.75" />
      <rect x="15" y="3" width="7" height="11" rx="1" fill="currentColor" />
      <path d="M4 7 L7 4 L10 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  )
}

export function ConvergeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* two word chains stepping toward one shared word */}
      <path d="M3 3 L8 8 L6 13 L12 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
      <path d="M21 3 L16 8 L18 13 L12 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="3" cy="3" r="1.4" fill="currentColor" opacity="0.65" />
      <circle cx="21" cy="3" r="1.4" fill="currentColor" />
      <circle cx="12" cy="20" r="2.5" fill="currentColor" />
    </svg>
  )
}

export function PasswordIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 6V4.5A3.5 3.5 0 0 1 10.5 1h3A3.5 3.5 0 0 1 17 4.5V6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8" cy="13" r="1" fill="currentColor" />
      <circle cx="12" cy="13" r="1" fill="currentColor" />
      <circle cx="16" cy="13" r="1" fill="currentColor" />
      <path d="M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function WordRaceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="8" height="14" rx="1" fill="currentColor" opacity="0.28" />
      <rect x="14" y="4" width="8" height="14" rx="1" fill="currentColor" opacity="0.55" />
      <path d="M5 8h2M5 11h2M5 14h2M17 8h2M17 11h2M17 14h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 20h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 20l2-3 2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PairsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 2×2 card grid — top-left & bottom-right "matched" (lit + face mark), the
          other two still face-down (dim) */}
      <rect x="2"  y="2"  width="9" height="9" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="13" y="2"  width="9" height="9" rx="1.5" fill="currentColor" opacity="0.2" />
      <rect x="2"  y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.2" />
      <rect x="13" y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="5"  y="5"   width="3" height="3" fill="currentColor" opacity="1" />
      <rect x="16" y="16"  width="3" height="3" fill="currentColor" opacity="1" />
    </svg>
  )
}

export function WordHuntIcon() {
  // 3×3 letter tiles; the found word is filled, its trail drawn through.
  const found = new Set(['0,0', '1,1', '2,1'])
  const cells = [0, 1, 2].flatMap(r => [0, 1, 2].map(c => [c, r]))
  return (
    <LineSvg>
      {cells.filter(([c, r]) => !found.has(`${c},${r}`)).map(([c, r]) => (
        <rect key={`${c},${r}`} x={3 + c * 7} y={3 + r * 7} width="4" height="4" rx="1" className="stroke-retro-dim" />
      ))}
      <g stroke="none">
        {cells.filter(([c, r]) => found.has(`${c},${r}`)).map(([c, r]) => (
          <rect key={`${c},${r}`} x={2 + c * 7} y={2 + r * 7} width="6" height="6" rx="1" className="fill-retro-cta" />
        ))}
      </g>
      <path d="M5 5L12 12H19" />
    </LineSvg>
  )
}

export function AnagramsIcon() {
  // Three letter tiles; the outer two swap places.
  return (
    <LineSvg>
      <rect x="3" y="10" width="4" height="4" rx="1" />
      <rect x="17" y="10" width="4" height="4" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="none" className="fill-retro-cta" />
      <path d="M5 6V4H19V5M19 18V20H5V19" />
      <g stroke="none" fill="currentColor">
        <path d="M16.5 5.5H21.5L19 8Z" />
        <path d="M2.5 18.5H7.5L5 16Z" />
      </g>
    </LineSvg>
  )
}

export function PacmacIcon() {
  return (
    <LineSvg>
      <g stroke="none">
        <path d="M11 12L18.4 6.8A9 9 0 1 0 18.4 17.2Z" className="fill-retro-cta" />
        <circle cx="11" cy="7.5" r="1.2" fill="currentColor" />
        <rect x="19.5" y="10.8" width="2.5" height="2.5" fill="currentColor" />
      </g>
    </LineSvg>
  )
}

export function HexIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 L20.5 7 L20.5 17 L12 22 L3.5 17 L3.5 7 Z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" />
      <circle cx="8" cy="9" r="1.6" fill="currentColor" />
      <circle cx="16" cy="15" r="1.6" fill="currentColor" opacity="0.45" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

export function MinesIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="6" height="6" fill="currentColor" />
      <rect x="10.5" y="4" width="3" height="3" fill="currentColor" opacity="0.85" />
      <rect x="4" y="10.5" width="3" height="3" fill="currentColor" opacity="0.85" />
      <rect x="17" y="10.5" width="3" height="3" fill="currentColor" opacity="0.85" />
      <rect x="10.5" y="17" width="3" height="3" fill="currentColor" opacity="0.85" />
      <rect x="6" y="6" width="2" height="2" fill="currentColor" opacity="0.5" />
      <rect x="16" y="6" width="2" height="2" fill="currentColor" opacity="0.5" />
      <rect x="6" y="16" width="2" height="2" fill="currentColor" opacity="0.5" />
      <rect x="16" y="16" width="2" height="2" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function HerdIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* three heads, one herd */}
      <circle cx="7" cy="9" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="9" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="16" r="3.5" fill="currentColor" />
    </svg>
  )
}

export function TriviaIcon() {
  return (
    <LineSvg>
      <rect x="3" y="3" width="18" height="13" rx="2" />
      <path d="M7 16H12L7 21Z" stroke="none" fill="currentColor" />
      <path d="M9.5 8V6.5H14.5V9.5H12V11" className="stroke-retro-cta" />
      <rect x="11" y="12.5" width="2" height="2" stroke="none" className="fill-retro-cta" />
    </LineSvg>
  )
}

export function BattleshipIcon() {
  return (
    <LineSvg>
      <g stroke="none" fill="currentColor">
        <path d="M2 12H22L19 18H5Z" />
        <rect x="8" y="8" width="7" height="4" />
      </g>
      <path d="M11 4V7" />
      <path d="M3 21H5M8 21H10M13 21H15M18 21H20" className="stroke-retro-dim" />
      <path d="M17 4L20 7M20 4L17 7" className="stroke-retro-danger" />
    </LineSvg>
  )
}

export function MancalaIcon() {
  const pits = [[7.5, 9.5, true], [12, 9.5, false], [16.5, 9.5, true], [7.5, 14.5, false], [12, 14.5, true], [16.5, 14.5, true]]
  return (
    <LineSvg>
      <rect x="3" y="5" width="18" height="14" rx="4" />
      <g stroke="none">
        {pits.map(([cx, cy, seed]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="2.2" className="fill-retro-dim" />
            {seed && <circle cx={cx} cy={cy} r="1.3" className="fill-retro-cta" />}
          </g>
        ))}
      </g>
    </LineSvg>
  )
}

export function CheckersIcon() {
  // A crowned double stack: "king me".
  return (
    <LineSvg>
      <g stroke="none">
        <path d="M5 9V4L8.5 7L12 3L15.5 7L19 4V9Z" fill="currentColor" />
        <rect x="2" y="11" width="20" height="5" rx="2.5" className="fill-retro-p2" />
        <rect x="2" y="17" width="20" height="5" rx="2.5" className="fill-retro-p2" />
      </g>
    </LineSvg>
  )
}

export function AirHockeyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
      <line x1="6.5" y1="12" x2="17.5" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="12" cy="8" r="1.4" fill="currentColor" />
      <circle cx="12" cy="16.5" r="2.6" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

export function YachtIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="9" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="13" r="1.3" fill="currentColor" />
      <circle cx="10" cy="17" r="1.3" fill="currentColor" />
      <rect x="12" y="3" width="10" height="10" rx="2.2" fill="currentColor" opacity="0.85" />
      <path d="M5 4.5h4M7 2.5v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  )
}

export function PuckRushIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 12h5M14 12h5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="9" cy="7" r="1.8" fill="currentColor" opacity="0.6" />
      <circle cx="15" cy="17" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  )
}

export function ArtilleryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20 L20 20 L17 16 L7 16 Z" fill="currentColor" />
      <line x1="12" y1="15" x2="18" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      <circle cx="19" cy="3.5" r="1.6" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

export function MinigolfIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* flag in the cup, ball on the green */}
      <line x1="14" y1="4" x2="14" y2="17" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 4 L20 6.5 L14 9 Z" fill="currentColor" />
      <ellipse cx="14" cy="18.5" rx="5" ry="1.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="17" r="2.2" fill="currentColor" />
    </svg>
  )
}

export function BirdseyeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* a sling fork, a bird mid-arc and the toppling fort */}
      <path d="M3 21V15M3 15L1.5 11.5M3 15L4.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 11Q10 3 15 7" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.5 2" strokeLinecap="round" />
      <path d="M13.2 5.2l2.4-1.3 1.6 1.8-2.6 1.2z" fill="currentColor" />
      <circle cx="16.4" cy="4.9" r="0.6" className="fill-retro-bg" />
      <rect x="17" y="12" width="2" height="9" fill="currentColor" />
      <rect x="21" y="12" width="2" height="9" fill="currentColor" />
      <rect x="16.5" y="10" width="7" height="2" className="fill-retro-p2" />
    </svg>
  )
}

export function SketchIcon() {
  return (
    <LineSvg>
      <path d="M14 4L20 10L9 21H3V15Z" />
      <path d="M12.5 5.5L18.5 11.5" />
      <g stroke="none">
        <path d="M14 4L15.8 2.2L21.8 8.2L20 10Z" className="fill-retro-p2" />
        <path d="M3 21V17.5L6.5 21Z" fill="currentColor" />
      </g>
    </LineSvg>
  )
}

export function SimIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* hexagon of dots + three colored-in edges forming a losing triangle */}
      <circle cx="12" cy="3.5" r="1.7" fill="currentColor" />
      <circle cx="19.5" cy="8.5" r="1.7" fill="currentColor" />
      <circle cx="16.5" cy="17" r="1.7" fill="currentColor" />
      <circle cx="7.5" cy="17" r="1.7" fill="currentColor" />
      <circle cx="4.5" cy="8.5" r="1.7" fill="currentColor" />
      <circle cx="12" cy="10.5" r="0" fill="none" />
      <line x1="12" y1="3.5" x2="19.5" y2="8.5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="19.5" y1="8.5" x2="16.5" y2="17" stroke="currentColor" strokeWidth="1.6" />
      <line x1="16.5" y1="17" x2="12" y2="3.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function ChompIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* chocolate bar with a bite (missing lower-right block) + poison skull dot */}
      <rect x="3" y="3" width="8" height="8" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="3" width="8" height="8" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13" width="8" height="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      <circle cx="9.9" cy="6" r="1.4" fill="currentColor" />
    </svg>
  )
}

export function BreakthroughIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* pawn racing forward through a gap in the wall */}
      <rect x="3" y="4" width="4" height="3" fill="currentColor" opacity="0.5" />
      <rect x="10" y="4" width="4" height="3" fill="currentColor" opacity="0.5" />
      <rect x="17" y="4" width="4" height="3" fill="currentColor" opacity="0.5" />
      <rect x="3" y="10" width="4" height="3" fill="currentColor" opacity="0.5" />
      <rect x="17" y="10" width="4" height="3" fill="currentColor" opacity="0.5" />
      <path d="M12 20 L9 16 L11 16 L11 8 L13 8 L13 16 L15 16 Z" fill="currentColor" />
    </svg>
  )
}

export function AtaxxIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* center piece converting ring of neighbors: filled center, half-tinted ring */}
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <circle cx="12" cy="5.5" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="17.7" cy="8.7" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="17.7" cy="15.3" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="12" cy="18.5" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="6.3" cy="15.3" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="6.3" cy="8.7" r="2" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

export function KamisadoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* colored checkerboard + a tower striding across */}
      <rect x="3" y="3" width="8" height="8" fill="currentColor" opacity="0.35" />
      <rect x="13" y="13" width="8" height="8" fill="currentColor" opacity="0.35" />
      <rect x="13" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
      <rect x="3" y="13" width="8" height="8" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
      <path d="M9 19 L11 15 L13 15 L15 19 Z" fill="currentColor" />
      <rect x="11" y="9" width="2" height="6" fill="currentColor" />
    </svg>
  )
}

export function OnitamaIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* movement card + dojo grid */}
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="6.5" r="1.4" fill="currentColor" opacity="0.6" />
      <circle cx="17" cy="12" r="1.4" fill="currentColor" opacity="0.6" />
      <circle cx="7" cy="12" r="1.4" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

export function QuartoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* four attribute pieces: round/square, hollow/solid, tall/short */}
      <circle cx="7" cy="7" r="3.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="3.4" fill="currentColor" />
      <rect x="13.6" y="13.6" width="6.8" height="6.8" stroke="currentColor" strokeWidth="2" />
      <rect x="3.6" y="13.6" width="6.8" height="6.8" fill="currentColor" />
    </svg>
  )
}

export function SantoriniIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* tiered tower with dome + worker */}
      <rect x="4" y="16" width="16" height="4" fill="currentColor" opacity="0.5" />
      <rect x="6" y="12" width="12" height="4" fill="currentColor" opacity="0.7" />
      <rect x="8" y="8" width="8" height="4" fill="currentColor" />
      <path d="M9 8 A4 3 0 0 1 15 8 Z" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
    </svg>
  )
}

export function LoaIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* checkers converging into one connected group */}
      <circle cx="5" cy="5" r="2.4" fill="currentColor" opacity="0.5" />
      <circle cx="12" cy="8" r="2.4" fill="currentColor" opacity="0.7" />
      <circle cx="18" cy="12" r="2.4" fill="currentColor" />
      <circle cx="12" cy="15" r="2.4" fill="currentColor" opacity="0.7" />
      <circle cx="6" cy="19" r="2.4" fill="currentColor" opacity="0.5" />
      <path d="M7 6.5 L10 7.5 M14 9.5 L16 11 M14.5 14 L13 14.5 M9 17.5 L10.5 16" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  )
}

export function YavalathIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* four-in-a-row wins (filled hexes), the fourth stone glowing */}
      <path d="M6 4 L9 5.75 L9 9.25 L6 11 L3 9.25 L3 5.75 Z" fill="currentColor" opacity="0.5" />
      <path d="M11 7 L14 8.75 L14 12.25 L11 14 L8 12.25 L8 8.75 Z" fill="currentColor" opacity="0.7" />
      <path d="M16 10 L19 11.75 L19 15.25 L16 17 L13 15.25 L13 11.75 Z" fill="currentColor" opacity="0.85" />
      <path d="M21 13 L24 14.75 L24 18.25 L21 20 L18 18.25 L18 14.75 Z" fill="currentColor" />
    </svg>
  )
}

export function HeadsUpIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* prompt card held up on the forehead */}
      <rect x="6" y="1.5" width="12" height="8" rx="1" fill="currentColor" />
      {/* head */}
      <circle cx="12" cy="15.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="15" r="0.9" fill="currentColor" />
      <circle cx="14" cy="15" r="0.9" fill="currentColor" />
      <path d="M10 18 Q12 19.3 14 18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function ChameleonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* body + head */}
      <path d="M3 12 Q5 7 11 7 Q17 7 19 11 L21.5 12.5 L19 13.5 Q17 16 12 16 L7 16 Q4 16 3 12 Z" fill="currentColor" opacity="0.85" />
      {/* eye */}
      <circle cx="17" cy="10.5" r="1.3" fill="currentColor" />
      {/* curled tail */}
      <path d="M4 14 Q1.5 18 5 20 Q8 21 8 18.5 Q8 17 6.5 17.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* legs */}
      <line x1="9" y1="16" x2="8" y2="19" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="15" y1="15.5" x2="16" y2="19" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function CodeWordsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 3×3 word cards: two claimed, one assassin, the rest face-down */}
      {[2, 9, 16].map(x => [3, 10, 17].map(y => (
        <rect key={`${x}-${y}`} x={x} y={y} width="6" height="4.5" rx="0.5"
          stroke="currentColor" strokeWidth="1" opacity="0.45" />
      )))}
      <rect x="2" y="3" width="6" height="4.5" rx="0.5" fill="currentColor" />
      <rect x="9" y="10" width="6" height="4.5" rx="0.5" fill="currentColor" opacity="0.75" />
      <path d="M17 17.5 L21 21 M21 17.5 L17 21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function JustOneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* two matching clue cards cancel; one survives */}
      <rect x="1.5" y="3" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <rect x="13.5" y="3" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <line x1="1" y1="9.5" x2="23" y2="2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <rect x="6" y="13" width="12" height="8" rx="1" fill="currentColor" />
      <path d="M11 15.5 L12.5 14.5 L12.5 19.5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'rgb(var(--c-bg))' }} />
    </svg>
  )
}

export function WireCrossedIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* a device with two crossed wires and a clock readout */}
      <rect x="2.5" y="5" width="19" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="2" width="12" height="3" rx="0.5" fill="currentColor" opacity="0.7" />
      <path d="M5.5 10 C 10 10, 14 17, 18.5 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 17 C 10 17, 14 10, 18.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
      <circle cx="5.5" cy="10" r="1.2" fill="currentColor" />
      <circle cx="18.5" cy="17" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function LanternsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* a hanging lantern beside a fanned pair of cards */}
      <path d="M7 2v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 5h5l1 2.5v5l-1 2.5h-5l-1-2.5v-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 8.5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
      <rect x="13" y="7" width="7" height="10" rx="1" transform="rotate(8 16.5 12)" stroke="currentColor" strokeWidth="1.4" opacity=".55" />
      <rect x="12" y="9" width="7" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.5 12.2l1.6 2.8h-3.2z" fill="currentColor" />
      <path d="M6 19.5h2M7 16v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".6" />
    </svg>
  )
}

export function DockingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* a capsule closing on a port, with a die for the crew's rolls */}
      <path d="M2 9h5l2 3-2 3H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1 1.5" />
      <path d="M22 6v12M22 9h-4v6h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="3" y="17.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" opacity=".7" />
      <circle cx="4.6" cy="19.1" r=".7" fill="currentColor" opacity=".7" />
      <circle cx="6.9" cy="21.4" r=".7" fill="currentColor" opacity=".7" />
    </svg>
  )
}

export function AnimalStackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* island, a wide animal, a tilted one on top, and a small one teetering */}
      <path d="M2 21h20l-2.5 2h-15z" fill="currentColor" opacity=".5" />
      <rect x="5" y="15" width="12" height="5" fill="currentColor" />
      <rect x="17" y="16" width="3" height="3" fill="currentColor" opacity=".7" />
      <rect x="8" y="9.5" width="8" height="4" fill="currentColor" opacity=".85" transform="rotate(-10 12 11.5)" />
      <path d="M11 3.5h4v4h-4z" fill="currentColor" opacity=".6" transform="rotate(12 13 5.5)" />
      <rect x="15" y="16" width="1" height="1" fill="none" stroke="currentColor" strokeWidth=".8" opacity=".4" />
    </svg>
  )
}

export function UpdraftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="19" width="8" height="2" rx="0.5" fill="currentColor" />
      <rect x="13" y="12" width="8" height="2" rx="0.5" fill="currentColor" />
      <rect x="4" y="5" width="7" height="2" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="6" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 9 L8.5 6.5 M7 8 L8.5 6.5 L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Memory shelf additions ──

export function VerbalMemoryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* A word card with two answer tabs */}
      <rect x="3" y="4" width="18" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="8" width="12" height="2" fill="currentColor" opacity="0.8" />
      <rect x="3" y="17" width="8" height="4" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="13" y="17" width="8" height="4" rx="1" fill="currentColor" />
    </svg>
  )
}

export function NBackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 3×3 grid, one lit cell and its echo */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
        const x = (i % 3) * 8 + 1, y = Math.floor(i / 3) * 8 + 1
        return <rect key={i} x={x} y={y} width="6" height="6" rx="1" fill="currentColor" opacity={i === 4 ? '1' : i === 0 ? '0.55' : '0.2'} />
      })}
    </svg>
  )
}

export function CupShuffleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" shapeRendering="crispEdges">
      {/* Three cups, the middle one lifted over the ball */}
      <rect x="1" y="11" width="6" height="8" fill="currentColor" opacity="0.6" />
      <rect x="9" y="5" width="6" height="8" fill="currentColor" />
      <rect x="17" y="11" width="6" height="8" fill="currentColor" opacity="0.6" />
      <rect x="10.5" y="16" width="3" height="3" fill="currentColor" />
      <rect x="0" y="20" width="24" height="2" fill="currentColor" opacity="0.35" />
    </svg>
  )
}

export function WhatChangedIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Two scenes; one tile differs */}
      <rect x="1" y="3" width="10" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <rect x="13" y="3" width="10" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="6" width="3" height="3" fill="currentColor" opacity="0.6" />
      <rect x="6" y="14" width="3" height="3" fill="currentColor" opacity="0.6" />
      <rect x="15" y="6" width="3" height="3" fill="currentColor" />
      <rect x="15" y="14" width="3" height="3" fill="currentColor" />
    </svg>
  )
}

export function KimsGameIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* A tray of objects with one empty, dashed slot */}
      <rect x="2" y="4" width="20" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <rect x="5" y="7" width="4" height="4" fill="currentColor" />
      <rect x="10" y="7" width="4" height="4" fill="currentColor" />
      <rect x="15" y="7" width="4" height="4" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1" />
      <rect x="5" y="13" width="4" height="4" fill="currentColor" />
      <rect x="10" y="13" width="4" height="4" fill="currentColor" />
    </svg>
  )
}

export function NameTagsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* A face with a name tag under it */}
      <circle cx="12" cy="9" r="5" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="8" width="1.5" height="1.5" fill="currentColor" />
      <rect x="12.5" y="8" width="1.5" height="1.5" fill="currentColor" />
      <rect x="5" y="16" width="14" height="5" rx="1" fill="currentColor" opacity="0.8" />
    </svg>
  )
}

export function SplitSignalIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* One grid, two halves in two weights */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
        const x = (i % 3) * 8 + 1, y = Math.floor(i / 3) * 8 + 1
        const lit = [0, 4, 8].includes(i) ? '1' : [2, 6].includes(i) ? '0.5' : '0.15'
        return <rect key={i} x={x} y={y} width="6" height="6" rx="1" fill="currentColor" opacity={lit} />
      })}
    </svg>
  )
}

// The party lobby (party-first rooms): three friends, the middle one hosting.
export function PartyIcon() {
  return (
    <LineSvg>
      <circle cx="12" cy="8" r="2.5" stroke="none" className="fill-retro-cta" />
      <path d="M8 20V17A4 4 0 0 1 16 17V20" className="stroke-retro-cta" />
      <circle cx="5" cy="10" r="2" stroke="none" className="fill-retro-p1" />
      <path d="M2 20V18A3 3 0 0 1 6.5 15.5" className="stroke-retro-p1" />
      <circle cx="19" cy="10" r="2" stroke="none" className="fill-retro-p2" />
      <path d="M22 20V18A3 3 0 0 0 17.5 15.5" className="stroke-retro-p2" />
    </LineSvg>
  )
}
