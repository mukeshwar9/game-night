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
