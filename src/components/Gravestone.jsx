// Pixel-art gravestone SVG, ~56px wide rendered. viewBox 0 0 56 72.
export default function Gravestone() {
  return (
    <svg
      viewBox="0 0 56 72"
      className="w-14"
      aria-label="Gravestone"
    >
      {/* Stone body — base rectangle */}
      <rect x="8"  y="30" width="40" height="38" style={{ fill: 'rgb(var(--c-structure))' }} />
      {/* Rounded top — stacked narrowing rects to pixel-simulate arc */}
      <rect x="10" y="22" width="36" height="10" style={{ fill: 'rgb(var(--c-structure))' }} />
      <rect x="14" y="14" width="28" height="10" style={{ fill: 'rgb(var(--c-structure))' }} />
      <rect x="18" y="8"  width="20" height="8"  style={{ fill: 'rgb(var(--c-structure))' }} />
      <rect x="20" y="4"  width="16" height="6"  style={{ fill: 'rgb(var(--c-dim))' }} />
      {/* Highlight edge */}
      <rect x="8"  y="30" width="2"  height="38" style={{ fill: 'rgb(var(--c-dim))', opacity: 0.5 }} />
      <rect x="10" y="22" width="2"  height="10" style={{ fill: 'rgb(var(--c-dim))', opacity: 0.5 }} />

      {/* R — three dark rect clusters */}
      {/* R vertical stroke */}
      <rect x="16" y="36" width="3" height="14" style={{ fill: 'rgb(var(--c-bg))' }} />
      {/* R top bump */}
      <rect x="19" y="36" width="4" height="2"  style={{ fill: 'rgb(var(--c-bg))' }} />
      <rect x="23" y="38" width="2" height="3"  style={{ fill: 'rgb(var(--c-bg))' }} />
      <rect x="19" y="41" width="4" height="2"  style={{ fill: 'rgb(var(--c-bg))' }} />
      {/* R leg */}
      <rect x="21" y="43" width="4" height="7"  style={{ fill: 'rgb(var(--c-bg))' }} />

      {/* I — single rect */}
      <rect x="27" y="36" width="3" height="14" style={{ fill: 'rgb(var(--c-bg))' }} />

      {/* P */}
      {/* P vertical stroke */}
      <rect x="33" y="36" width="3" height="14" style={{ fill: 'rgb(var(--c-bg))' }} />
      {/* P bump top */}
      <rect x="36" y="36" width="4" height="2"  style={{ fill: 'rgb(var(--c-bg))' }} />
      <rect x="40" y="38" width="2" height="3"  style={{ fill: 'rgb(var(--c-bg))' }} />
      <rect x="36" y="41" width="4" height="2"  style={{ fill: 'rgb(var(--c-bg))' }} />

      {/* Yellow hair pixels draped over top edge — callback to figure's hair */}
      <rect x="18" y="3"  width="3" height="3" style={{ fill: 'rgb(var(--c-cta))', opacity: 0.85 }} />
      <rect x="24" y="1"  width="3" height="3" style={{ fill: 'rgb(var(--c-cta))', opacity: 0.85 }} />
      <rect x="31" y="1"  width="3" height="3" style={{ fill: 'rgb(var(--c-cta))', opacity: 0.85 }} />
      <rect x="37" y="3"  width="3" height="3" style={{ fill: 'rgb(var(--c-cta))', opacity: 0.85 }} />
    </svg>
  )
}
