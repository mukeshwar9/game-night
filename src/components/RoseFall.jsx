import { useState } from 'react'

const ROSE_COUNT = 14

function makeRoses() {
  return Array.from({ length: ROSE_COUNT }, (_, i) => ({
    id: i,
    left: 4 + Math.random() * 92,
    rx: (Math.random() - 0.5) * 80,
    dur: 4 + Math.random() * 3,
    delay: -(Math.random() * 6),
    size: 5 + Math.floor(Math.random() * 4),
  }))
}

export default function RoseFall() {
  const [roses] = useState(makeRoses)

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {roses.map(r => (
        <div
          key={r.id}
          style={{
            position: 'absolute',
            top: 0,
            left: `${r.left}%`,
            '--rx': `${r.rx}px`,
            animation: `rose-fall ${r.dur}s linear ${r.delay}s infinite`,
          }}
        >
          {/* Pixel rose: pink square body with yellow accent pixel */}
          <div style={{ position: 'relative', width: r.size, height: r.size }}>
            <div style={{
              width: r.size,
              height: r.size,
              background: '#ff4081',
              boxShadow: '0 0 4px #ff4081',
            }} />
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 2,
              height: 2,
              background: '#ffe600',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}
