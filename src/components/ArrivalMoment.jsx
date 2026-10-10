import { arrivalCopy } from '../lib/arrivalLogic'

// "SLEEPY PICKLE IS HERE!" and the 3·2·1 before a duel's first move. Driven by
// the room's `startsAt` server timestamp (useArrival), so both players see the
// same number. It never takes a tap: moves wait for the countdown in Game.jsx,
// and this only announces why. A fixed layer, so the board does not shift and
// the focus stage is covered too; reduced motion shows the numbers without the
// pop (the app-wide freeze).
export default function ArrivalMoment({ state, mySeat, players, currentTurn }) {
  if (!state) return null
  const { title, sub } = arrivalCopy({ mySeat, players, currentTurn })
  return (
    <div
      data-testid="arrival-moment"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-3 px-6 pointer-events-none bg-retro-bg/70"
    >
      {state.showBanner && (
        <div className="seat-pop max-w-full rounded border-2 border-retro-cta bg-retro-card px-4 py-3 text-center shadow-neon-cta">
          <p data-testid="arrival-title" className="font-pixel text-[12px] text-retro-cta text-glow-cta tracking-wider break-words">{title}</p>
          <p className="mt-1.5 font-pixel text-[8px] tracking-wider text-retro-dim">{sub}</p>
        </div>
      )}
      <span
        key={state.count}
        data-testid="arrival-count"
        aria-label={`Starting in ${state.count}`}
        className="arrival-count font-pixel text-[56px] leading-none text-retro-text text-glow-cta"
      >
        {state.count}
      </span>
    </div>
  )
}
