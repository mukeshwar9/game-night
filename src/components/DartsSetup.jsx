import { START_SCORES } from '../lib/dartsLogic'
import { cn } from '@/lib/utils'

// How a STEADY HAND leg is set up: the game, the start score, how you throw,
// legs and Nerves. One panel for the room lobby (host picks once for the room,
// because the two throws are not equally hard) and the same-phone page.

function Seg({ label, value, options, onChange, disabled }) {
  return (
    <div className="space-y-1">
      <p className="font-pixel text-[8px] tracking-widest text-retro-dim">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr overflow-hidden rounded border border-retro-border">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              'min-h-11 border-r border-retro-border px-1 font-pixel text-[8px] transition-colors last:border-r-0 disabled:opacity-60',
              value === v ? 'bg-retro-tint-cta text-retro-cta' : 'bg-retro-card text-retro-dim hover:text-retro-text',
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function DartsSetup({ cfg, onChange, disabled = false }) {
  const x01 = cfg.mode === 'x01'
  return (
    <div className="space-y-3 rounded border border-retro-border bg-retro-card p-3 text-left">
      <Seg
        label="GAME"
        value={cfg.mode}
        disabled={disabled}
        onChange={(mode) => onChange({ mode })}
        options={[['x01', 'COUNTDOWN'], ['turf', 'TURF']]}
      />
      <p className="font-mono text-[10px] leading-relaxed text-retro-dim">
        {x01
          ? 'Count down from the start score to exactly zero. Go past zero and the visit busts.'
          : 'No sums: hit a wedge to claim it. A double locks it, a treble takes the neighbours too.'}
      </p>
      {x01 && (
        <Seg
          label="START SCORE"
          value={cfg.start}
          disabled={disabled}
          onChange={(start) => onChange({ start })}
          options={START_SCORES.map((n) => [n, String(n)])}
        />
      )}
      <Seg
        label="HOW DO YOU THROW?"
        value={cfg.ctrl}
        disabled={disabled}
        onChange={(ctrl) => onChange({ ctrl })}
        options={[['aim', 'STEADY AIM'], ['one', 'ONE BUTTON']]}
      />
      <p className="font-mono text-[10px] leading-relaxed text-retro-dim">
        {cfg.ctrl === 'aim'
          ? 'Hold on the board, drag to aim, let go when the shake ring is small.'
          : 'Tap to lock across, tap again to lock up and down, and the dart flies.'}
      </p>
      {x01 && (
        <Seg
          label="LEGS"
          value={cfg.legs}
          disabled={disabled}
          onChange={(legs) => onChange({ legs })}
          options={[[1, 'ONE LEG'], [3, 'BEST OF 3']]}
        />
      )}
      <Seg
        label="NERVES"
        value={cfg.nerves}
        disabled={disabled}
        onChange={(nerves) => onChange({ nerves })}
        options={[[true, 'ON'], [false, 'OFF']]}
      />
      <p className="font-mono text-[10px] leading-relaxed text-retro-dim">
        {cfg.nerves ? 'The leader’s hand shakes more; whoever is furthest behind is calmer.' : 'Everyone has the same steady hand.'}
      </p>
    </div>
  )
}
