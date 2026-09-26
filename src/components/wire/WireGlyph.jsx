// WIRE CROSSED keypad glyphs: 24 original line marks, drawn in currentColor
// so they theme with whatever text colour the button or manual cell uses.
// Ids index GLYPH_PATHS (see GLYPH_COUNT in src/lib/wireLogic.js).

const GLYPH_PATHS = [
  'M12 3v18M5 9h14',
  'M4 20L12 4l8 16M8 13h8',
  'M12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14M12 10v4',
  'M4 12h16M12 4l8 8-8 8',
  'M6 4h12L6 20h12',
  'M4 7c4 0 4 10 8 10s4-10 8-10',
  'M12 3l2.6 5.8 6.4.7-4.8 4.3 1.3 6.2L12 16.9 6.5 20l1.3-6.2L3 9.5l6.4-.7z',
  'M5 5h14v14H5zM5 5l14 14',
  'M12 4v16M6 8l6-4 6 4M6 16l6 4 6-4',
  'M7 4v16M17 4v16M7 12h10',
  'M4 18a8 8 0 0 1 16 0M12 18V6',
  'M6 7l12 12M18 7L6 19M12 2v5',
  'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8M12 12v8M8 17h8',
  'M4 8h16M4 16h16M9 4v16',
  'M18 5a8 8 0 1 0 0 14',
  'M12 3v6M12 15v6M3 12h6M15 12h6',
  'M5 19V5l7 7 7-7v14',
  'M12 4l8 8-8 8-8-8z',
  'M12 4l8 8-8 8-8-8zM9 12h6',
  'M4 6h16M4 12h10M4 18h16',
  'M6 20V9a6 6 0 0 1 12 0v11',
  'M12 3v4M12 17v4M6 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
  'M4 20l8-16 8 16zM12 11v5',
  'M5 12c0-4 3-7 7-7s7 3 7 7-3 7-7 7M12 12h7',
]

export default function WireGlyph({ id, size = 28, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d={GLYPH_PATHS[id] || ''}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
