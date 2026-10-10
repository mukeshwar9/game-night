import { useCallback, useEffect, useRef } from 'react'
import { COURT_W, COURT_H, PUCK_R, clampHold, flingVelocity, sideOf } from '../lib/puckrushLogic'

// Pointer controls for Puck Rush: press a puck on your half, pull it back, let
// go. One pointer per side, so two people can play one phone from opposite ends.
//
//   getInput(side) => { hold: { i, x, y } | null, f: [{ q, i, x, y, vx, vy }] }
//   getAim(side)   => { i, from, to } | null    (what to draw while pulling)
//
// `f` keeps the last few flings and is sent again every frame: the sim applies
// each sequence number once, so a dropped packet costs nothing. `flip` is true
// when the table is drawn upside down (the guest sees their own half nearest).
const GRAB_R = PUCK_R * 2.6
const KEEP = 3

export function usePuckrushControls(tableRef, { sides, flip = false, getPucks, enabled = true }) {
  const drags = useRef({ X: null, O: null })
  const flings = useRef({ X: [], O: [] })
  const seq = useRef(0)
  const sidesKey = sides.join('')
  const pucksRef = useRef(getPucks)
  useEffect(() => { pucksRef.current = getPucks })

  const reset = useCallback(() => {
    drags.current = { X: null, O: null }
    flings.current = { X: [], O: [] }
  }, [])

  useEffect(() => {
    const el = tableRef.current
    reset()
    if (!el || !enabled) return
    const allowed = sidesKey.split('')
    const toCourt = (e) => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return null
      const x = ((e.clientX - rect.left) / rect.width) * COURT_W
      const y = ((e.clientY - rect.top) / rect.height) * COURT_H
      return flip ? { x: COURT_W - x, y: COURT_H - y } : { x, y }
    }
    const down = (e) => {
      // Overlay buttons inside the table (RETRY / WAIT / CLAIM WIN) keep their clicks.
      if (e.target?.closest?.('button, a, input')) return
      const at = toCourt(e)
      if (!at) return
      const side = sideOf(at.y)
      if (!allowed.includes(side) || drags.current[side]) return
      let best = -1
      let bd = GRAB_R
      ;(pucksRef.current?.() || []).forEach((p, i) => {
        if (sideOf(p.y) !== side) return
        const d = Math.hypot(p.x - at.x, p.y - at.y)
        if (d < bd) { bd = d; best = i }
      })
      if (best < 0) return
      e.preventDefault()
      const p = pucksRef.current()[best]
      drags.current[side] = { id: e.pointerId, i: best, from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y } }
      el.setPointerCapture?.(e.pointerId)
    }
    const find = (e) => allowed.find((s) => drags.current[s]?.id === e.pointerId)
    const move = (e) => {
      const side = find(e)
      const at = side && toCourt(e)
      if (at) drags.current[side].to = clampHold(side, at.x, at.y)
    }
    const up = (e) => {
      const side = find(e)
      if (!side) return
      const d = drags.current[side]
      drags.current[side] = null
      const v = flingVelocity(d.from, d.to)
      seq.current += 1
      // A pull too short to launch still counts as a numbered let-go, so the
      // puck is dropped where the finger left it.
      flings.current[side] = [...flings.current[side], { q: seq.current, i: d.i, x: d.to.x, y: d.to.y, vx: v.vx, vy: v.vy }].slice(-KEEP)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [tableRef, enabled, flip, sidesKey, reset])

  const getInput = useCallback((side) => {
    const d = drags.current[side]
    return { hold: d ? { i: d.i, x: d.to.x, y: d.to.y } : null, f: flings.current[side] }
  }, [])
  const getAim = useCallback((side) => {
    const d = drags.current[side]
    return d ? { i: d.i, from: d.from, to: d.to } : null
  }, [])

  return { getInput, getAim, reset }
}
