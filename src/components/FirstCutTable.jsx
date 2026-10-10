import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import FirstCutSprites, { CutFace, ItemSprite, Katana } from './FirstCutSprites'
import { createFx, readPalette } from '../lib/firstCutFx'
import { itemDef } from '../lib/firstCutLogic'
import { SEAT_KEYS, SEAT_LAYOUTS } from '../lib/firstCutLayout'
import { isReducedMotion } from '../hooks/useMotionPref'
import { cn } from '@/lib/utils'
import './FirstCutTable.css'

// The First Cut table: a plate in the middle, one big pad and one katana per
// player round the edge. Rendering only: the page owns the clock and the rules
// (firstCutLogic.js) and hands this component what to show.
//
// Geometry: pads sit on the screen edges (two players: one end each; three:
// two below, one above; four: half an edge each). A katana's grip sits beside
// the plate and its blade rests raised; `a` is the angle the whole katana is
// turned about the plate. Top-edge pads are drawn rotated so the score faces
// its owner.

function halfClip(ang, side) {
  const d = [Math.cos(ang), Math.sin(ang)]
  const n = [-Math.sin(ang) * side, Math.cos(ang) * side]
  const P = (x, y) => `${(50 + x * d[0] + y * n[0]).toFixed(1)}% ${(50 + x * d[1] + y * n[1]).toFixed(1)}%`
  return `polygon(${P(-150, 0)}, ${P(150, 0)}, ${P(150, 150)}, ${P(-150, 150)})`
}

/**
 * @typedef {object} TableSeat
 * @property {string} id
 * @property {number} slot         0..3, which theme player colour
 * @property {string} name
 * @property {boolean} [bot]
 * @property {number} score
 * @property {'ready' | 'stopped' | 'drawing'} phase
 * @property {'idle' | 'cut' | 'stop'} act     the last thing the katana did
 * @property {number} n            counts acts, so a repeat replays its animation
 * @property {number} [nope]       counts rejected taps (a shake)
 * @property {number} [bump]       counts score changes (a pop)
 * @property {number} [drawMs]     how long the slow lift back takes
 */

