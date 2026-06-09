// Pixel-art gravestone SVG, ~56px wide rendered. viewBox 0 0 56 72.
export default function Gravestone() {
  return (
    <svg
      viewBox="0 0 56 72"
      className="w-14"
      aria-label="Gravestone"
    >
      {/* Stone body — base rectangle */}
      <rect x="8"  y="30" width="40" height="38" fill="#2a2a50" />
      {/* Rounded top — stacked narrowing rects to pixel-simulate arc */}
      <rect x="10" y="22" width="36" height="10" fill="#2a2a50" />
      <rect x="14" y="14" width="28" height="10" fill="#2a2a50" />
      <rect x="18" y="8"  width="20" height="8"  fill="#2a2a50" />
      <rect x="20" y="4"  width="16" height="6"  fill="#5a5a8a" />
      {/* Highlight edge */}
      <rect x="8"  y="30" width="2"  height="38" fill="#5a5a8a" opacity="0.5" />
      <rect x="10" y="22" width="2"  height="10" fill="#5a5a8a" opacity="0.5" />

      {/* R — three dark rect clusters */}
      {/* R vertical stroke */}
      <rect x="16" y="36" width="3" height="14" fill="#080810" />
      {/* R top bump */}
      <rect x="19" y="36" width="4" height="2"  fill="#080810" />
      <rect x="23" y="38" width="2" height="3"  fill="#080810" />
      <rect x="19" y="41" width="4" height="2"  fill="#080810" />
      {/* R leg */}
      <rect x="21" y="43" width="4" height="7"  fill="#080810" />

      {/* I — single rect */}
      <rect x="27" y="36" width="3" height="14" fill="#080810" />

      {/* P */}
      {/* P vertical stroke */}
      <rect x="33" y="36" width="3" height="14" fill="#080810" />
      {/* P bump top */}
      <rect x="36" y="36" width="4" height="2"  fill="#080810" />
      <rect x="40" y="38" width="2" height="3"  fill="#080810" />
      <rect x="36" y="41" width="4" height="2"  fill="#080810" />

      {/* Yellow hair pixels draped over top edge — callback to figure's hair */}
      <rect x="18" y="3"  width="3" height="3" fill="#ffe600" opacity="0.85" />
      <rect x="24" y="1"  width="3" height="3" fill="#ffe600" opacity="0.85" />
      <rect x="31" y="1"  width="3" height="3" fill="#ffe600" opacity="0.85" />
      <rect x="37" y="3"  width="3" height="3" fill="#ffe600" opacity="0.85" />
    </svg>
  )
}
