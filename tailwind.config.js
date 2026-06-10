/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'system-ui'],
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
          cta:        'rgb(var(--c-cta) / <alpha-value>)',
          win:        'rgb(var(--c-win) / <alpha-value>)',
          'tint-p1':  'rgb(var(--c-tint-p1) / <alpha-value>)',
          'tint-p2':  'rgb(var(--c-tint-p2) / <alpha-value>)',
          'tint-cta': 'rgb(var(--c-tint-cta) / <alpha-value>)',
          structure:  'rgb(var(--c-structure) / <alpha-value>)',
          deep:       'rgb(var(--c-deep) / <alpha-value>)',
        },
      },
      boxShadow: {
        'neon-p1':  '0 0 8px rgb(var(--c-p1)), 0 0 24px rgb(var(--c-p1) / 0.35)',
        'neon-p2':  '0 0 8px rgb(var(--c-p2)), 0 0 24px rgb(var(--c-p2) / 0.35)',
        'neon-cta': '0 0 8px rgb(var(--c-cta)), 0 0 24px rgb(var(--c-cta) / 0.35)',
        'neon-win': '0 0 8px rgb(var(--c-win)), 0 0 24px rgb(var(--c-win) / 0.35)',
        'glow-dot': '0 0 4px rgb(var(--c-win))',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        blink: 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.text-glow-p1':  { textShadow: '0 0 8px rgb(var(--c-p1)), 0 0 20px rgb(var(--c-p1) / 0.5)' },
        '.text-glow-p2':  { textShadow: '0 0 8px rgb(var(--c-p2)), 0 0 20px rgb(var(--c-p2) / 0.5)' },
        '.text-glow-cta': { textShadow: '0 0 10px rgb(var(--c-cta)), 0 0 28px rgb(var(--c-cta) / 0.5)' },
        '.text-glow-win': { textShadow: '0 0 8px rgb(var(--c-win)), 0 0 20px rgb(var(--c-win) / 0.5)' },
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
