import { useId } from 'react'
import { COURSE_W, COURSE_H } from '../lib/minigolfCourses'
import { BALL_R, CUP_R, moverGeometry } from '../lib/minigolfPhysics'
import { SEAT_GLYPHS, seatColor } from '../lib/minigolfUi'

// Top-down SVG render of one Minigolf hole — rendering only; the sim lives in
// minigolfPhysics.js. Every colour comes from the --c-* theme tokens (SVG
// presentation attributes can't hold var(), so fills go through `style`).
//
// World space is 360×600. In landscape the world group rotates −90° so the
// hole's long axis stays long; `worldRef` points at that group, so pointer
// input mapped through its getScreenCTM() lands in world units either way.

const c = (token, alpha = 1) => `rgb(var(--c-${token}) / ${alpha})`

function polyPoints(poly) {
  return poly.map(([x, y]) => `${x},${y}`).join(' ')
}

function Zone({ z, sandId }) {
  const [x, y, w, h] = z.r
  if (z.t === 'sand') {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} style={{ fill: c('cta', 0.26) }} />
        <rect x={x} y={y} width={w} height={h} style={{ fill: `url(#${sandId})` }} />
      </g>
    )
  }
  if (z.t === 'water') {
    const waves = []
    for (let yy = y + 14; yy < y + h - 4; yy += 16) {
      let d = `M${x + 4} ${yy}`
      for (let xx = x + 4; xx < x + w - 8; xx += 16) d += ` q4 -4 8 0 t8 0`
      waves.push(<path key={yy} d={d} className="minigolf-wave" style={{ fill: 'none', stroke: c('p1', 0.55), strokeWidth: 1.5 }} />)
    }
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} style={{ fill: c('p1', 0.24) }} />
        {waves}
      </g>
    )
  }
  // slope: chevrons point downhill (the way it pushes the ball)
  const dir = Math.sign(z.ay || 0) || 1
  const chevrons = []
  for (let yy = y + 18; yy < y + h - 6; yy += 26) {
    for (let xx = x + 22; xx < x + w; xx += 34) {
      chevrons.push(`M${xx - 8} ${yy - 5 * dir} L${xx} ${yy + 3 * dir} L${xx + 8} ${yy - 5 * dir}`)
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} style={{ fill: c('dim', 0.14) }} />
      <path d={chevrons.join(' ')} style={{ fill: 'none', stroke: c('dim', 0.7), strokeWidth: 2 }} />
    </g>
  )
}

export function GolfBall({ x, y, seat, dim = false, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} style={{ opacity: dim ? 0.3 : 1 }}>
      <circle r={BALL_R} style={{ fill: seatColor(seat), stroke: c('bg'), strokeWidth: 2 }} />
      <text y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={7} style={{ fill: c('bg'), fontFamily: 'sans-serif' }} aria-hidden="true">
        {SEAT_GLYPHS[seat % 4]}
      </text>
    </g>
  )
}

