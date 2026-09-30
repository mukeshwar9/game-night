// WIRE CROSSED Tech panel: PATCH BAY. Plugs on the left, sockets on the right.
// Tap a plug, then a free socket to patch it; tap a patched plug and UNPLUG to
// pull it out. Cables are drawn in patch order, so a later cable renders on
// top of an earlier one; each cable's aria-label lists what lies on it.
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { COLOR_LETTERS, COLOR_NAMES, coveredBy, patchState } from '../../../lib/wireLogic'
import { wireColor } from '../colors'

const ROW = 56

export default function PatchPanel({ module, wire, index, onAction, disabled, busy }) {
  const { plugs } = module.device
  const n = plugs.length
  const { links, stack } = patchState(wire, index, module)
  const [selected, setSelected] = useState(null)
  const holder = (socket) => Object.keys(links).map(Number).find(p => links[p] === socket)
  const letter = (plug) => COLOR_LETTERS[plugs[plug]]
  const y = (k) => k * ROW + ROW / 2

  const pickPlug = (plug) => setSelected(selected === plug ? null : plug)
  const pickSocket = (socket) => {
    if (selected == null || selected in links) return
    const plug = selected
    setSelected(null)
    onAction({ mod: index, kind: 'patch', plug, socket })
  }
  const unplug = () => {
    if (selected == null || !(selected in links)) return
    const plug = selected
    setSelected(null)
    onAction({ mod: index, kind: 'unplug', plug })
  }
  const canUnplug = selected != null && selected in links

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="grid w-full max-w-[20rem]"
        style={{ gridTemplateColumns: '4.5rem 1fr 4.5rem', gridTemplateRows: `repeat(${n}, ${ROW}px)` }}
        role="group"
        aria-label={`Patch bay, ${n} plugs`}
      >
        {plugs.map((color, plug) => (
          <button
            key={`plug-${plug}`}
            type="button"
            disabled={disabled}
            aria-pressed={selected === plug}
            aria-label={`Plug ${letter(plug)}, ${COLOR_NAMES[color].toLowerCase()}, ${plug in links ? `patched to ${links[plug] + 1}` : 'free'}`}
            onClick={() => pickPlug(plug)}
            className={cn(
              'my-1 rounded border-2 flex items-center justify-center gap-1.5 bg-retro-deep font-pixel text-[9px] text-retro-text hover:border-retro-cta disabled:opacity-40',
              selected === plug ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border',
            )}
            style={{ gridColumn: 1, gridRow: plug + 1 }}
          >
            <span className="inline-block w-3 h-3 rounded-sm border border-retro-border" style={{ background: wireColor(color) }} aria-hidden="true" />
            {letter(plug)}
          </button>
        ))}
        <svg
          viewBox={`0 0 100 ${n * ROW}`}
          preserveAspectRatio="none"
          className="w-full h-full pointer-events-none"
          style={{ gridColumn: 2, gridRow: `1 / ${n + 1}` }}
        >
          {stack.map(plug => {
            const over = coveredBy(links, stack, plug)
            const d = `M0,${y(plug)} C50,${y(plug)} 50,${y(links[plug])} 100,${y(links[plug])}`
            return (
              <g
                key={plug}
                role="img"
                aria-label={`Cable ${letter(plug)} to ${links[plug] + 1}${over.length ? `, under ${over.map(letter).join(' and ')}` : ''}`}
              >
                <path d={d} fill="none" strokeLinecap="round" style={{ stroke: 'rgb(var(--c-border))', strokeWidth: 9, vectorEffect: 'non-scaling-stroke' }} />
                <path d={d} fill="none" strokeLinecap="round" style={{ stroke: wireColor(plugs[plug]), strokeWidth: 5, vectorEffect: 'non-scaling-stroke' }} />
              </g>
            )
          })}
        </svg>
        {Array.from({ length: n }).map((_, socket) => {
          const at = holder(socket)
          return (
            <button
              key={`socket-${socket}`}
              type="button"
              disabled={disabled || at !== undefined || selected == null || selected in links}
              aria-label={`Socket ${socket + 1}, ${at === undefined ? 'empty' : `holds ${letter(at)}`}`}
              onClick={() => pickSocket(socket)}
              className={cn(
                'my-1 rounded border-2 flex items-center justify-center gap-1.5 bg-retro-deep font-pixel text-[9px] hover:border-retro-cta disabled:hover:border-retro-border',
                at === undefined ? 'border-retro-border text-retro-dim' : 'border-retro-border text-retro-text',
                selected != null && !(selected in links) && at === undefined && 'border-retro-cta text-retro-cta',
              )}
              style={{ gridColumn: 3, gridRow: socket + 1 }}
            >
              {socket + 1}
              {at !== undefined && <span className="inline-block w-3 h-3 rounded-sm border border-retro-border" style={{ background: wireColor(plugs[at]) }} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <p className="font-pixel text-[8px] text-retro-dim text-center" aria-live="polite">
        {busy ? 'PATCHING…'
          : selected == null ? 'TAP A PLUG'
            : canUnplug ? `${letter(selected)} IS PATCHED · UNPLUG IT?`
              : `TAP A SOCKET FOR ${letter(selected)}`}
      </p>
      {(module.tier ?? 1) >= 3 && (
        <p className="font-pixel text-[7px] text-retro-dim text-center">
          A CABLE UNDER ANOTHER CABLE WILL NOT COME OUT · UNPLUG THE TOP ONE FIRST
        </p>
      )}
      <button
        type="button"
        disabled={disabled || busy || !canUnplug}
        onClick={unplug}
        className="min-h-11 px-4 rounded border-2 border-retro-border bg-retro-deep font-pixel text-[9px] text-retro-text hover:border-retro-cta disabled:opacity-40"
      >
        {busy ? 'PATCHING…' : 'UNPLUG'}
      </button>
    </div>
  )
}
