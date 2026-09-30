// WIRE CROSSED: choose a mode. Either seated player taps a card to propose it;
// the other accepts or declines (docs/prds/wire-crossed-modes.md §3.4). The
// page owns the transactions; this only renders the state and reports taps.
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { MODE_IDS, modeSummary } from '../../lib/wire/modes'

/**
 * @param {{
 *   wire: any, mySymbol: 'X'|'O'|null, players: any,
 *   onPropose: (mode: string) => void, onAccept: () => void, onCancel: () => void,
 *   proposing: boolean, accepting: boolean, cancelling: boolean,
 * }} props
 */
export default function ModePicker({
  wire, mySymbol, players, onPropose, onAccept, onCancel, proposing, accepting, cancelling,
}) {
  const [pendingMode, setPendingMode] = useState(null)
  const spectator = !mySymbol
  const proposal = wire.modeProposal
  const proposalName = proposal && MODE_IDS.includes(proposal.mode) ? modeSummary(proposal.mode).name : null
  const mine = proposal?.by === mySymbol
  const who = players?.[proposal?.by]?.name || proposal?.by
  const busy = proposing || accepting || cancelling

  return (
    <div className="space-y-2 text-left" role="group" aria-label="Mode">
      <p className="text-center font-pixel text-[9px] text-retro-dim tracking-widest">
        {spectator ? 'THE PLAYERS ARE CHOOSING A MODE' : 'PICK A MODE · YOUR PARTNER CONFIRMS'}
      </p>

      {proposalName && (
        <div className="rounded border-2 border-retro-cta bg-retro-tint-cta p-2 space-y-2" role="status">
          <p className="text-center font-pixel text-[10px] text-retro-cta tracking-wider">
            {mine ? `YOU PROPOSED ${proposalName}` : `${String(who).toUpperCase()} PROPOSES ${proposalName}`}
          </p>
          {!spectator && (mine ? (
            <div className="flex gap-2">
              <span className="flex-1 flex items-center justify-center font-pixel text-[9px] text-retro-dim arcade-blink">WAITING…</span>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 min-h-11 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] tracking-wider hover:border-retro-p1/60 disabled:opacity-50"
              >{cancelling ? 'CANCELLING…' : 'CANCEL'}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAccept}
                disabled={busy}
                className="flex-1 min-h-11 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-wider hover:shadow-neon-cta disabled:opacity-50"
              >{accepting ? 'ACCEPTING…' : 'ACCEPT'}</button>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 min-h-11 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] tracking-wider hover:border-retro-p1/60 disabled:opacity-50"
              >{cancelling ? 'DECLINING…' : 'DECLINE'}</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        {MODE_IDS.map(mode => {
          const s = modeSummary(mode)
          const current = wire.mode === mode
          const proposed = proposal?.mode === mode
          const counts = [...new Set(s.moduleCounts)]
          return (
            <button
              key={mode}
              type="button"
              disabled={spectator || busy || current}
              onClick={() => { setPendingMode(mode); onPropose(mode) }}
              aria-pressed={proposed}
              className={cn(
                'w-full min-h-11 rounded border-2 px-3 py-2 text-left disabled:opacity-60',
                proposed ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border bg-retro-deep hover:border-retro-cta',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-pixel text-[11px] text-retro-text tracking-widest">{s.name}</span>
                <span className="font-pixel text-[8px] text-retro-dim tracking-wider">
                  {proposing && pendingMode === mode ? 'PROPOSING…' : current ? 'CURRENT' : `${s.levels} LEVELS`}
                </span>
              </span>
              <span className="block font-mono text-[10px] text-retro-dim leading-snug">
                {counts.length === 1 ? `${counts[0]} modules per bomb` : `${counts[0]} to ${counts[counts.length - 1]} modules per bomb`}
                {s.modifiersFrom ? ` · modifiers from level ${s.modifiersFrom}` : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