export default function MinigolfCourse({
  hole, t = 0, balls = [], aim = null, trail = null, flashBumper = -1, burst = null,
  worldRef, landscape = false, className = '', label,
}) {
  const uid = useId().replace(/:/g, '')
  const clipId = `mg-clip-${uid}`
  const sandId = `mg-sand-${uid}`
  const vbW = landscape ? COURSE_H : COURSE_W
  const vbH = landscape ? COURSE_W : COURSE_H
  const worldTransform = landscape ? `translate(0 ${COURSE_W}) rotate(-90)` : undefined

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={className}
      role="img"
      aria-label={label ?? `${hole.name}, par ${hole.par}`}
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <defs>
        <clipPath id={clipId}>
          {hole.bounds.map((p, i) => <polygon key={i} points={polyPoints(p)} />)}
        </clipPath>
        <pattern id={sandId} width="9" height="9" patternUnits="userSpaceOnUse">
          <rect x="3" y="3" width="1.5" height="1.5" style={{ fill: c('cta', 0.6) }} />
        </pattern>
      </defs>
      <g ref={worldRef} transform={worldTransform}>
        {/* fairway with mowing stripes */}
        {hole.bounds.map((p, i) => (
          <polygon key={`f${i}`} points={polyPoints(p)} style={{ fill: c('card') }} />
        ))}
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width={COURSE_W} height={COURSE_H} style={{ fill: c('win', 0.1) }} />
          {Array.from({ length: COURSE_H / 60 }, (_, i) => (
            <rect key={i} x="0" y={i * 60} width={COURSE_W} height="30" style={{ fill: c('win', 0.05) }} />
          ))}
        </g>
        {(hole.zones || []).map((z, i) => <Zone key={`z${i}`} z={z} sandId={sandId} />)}
        {/* tee mat */}
        <rect x={hole.tee[0] - 16} y={hole.tee[1] - 10} width="32" height="20" rx="2" style={{ fill: c('text', 0.12) }} />
        {(hole.portals || []).map((pt, i) => (
          <g key={`p${i}`}>
            <circle cx={pt.a[0]} cy={pt.a[1]} r="12" className="minigolf-portal" style={{ fill: c('win', 0.12), stroke: c('win'), strokeWidth: 3 }} />
            <circle cx={pt.b[0]} cy={pt.b[1]} r="12" style={{ fill: 'none', stroke: c('win', 0.8), strokeWidth: 2, strokeDasharray: '3 3' }} />
          </g>
        ))}
        {/* cup and flag */}
        <circle cx={hole.cup[0]} cy={hole.cup[1]} r={CUP_R} style={{ fill: c('bg'), stroke: c('text', 0.5), strokeWidth: 1.5 }} />
        <line x1={hole.cup[0]} y1={hole.cup[1]} x2={hole.cup[0]} y2={hole.cup[1] - 34} style={{ stroke: c('text'), strokeWidth: 1.5 }} />
        <path d={`M${hole.cup[0]} ${hole.cup[1] - 34} l16 6 l-16 6 z`} style={{ fill: c('cta') }} />
        {/* walls: thick structure with a neon edge */}
        {hole.bounds.map((p, i) => (
          <g key={`w${i}`}>
            <polygon points={polyPoints(p)} style={{ fill: 'none', stroke: c('structure'), strokeWidth: 7, strokeLinejoin: 'round' }} />
            <polygon points={polyPoints(p)} style={{ fill: 'none', stroke: c('text', 0.8), strokeWidth: 1.6, strokeLinejoin: 'round' }} />
          </g>
        ))}
        {(hole.blocks || []).map((p, i) => (
          <polygon key={`b${i}`} points={polyPoints(p)} style={{ fill: c('structure'), stroke: c('text', 0.8), strokeWidth: 1.6 }} />
        ))}
        {(hole.bumpers || []).map(([x, y, r], i) => (
          <g key={`bp${i}`} transform={`translate(${x} ${y}) scale(${flashBumper === i ? 1.15 : 1})`}>
            <circle r={r} style={{ fill: c('p3', flashBumper === i ? 0.55 : 0.25), stroke: c('p3'), strokeWidth: 3 }} />
            <circle r={r * 0.45} style={{ fill: 'none', stroke: c('p3'), strokeWidth: 2 }} />
          </g>
        ))}
        {(hole.movers || []).map((m, i) => {
          const g = moverGeometry(m, t)
          if (m.t === 'mill') {
            return (
              <g key={`m${i}`}>
                {g.map(({ seg }, j) => (
                  <line key={j} x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} style={{ stroke: c('p4'), strokeWidth: 6, strokeLinecap: 'round' }} />
                ))}
                <circle cx={m.x} cy={m.y} r="5" style={{ fill: c('bg'), stroke: c('p4'), strokeWidth: 2 }} />
              </g>
            )
          }
          const s = g[0].seg
          return <rect key={`m${i}`} x={s[0]} y={s[1]} width={m.w} height={m.h} style={{ fill: c('danger', 0.45), stroke: c('danger'), strokeWidth: 2 }} />
        })}
        {trail && trail.map((pt, i) => (
          <circle key={`t${i}`} cx={pt.x} cy={pt.y} r={BALL_R * 0.7} style={{ fill: seatColor(pt.seat, (i / trail.length) * 0.4) }} />
        ))}
        {aim && <AimLine aim={aim} />}
        {balls.map((b) => <GolfBall key={b.key} x={b.x} y={b.y} seat={b.seat} dim={b.dim} scale={b.scale ?? 1} />)}
        {burst && (
          <g key={burst.key} transform={`translate(${burst.x} ${burst.y})`}>
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2
              return (
                <rect
                  key={i} x="-2" y="-2" width="4" height="4" className="minigolf-burst"
                  style={{ fill: seatColor(burst.seat), '--tx': `${Math.cos(a) * 46}px`, '--ty': `${Math.sin(a) * 46}px` }}
                />
              )
            })}
          </g>
        )}
      </g>
    </svg>
  )
}

function AimLine({ aim }) {
  const { x, y, angle, power, length } = aim
  const dx = Math.cos(angle), dy = Math.sin(angle)
  const strong = power > 0.85
  const col = strong ? c('danger') : c('cta')
  const circ = 2 * Math.PI * (BALL_R + 6)
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line
        x1={x + dx * 10} y1={y + dy * 10} x2={x + dx * length} y2={y + dy * length}
        style={{ stroke: col, strokeWidth: 3, strokeLinecap: 'round', strokeDasharray: '1 8' }}
      />
      <circle cx={x + dx * length} cy={y + dy * length} r="3.5" style={{ fill: col }} />
      <circle
        cx={x} cy={y} r={BALL_R + 6} transform={`rotate(-90 ${x} ${y})`}
        style={{ fill: 'none', stroke: col, strokeWidth: 2.5, strokeDasharray: `${circ * power} ${circ}` }}
      />
    </g>
  )
}
