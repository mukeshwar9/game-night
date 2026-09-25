/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['var(--font-pixel)', 'system-ui'],
      },
      colors: {
        retro: {
          bg:         'rgb(var(--c-bg) / <alpha-value>)',
          surface:    'rgb(var(--c-surface) / <alpha-value>)',
          card:       'rgb(var(--c-card) / <alpha-value>)',
          border:     'rgb(var(--c-border) / <alpha-value>)',
          text:       'rgb(var(--c-text) / <alpha-value>)',
          dim:        'rgb(var(--c-dim) / <alpha-value>)',
          p1:         'rgb(var(--c-p1) / <alpha-value>)',
          p2:         'rgb(var(--c-p2) / <alpha-value>)',
          p3:         'rgb(var(--c-p3) / <alpha-value>)',
          p4:         'rgb(var(--c-p4) / <alpha-value>)',
          cta:        'rgb(var(--c-cta) / <alpha-value>)',
          win:        'rgb(var(--c-win) / <alpha-value>)',
          danger:     'rgb(var(--c-danger) / <alpha-value>)',
          'tint-p1':  'rgb(var(--c-tint-p1) / <alpha-value>)',
          'tint-p2':  'rgb(var(--c-tint-p2) / <alpha-value>)',
          'tint-p3':  'rgb(var(--c-tint-p3) / <alpha-value>)',
          'tint-p4':  'rgb(var(--c-tint-p4) / <alpha-value>)',
          'tint-cta': 'rgb(var(--c-tint-cta) / <alpha-value>)',
          'tint-danger': 'rgb(var(--c-tint-danger) / <alpha-value>)',
          structure:  'rgb(var(--c-structure) / <alpha-value>)',
          deep:       'rgb(var(--c-deep) / <alpha-value>)',
          av1:        'rgb(var(--c-av1) / <alpha-value>)',
          av2:        'rgb(var(--c-av2) / <alpha-value>)',
          av3:        'rgb(var(--c-av3) / <alpha-value>)',
          av4:        'rgb(var(--c-av4) / <alpha-value>)',
          skin1:      'rgb(var(--c-skin-1) / <alpha-value>)',
          skin2:      'rgb(var(--c-skin-2) / <alpha-value>)',
          skin3:      'rgb(var(--c-skin-3) / <alpha-value>)',
          skin4:      'rgb(var(--c-skin-4) / <alpha-value>)',
          skin5:      'rgb(var(--c-skin-5) / <alpha-value>)',
        },
      },
      // --glow (1 on dark grounds, lower on light ones; see src/index.css)
      // scales every neon and text glow so pale themes don't smudge dark text.
      boxShadow: {
        'neon-p1':  '0 0 8px rgb(var(--c-p1) / var(--glow, 1)), 0 0 24px rgb(var(--c-p1) / calc(0.35 * var(--glow, 1)))',
        'neon-p2':  '0 0 8px rgb(var(--c-p2) / var(--glow, 1)), 0 0 24px rgb(var(--c-p2) / calc(0.35 * var(--glow, 1)))',
        'neon-p3':  '0 0 8px rgb(var(--c-p3) / var(--glow, 1)), 0 0 24px rgb(var(--c-p3) / calc(0.35 * var(--glow, 1)))',
        'neon-p4':  '0 0 8px rgb(var(--c-p4) / var(--glow, 1)), 0 0 24px rgb(var(--c-p4) / calc(0.35 * var(--glow, 1)))',
        'neon-cta': '0 0 8px rgb(var(--c-cta) / var(--glow, 1)), 0 0 24px rgb(var(--c-cta) / calc(0.35 * var(--glow, 1)))',
        'neon-win': '0 0 8px rgb(var(--c-win) / var(--glow, 1)), 0 0 24px rgb(var(--c-win) / calc(0.35 * var(--glow, 1)))',
        'neon-danger': '0 0 8px rgb(var(--c-danger) / var(--glow, 1)), 0 0 24px rgb(var(--c-danger) / calc(0.35 * var(--glow, 1)))',
        'glow-dot': '0 0 4px rgb(var(--c-win) / var(--glow, 1))',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.text-glow-p1':  { textShadow: '0 0 8px rgb(var(--c-p1) / var(--glow, 1)), 0 0 20px rgb(var(--c-p1) / calc(0.5 * var(--glow, 1)))' },
        '.text-glow-p2':  { textShadow: '0 0 8px rgb(var(--c-p2) / var(--glow, 1)), 0 0 20px rgb(var(--c-p2) / calc(0.5 * var(--glow, 1)))' },
        '.text-glow-p3':  { textShadow: '0 0 8px rgb(var(--c-p3) / var(--glow, 1)), 0 0 20px rgb(var(--c-p3) / calc(0.5 * var(--glow, 1)))' },
        '.text-glow-p4':  { textShadow: '0 0 8px rgb(var(--c-p4) / var(--glow, 1)), 0 0 20px rgb(var(--c-p4) / calc(0.5 * var(--glow, 1)))' },
        '.text-glow-cta': { textShadow: '0 0 10px rgb(var(--c-cta) / var(--glow, 1)), 0 0 28px rgb(var(--c-cta) / calc(0.5 * var(--glow, 1)))' },
        '.text-glow-win': { textShadow: '0 0 8px rgb(var(--c-win) / var(--glow, 1)), 0 0 20px rgb(var(--c-win) / calc(0.5 * var(--glow, 1)))' },
        '.text-glow-danger': { textShadow: '0 0 8px rgb(var(--c-danger) / var(--glow, 1)), 0 0 20px rgb(var(--c-danger) / calc(0.5 * var(--glow, 1)))' },
        '.no-scrollbar': {
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        '.scanline': {
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: '0',
            background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)',
            pointerEvents: 'none',
          },
        },
      })
    },
  ],
}

// theme tokens live in src/index.css (--c-*); see CLAUDE.md
