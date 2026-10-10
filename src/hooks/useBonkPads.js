import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shouldIgnoreGameKey } from '../lib/keyGuard'
import { sounds } from '../lib/sounds'

// Controls for BONK BUGGIES: LEFT and RIGHT buttons per pad, plus the keyboard.
// Both buttons held at once is the hop (when that twist is on), so a pad's
// state is just two flags. Several pads work at once for two people on one
// phone: every button captures its own pointer, so a thumb resting on one pad
// never steals a press from another.
//
//   const pads = useBonkPads({ ids: ['me'] , keys: { me: KEYS_SOLO } })
//   pads.getInput('me')            => { d: -1 | 0 | 1, hop }
//   pads.buttonProps('me', 'l')    => props for the LEFT <button>
//   pads.down('me', 'l')           => is it held right now (for styling)
//
// `keys[id]` = { l: [event.code…], r: [event.code…] }. Key handling ignores
// text fields and Cmd/Ctrl chords (lib/keyGuard.js), as the word games do.

export const KEYS_SOLO = { l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'] }
export const KEYS_P1 = { l: ['KeyA'], r: ['KeyD'] }
export const KEYS_P2 = { l: ['ArrowLeft'], r: ['ArrowRight'] }

export function inputFromHeld(held) {
  const both = !!(held.l && held.r)
  return { d: both ? 0 : held.r ? 1 : held.l ? -1 : 0, hop: both }
}

export function useBonkPads({ ids, keys, enabled = true }) {
  const held = useRef({})
  const [, setTick] = useState(0)
  const idsKey = ids.join('|')
  const keysRef = useRef(keys)
  useEffect(() => { keysRef.current = keys })

  const slot = (id) => (held.current[id] ||= { l: false, r: false })
  const poke = useCallback(() => setTick((n) => n + 1), [])

  const release = useCallback(() => {
    held.current = {}
    poke()
  }, [poke])

  useEffect(() => {
    if (!enabled) { held.current = {}; return undefined }
    const find = (code) => {
      for (const [id, map] of Object.entries(keysRef.current || {})) {
        if (!ids.includes(id)) continue
        if (map.l?.includes(code)) return [id, 'l']
        if (map.r?.includes(code)) return [id, 'r']
      }
      return null
    }
    const down = (e) => {
      const hit = find(e.code)
      if (!hit || shouldIgnoreGameKey(e)) return
      e.preventDefault()
      const s = slot(hit[0])
      if (!s[hit[1]]) { s[hit[1]] = true; sounds.touch(); poke() }
    }
    const up = (e) => {
      const hit = find(e.code)
      if (!hit) return
      const s = slot(hit[0])
      if (s[hit[1]]) { s[hit[1]] = false; poke() }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids is tracked by idsKey; slot/poke are stable
  }, [enabled, idsKey, release])

  // Nothing stays held when controls go away (round over, tab hidden).
  useEffect(() => {
    if (!enabled) return undefined
    const hide = () => { if (document.hidden) release() }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [enabled, release])

  const getInput = useCallback((id) => inputFromHeld(held.current[id] || {}), [])
  const down = useCallback((id, side) => enabled && !!held.current[id]?.[side], [enabled])

  const buttonProps = useCallback((id, side) => {
    const press = (v) => (e) => {
      if (!enabled) return
      e.preventDefault()
      const s = slot(id)
      if (s[side] === v) return
      s[side] = v
      if (v) {
        sounds.touch()
        try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* pointer already gone */ }
      }
      poke()
    }
    return {
      onPointerDown: press(true),
      onPointerUp: press(false),
      onPointerCancel: press(false),
      onLostPointerCapture: press(false),
      onContextMenu: (e) => e.preventDefault(),
    }
  }, [enabled, poke])

  // Stable identity: the one-phone page keeps its game loop keyed on this object.
  return useMemo(() => ({ getInput, buttonProps, down, release }), [getInput, buttonProps, down, release])
}
