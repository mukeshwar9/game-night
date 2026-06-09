import { useEffect, useRef } from 'react'

const COLORS = { X: '#00e5ff', O: '#ff4081', draw: '#ffe600' }
const GLOWS  = { X: '0 0 6px #00e5ff', O: '0 0 6px #ff4081', draw: '0 0 6px #ffe600' }

export default function WinEffect({ winner, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800)
    return () => clearTimeout(t)
  }, [onDone])

  const particles = useRef(
    Array.from({ length: 30 }, (_, i) => {
      const angle = (i / 30) * Math.PI * 2
      const dist  = 80 + Math.random() * 140
      return {
        id:    i,
        tx:    Math.cos(angle) * dist,
        ty:    Math.sin(angle) * dist - 40,
        size:  3 + Math.random() * 8,
        delay: Math.random() * 0.25,
        dur:   0.5 + Math.random() * 0.65,
      }
    })
  ).current

  const color = COLORS[winner] ?? COLORS.draw
  const glow  = GLOWS[winner]  ?? GLOWS.draw

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
      {/* brief screen flash */}
      <div
        className="absolute inset-0"
        style={{ background: color, animation: 'win-flash 0.5s ease-out forwards' }}
      />
      {/* pixel particles */}
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            width:  p.size,
            height: p.size,
            background: color,
            boxShadow: glow,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            animation: `pixel-burst ${p.dur}s ease-out ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  )
}