const FirstCutTable = forwardRef(function FirstCutTable({
  layout = 2, seats, entry, cut, thud, splash, rule, ruleFlash = 0, shake, floats = [], ghost = null,
  onTap, keys = true, short = false, label, children,
}, ref) {
  const arenaRef = useRef(null)
  const canvasRef = useRef(null)
  const fxRef = useRef(null)
  const [down, setDown] = useState(-1)
  const seatGeo = SEAT_LAYOUTS[layout] ?? SEAT_LAYOUTS[2]

  useEffect(() => {
    const canvas = canvasRef.current
    const arena = arenaRef.current
    if (!canvas || !arena) return undefined
    const fx = createFx(canvas, { reduced: isReducedMotion, palette: readPalette(arena) })
    fxRef.current = fx
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fx.resize()) : null
    ro?.observe(arena)
    // A canvas cannot read CSS variables: read the tokens again when the theme changes.
    const mo = new MutationObserver(() => fx.setPalette(readPalette(arena)))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { ro?.disconnect(); mo.disconnect(); fx.destroy(); fxRef.current = null }
  }, [])

  useImperativeHandle(ref, () => ({
    /** Effects the page triggers when something lands. All are no-ops before mount. */
    fx: {
      juice: (color, ang, gold) => fxRef.current?.juice(color, ang, gold),
      sparks: (x, y, ang) => fxRef.current?.sparks(x, y, ang),
      dust: () => fxRef.current?.dust(),
      confetti: (color, count) => fxRef.current?.confetti(color, count),
      clear: () => fxRef.current?.clear(),
      /** Where a katana at angle `a` meets the rim of the plate, for the block sparks. */
      contact: (a) => fxRef.current?.local(a, 0.4, 13) ?? [0, 0],
    },
  }), [])

  const item = entry?.kind === 'item' ? entry : null
  const def = item ? itemDef(item.id) : null
  const clipL = useMemo(() => (cut ? halfClip(cut.ang, 1) : null), [cut])
  const clipR = useMemo(() => (cut ? halfClip(cut.ang, -1) : null), [cut])

  const press = (i, e) => {
    e.preventDefault()
    setDown(i)
    setTimeout(() => setDown(d => (d === i ? -1 : d)), 90)
    onTap?.(i, e.timeStamp)
  }

  const shakeClass = shake?.n
    ? shake.small ? (shake.n % 2 ? 'fc-shake-sa' : 'fc-shake-sb') : (shake.n % 2 ? 'fc-shake-a' : 'fc-shake-b')
    : ''
  const thudNow = thud && item && thud.k === item.i ? thud.n : 0

  return (
    <div ref={arenaRef} className={cn('fc-arena', short && 'fc-short', shakeClass)} role="group" aria-label={label ?? 'First Cut table'}>
      <FirstCutSprites />
      <svg className="fc-wood" viewBox="0 0 100 172" preserveAspectRatio="none" aria-hidden="true">
        <filter id="fc-f-wood" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1 0.018" numOctaves="4" seed="11" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.78" result="n" />
          <feFlood style={{ floodColor: 'rgb(var(--c-text))' }} />
          <feComposite in2="n" operator="in" />
        </filter>
        <rect width="100" height="172" filter="url(#fc-f-wood)" opacity=".1" />
        <g style={{ stroke: 'rgb(var(--c-border))' }} strokeWidth=".5"><path d="M33.3 0 V172 M66.6 0 V172" /></g>
      </svg>
      <div className="fc-light" />

      <div className="fc-plate">
        {splash && (
          <div key={splash.n} className="fc-splat" style={{ '--sc': splash.color.join(' '), '--sr': `${splash.rot}deg` }} />
        )}
        {item && (
          <div
            key={item.i}
            className={cn('fc-item', item.gold && 'fc-gold', thudNow ? (thudNow % 2 ? 'fc-thud-a' : 'fc-thud-b') : '')}
            data-item={item.id}
            data-index={item.i}
            data-kind={item.hit ? 'fruit' : item.rotten ? 'rotten' : 'twin'}
          >
            <div className="fc-ishadow" />
            {!cut && (
              <div className="fc-ibody">
                <ItemSprite id={item.id} />
                {item.rotten && <svg viewBox="0 0 100 100" aria-hidden="true"><use href="#fc-fx-rot" /></svg>}
                {item.gold && <svg viewBox="0 0 100 100" aria-hidden="true"><use href="#fc-fx-gold" /></svg>}
              </div>
            )}
            {cut && def?.fruit && (
              <>
                <div className="fc-half fc-l" style={{ clipPath: clipL, '--nx': (-Math.sin(cut.ang)).toFixed(3), '--ny': Math.cos(cut.ang).toFixed(3) }}><CutFace id={item.id} /></div>
                <div className="fc-half fc-r" style={{ clipPath: clipR, '--nx': (-Math.sin(cut.ang)).toFixed(3), '--ny': Math.cos(cut.ang).toFixed(3) }}><CutFace id={item.id} /></div>
                <div className="fc-flash" />
              </>
            )}
          </div>
        )}
        {entry?.kind === 'beat' && (
          <div key={entry.i} className="fc-beat">NEW CARD<br />{rule?.label}</div>
        )}
      </div>

      <canvas ref={canvasRef} className="fc-fx" aria-hidden="true" />
      <div className="fc-crt" />

      {rule && (
        <>
          <div className={cn('fc-rule fc-a', ruleFlash && (ruleFlash % 2 ? 'fc-flash-a' : 'fc-flash-b'))} aria-live="polite">CUT: {rule.label}</div>
          <div className={cn('fc-rule fc-b', ruleFlash && (ruleFlash % 2 ? 'fc-flash-a' : 'fc-flash-b'))} aria-hidden="true">CUT: {rule.label}</div>
        </>
      )}

      {seats.map((s, i) => {
        const geo = seatGeo[i]
        if (!geo) return null
        const stuck = s.act === 'stop' && s.phase !== 'ready'
        return (
          <div
            key={`k-${s.id}`}
            className="fc-kwrap"
            style={{ '--a': `${geo.a}deg`, '--pc': `var(--c-p${s.slot + 1})`, '--kd': `${-i * 900}ms` }}
          >
            {s.act === 'cut' && <div key={`t${s.n}`} className="fc-trail fc-go" />}
            <div key={`h${s.act === 'stop' ? s.n : 0}`} className={cn('fc-khold', stuck && s.phase === 'stopped' && 'fc-tremble')}>
              <Katana
                key={`${s.act}-${s.n}`}
                className={cn('fc-katana', s.act === 'cut' && 'fc-cut', stuck && 'fc-stuck', stuck && s.phase === 'drawing' && 'fc-draw')}
                style={s.drawMs ? { '--draw': `${s.drawMs}ms` } : undefined}
              />
            </div>
            {s.act === 'stop' && (
              <svg key={`s${s.n}`} className="fc-spark fc-go" viewBox="0 0 100 100" aria-hidden="true"><use href="#fc-fx-spark" /></svg>
            )}
          </div>
        )
      })}

      {ghost && (
        <div className="fc-kwrap" style={{ '--a': '270deg', '--pc': `var(--c-p${ghost.slot + 1})`, '--kd': '-1800ms' }}>
          {ghost.n > 0 && <div key={`gt${ghost.n}`} className="fc-trail fc-go" />}
          <div className="fc-khold">
            <Katana key={`g${ghost.n}`} className={cn('fc-katana', ghost.n > 0 && 'fc-cut')} />
          </div>
        </div>
      )}

      <div className="fc-pads">
        {seats.map((s, i) => {
          const geo = seatGeo[i]
          if (!geo) return null
          const blocked = s.phase !== 'ready'
          return (
            <button
              key={s.id}
              type="button"
              data-seat={i}
              data-phase={s.phase}
              aria-label={`${s.name}: cut. Score ${s.score}.${blocked ? ' Blocked.' : ''}`}
              className={cn(
                'fc-pad', geo.top && 'fc-top', down === i && 'fc-down', blocked && 'fc-jammed',
                s.nope ? (s.nope % 2 ? 'fc-nope-a' : 'fc-nope-b') : '',
              )}
              style={{ ...geo.pos, '--pc': `var(--c-p${s.slot + 1})`, '--pt': `var(--c-tint-p${s.slot + 1})` }}
              onPointerDown={(e) => press(i, e)}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) press(i, e) }}
            >
              <span key={`sc${s.bump ?? 0}`} className={cn('fc-sc', s.bump && 'fc-bump')} data-score>{s.score}</span>
              <span className="fc-nm">{s.name}</span>
              {keys && <span className="fc-key">{s.bot ? 'BOT' : SEAT_KEYS[i] ? `KEY ${SEAT_KEYS[i].toUpperCase()}` : ''}</span>}
              <span className="fc-jam">BLOCKED</span>
            </button>
          )
        })}
      </div>

      {floats.map(f => (
        <div key={f.id} className="fc-float" style={{ '--pc': `var(--c-p${f.slot + 1})`, '--fr': `${f.a - 90}deg` }}>{f.text}</div>
      ))}

      {children}
    </div>
  )
})

export default FirstCutTable
