import { memo, useMemo, useRef } from 'react'
import { cellCenter } from '../lib/arrowsLogic'
import { stripToBoard } from '../lib/arrowsCameraLogic'

// The remaining arrows as thin lines, drawn once per `gone` change; the view
// rectangle is drawn on top and is the only part that moves with the camera.
const Lines = memo(function Lines({ level, gone, cell }) {
  const d = useMemo(
    () => level.arrows
      .map((a, i) => (gone[i] ? '' : `M${a.cells.map((c) => cellCenter(c, cell).join(' ')).join('L')}`))
      .join(''),
    [level, gone, cell],
  )
  return <path d={d} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} vectorEffect="non-scaling-stroke" style={{ stroke: 'rgb(var(--c-p1) / 0.8)' }} />
})

/**
 * Slim overview under a camera board: the whole board small, what is left on
 * it, and the part in view. Press or drag on it to move the view there. It
 * only supplements the board's own drag, zoom and key pan, so it is hidden
 * from assistive tech.
 */
export default function ArrowsOverview({ level, gone, cam, fit, cell, height = 92, onJump }) {
  const ref = useRef(null)
  const jump = (e) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const [x, y] = stripToBoard(fit, r.width, r.height, e.clientX - r.left, e.clientY - r.top)
    onJump(x, y)
  }
  return (
    <svg
      ref={ref}
      viewBox={`${fit.x} ${fit.y} ${fit.w} ${fit.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full rounded border border-retro-border bg-retro-deep cursor-pointer select-none"
      style={{ height, touchAction: 'none' }}
      aria-hidden="true"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); jump(e) }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) jump(e) }}
    >
      <rect x={0} y={0} width={level.cols * cell} height={level.rows * cell} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: 'rgb(var(--c-border))' }} />
      <Lines level={level} gone={gone} cell={cell} />
      <rect x={cam.x} y={cam.y} width={cam.w} height={cam.h} fill="rgb(var(--c-cta) / 0.12)" strokeWidth={2} vectorEffect="non-scaling-stroke" rx={cell * 0.3} style={{ stroke: 'rgb(var(--c-cta))' }} />
    </svg>
  )
}
