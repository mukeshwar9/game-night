import { useCallback, useEffect, useRef } from 'react'
import { TABLE_W, TABLE_H } from '../lib/stickyLogic'

// Pointer controls for Sticky Fingers: every finger on the table is one hand.
//
//   getInput(player) => { hands: [{ x, y } | null, ...] }   (table units)
//   getMine()        => { [player * 2 + slot]: { x, y } }   fingers right now
//   twoHandsSeen()   => true once one player has had two fingers down together
//
// `players` lists the seats this device controls. With one seat every touch is
// theirs (solo, or your own end of an online table). With several seats (one
// phone) a touch belongs to the player whose safe is nearest where it lands;
// the hand may then travel anywhere inside its reach. `flip` is true when the
// table is drawn turned around (the guest sees their own safe nearest).

export function useStickyControls(tableRef, { players, getScene, flip = false, enabled = true }) {
  const drags = useRef({})                 // 'p:k' → { id, x, y }
  const two = useRef(false)
  const playersKey = players.join(',')
  const sceneRef = useRef(getScene)
  useEffect(() => { sceneRef.current = getScene })

  const reset = useCallback(() => { drags.current = {}; two.current = false }, [])

  useEffect(() => {
    const el = tableRef.current
    reset()
    if (!el || !enabled) return undefined
    const seats = playersKey ? playersKey.split(',').map(Number) : []
    const toTable = (e) => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return null
      const x = ((e.clientX - rect.left) / rect.width) * TABLE_W
      const y = ((e.clientY - rect.top) / rect.height) * TABLE_H
      return flip ? { x: TABLE_W - x, y: TABLE_H - y } : { x, y }
    }
    const down = (e) => {
      if (e.target?.closest?.('button, a, input')) return
      const scene = sceneRef.current()
      const q = toTable(e)
      if (!scene || !q) return
      let owner = seats[0]
      if (seats.length > 1) {
        let best = Infinity
        for (const i of seats) {
          const p = scene.players[i]
          if (!p) continue
          const d = Math.hypot(q.x - p.safe.x, q.y - p.safe.y)
          if (d < best) { best = d; owner = i }
        }
      }
      const p = scene.players[owner]
      if (!p) return
      let slot = -1
      let bd = Infinity
      p.hands.forEach((h, k) => {
        if (drags.current[`${owner}:${k}`]) return
        const d = Math.hypot(h.x - q.x, h.y - q.y)
        if (d < bd) { bd = d; slot = k }
      })
      if (slot < 0) return
      e.preventDefault()
      drags.current[`${owner}:${slot}`] = { id: e.pointerId, x: q.x, y: q.y }
      if (p.hands.length > 1 && p.hands.every((_, k) => drags.current[`${owner}:${k}`])) two.current = true
      try { el.setPointerCapture?.(e.pointerId) } catch { /* capture is a nicety: the pointer may already be gone */ }
    }
    const find = (e) => Object.keys(drags.current).find((k) => drags.current[k].id === e.pointerId)
    const move = (e) => {
      const k = find(e)
      const q = k && toTable(e)
      if (q) { drags.current[k].x = q.x; drags.current[k].y = q.y }
    }
    const up = (e) => {
      const k = find(e)
      if (k) delete drags.current[k]
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('lostpointercapture', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('lostpointercapture', up)
    }
  }, [tableRef, enabled, flip, playersKey, reset])

  const getInput = useCallback((player, per = 2) => {
    const hands = []
    for (let k = 0; k < per; k++) {
      const d = drags.current[`${player}:${k}`]
      hands.push(d ? { x: d.x, y: d.y } : null)
    }
    return { hands }
  }, [])

  const getMine = useCallback(() => {
    const out = {}
    for (const [key, d] of Object.entries(drags.current)) {
      const [p, k] = key.split(':').map(Number)
      out[p * 2 + k] = { x: d.x, y: d.y }
    }
    return out
  }, [])

  const twoHandsSeen = useCallback(() => two.current, [])

  return { getInput, getMine, twoHandsSeen, reset }
}
