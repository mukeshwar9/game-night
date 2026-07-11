export function TicTacToeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="8" y1="2" x2="8" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
      <line x1="16" y1="2" x2="16" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
      <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
    </svg>
  )
}

export function ConnectFourIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[3, 9, 15, 21].map(cx =>
        [4, 12, 20].map(cy => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5"
            fill="currentColor" opacity={cy === 4 ? '1' : '0.4'} />
        ))
      )}
    </svg>
  )
}

export function HangwomanIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* gallows */}
      <line x1="4" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <line x1="7" y1="22" x2="7" y2="3"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <line x1="7" y1="3"  x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <line x1="15" y1="3" x2="15" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      {/* pixel figure */}
      <rect x="13" y="6"  width="4" height="4" fill="currentColor" />
      <rect x="14" y="10" width="2" height="3" fill="currentColor" opacity="0.7" />
      <rect x="12" y="11" width="2" height="2" fill="currentColor" opacity="0.7" />
      <rect x="16" y="11" width="2" height="2" fill="currentColor" opacity="0.7" />
    </svg>
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

export function SimonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 2×2 Simon pads */}
      <rect x="2"  y="2"  width="9" height="9" rx="1.5" fill="currentColor" opacity="1"   />
      <rect x="13" y="2"  width="9" height="9" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="2"  y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="13" y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.2" />
    </svg>
  )
}

export function DotsAndBoxesIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* dots */}
      {[4, 12, 20].map(cx =>
        [4, 12, 20].map(cy => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill="currentColor" />
        ))
      )}
      {/* partial edges */}
      <line x1="4" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" opacity="0.7" />
      <line x1="4" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" opacity="0.7" />
      <line x1="4" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" opacity="0.7" />
      <line x1="12" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" opacity="0.7" />
      {/* filled box */}
      <rect x="5" y="5" width="6" height="6" fill="currentColor" opacity="0.25" />
    </svg>
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

export function AimIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <circle cx="16" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
    </svg>
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* gauge arc */}
      <path d="M3 18 A9 9 0 0 1 21 18" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* needle */}
      <line x1="12" y1="18" x2="16" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.8" fill="currentColor" />
    </svg>
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* hat brim + crown */}
      <ellipse cx="12" cy="13" rx="10" ry="2.5" fill="currentColor" />
      <path d="M6 13 Q7 5 12 5 Q17 5 18 13 Z" fill="currentColor" opacity="0.85" />
      {/* glasses hint */}
      <circle cx="9" cy="18" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="15" cy="18" r="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="11" y1="18" x2="13" y2="18" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function PongIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* paddles */}
      <rect x="2" y="7" width="2.5" height="10" fill="currentColor" />
      <rect x="19.5" y="9" width="2.5" height="10" fill="currentColor" />
      {/* ball */}
      <rect x="11" y="11" width="3" height="3" fill="currentColor" />
      {/* centre net */}
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
    </svg>
  )
}

export function SnakeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* snake body — an S-curve of pixel segments */}
      <rect x="3"  y="4"  width="4" height="4" fill="currentColor" />
      <rect x="7"  y="4"  width="4" height="4" fill="currentColor" opacity="0.85" />
      <rect x="11" y="4"  width="4" height="4" fill="currentColor" opacity="0.7" />
      <rect x="11" y="8"  width="4" height="4" fill="currentColor" opacity="0.7" />
      <rect x="11" y="12" width="4" height="4" fill="currentColor" opacity="0.85" />
      <rect x="7"  y="12" width="4" height="4" fill="currentColor" opacity="0.7" />
      <rect x="7"  y="16" width="4" height="4" fill="currentColor" opacity="0.55" />
      {/* head */}
      <rect x="15" y="16" width="4" height="4" fill="currentColor" />
    </svg>
  )
}

export function TronIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* X trail — horizontal then 90° down */}
      <rect x="2"  y="5"  width="4" height="4" fill="currentColor" />
      <rect x="6"  y="5"  width="4" height="4" fill="currentColor" opacity="0.85" />
      <rect x="10" y="5"  width="4" height="4" fill="currentColor" opacity="0.7" />
      <rect x="10" y="9"  width="4" height="4" fill="currentColor" opacity="0.55" />
      <rect x="10" y="13" width="4" height="4" fill="currentColor" opacity="0.4" />
      {/* O trail — vertical then 90° right (mirrored) */}
      <rect x="22" y="19" width="0" height="0" fill="none" />
      <rect x="14" y="15" width="4" height="4" fill="currentColor" opacity="0.4" />
      <rect x="18" y="15" width="4" height="4" fill="currentColor" opacity="0.7" />
      <rect x="18" y="11" width="4" height="4" fill="currentColor" opacity="0.55" />
      <rect x="18" y="7"  width="4" height="4" fill="currentColor" opacity="0.7" />
      {/* both heads */}
      <rect x="14" y="17" width="4" height="2" fill="currentColor" />
      <rect x="18" y="5"  width="4" height="2" fill="currentColor" />
    </svg>
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
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 4×4 letter-tile grid, faint */}
      {[4, 10, 16, 22].map((y) =>
        [4, 10, 16, 22].map((x) => (
          <rect key={`${x}-${y}`} x={x - 2} y={y - 2} width="4" height="4" rx="0.6"
            fill="currentColor" opacity="0.18" />
        ))
      )}
      {/* traced word path across five tiles */}
      <polyline points="4,4 10,4 16,10 22,10 22,16" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx="4" cy="4" r="1.5" fill="currentColor" />
      <circle cx="10" cy="4" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="16" cy="10" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="22" cy="10" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="22" cy="16" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function SketchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* pencil */}
      <path d="M14.5 3.5 L20.5 9.5 L9 21 L3 21 L3 15 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M12.5 5.5 L18.5 11.5" stroke="currentColor" strokeWidth="1.5" />
      {/* squiggle stroke trailing off the tip, like a drawn line */}
      <path d="M3 21 Q1 19 2.5 17" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
