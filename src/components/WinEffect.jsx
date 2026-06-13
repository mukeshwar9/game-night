import { useEffect, useRef } from 'react'

const COLORS = { X: 'rgb(var(--c-p1))', O: 'rgb(var(--c-p2))', draw: 'rgb(var(--c-cta))' }
const GLOWS  = { X: '0 0 6px rgb(var(--c-p1))', O: '0 0 6px rgb(var(--c-p2))', draw: '0 0 6px rgb(var(--c-cta))' }
// Multi-colour confetti palette for the match-win climax
const CONFETTI = ['rgb(var(--c-p1))', 'rgb(var(--c-p2))', 'rgb(var(--c-cta))', 'rgb(var(--c-win))']

export default function WinEffect({ winner, onDone, intensity = 'round' }) {
  const isMatch = intensity === 'match'

  useEffect(() => {
    const t = setTimeout(onDone, isMatch ? 2600 : 1800)
    return () => clearTimeout(t)
  }, [onDone, isMatch])

  const color = COLORS[winner] ?? COLORS.draw
  const glow  = GLOWS[winner]  ?? GLOWS.draw

  const particles = useRef(
    Array.from({ length: isMatch ? 64 : 30 }, (_, i, arr) => {
      const count = arr.length
      const angle = (i / count) * Math.PI * 2
      const dist  = (isMatch ? 110 : 80) + Math.random() * (isMatch ? 220 : 140)
      return {
        id:    i,
        tx:    Math.cos(angle) * dist,
        ty:    Math.sin(angle) * dist - 40,
        size:  3 + Math.random() * (isMatch ? 11 : 8),
        delay: Math.random() * (isMatch ? 0.4 : 0.25),
        dur:   (isMatch ? 0.7 : 0.5) + Math.random() * 0.7,
        // match: rainbow confetti; round: winner's colour
        color: isMatch ? CONFETTI[i % CONFETTI.length] : color,
      }
    })
  ).current

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
      {/* brief screen flash — stronger + longer on a match clinch */}
      <div
        className="absolute inset-0"
        style={{ background: color, animation: `win-flash ${isMatch ? '0.7s' : '0.5s'} ease-out forwards` }}
      />
      {/* pixel particles */}
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            width:  p.size,
            height: p.size,
            background: p.color,
            boxShadow: isMatch ? `0 0 6px ${p.color}` : glow,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            animation: `pixel-burst ${p.dur}s ease-out ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  )
}
