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
          bg:      '#080810',
          surface: '#0f0f1a',
          card:    '#131328',
          border:  '#1e1e3a',
          text:    '#e0e0ff',
          dim:     '#5a5a8a',
          cyan:    '#00e5ff',
          pink:    '#ff4081',
          yellow:  '#ffe600',
          green:   '#39ff14',
        },
      },
      boxShadow: {
        'neon-cyan':   '0 0 8px #00e5ff, 0 0 24px rgba(0,229,255,0.35)',
        'neon-pink':   '0 0 8px #ff4081, 0 0 24px rgba(255,64,129,0.35)',
        'neon-yellow': '0 0 8px #ffe600, 0 0 24px rgba(255,230,0,0.35)',
        'neon-green':  '0 0 8px #39ff14, 0 0 24px rgba(57,255,20,0.35)',
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
        '.text-glow-cyan':   { textShadow: '0 0 8px #00e5ff, 0 0 20px rgba(0,229,255,0.5)' },
        '.text-glow-pink':   { textShadow: '0 0 8px #ff4081, 0 0 20px rgba(255,64,129,0.5)' },
        '.text-glow-yellow': { textShadow: '0 0 10px #ffe600, 0 0 28px rgba(255,230,0,0.5)' },
        '.text-glow-green':  { textShadow: '0 0 8px #39ff14, 0 0 20px rgba(57,255,20,0.5)' },
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
