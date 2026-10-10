import useGameKeys from '../../hooks/useGameKeys'
import { SOLO_LIVES } from '../../lib/memorySoloLogic'
import { canChallenge } from '../../lib/soloChallengeLogic'
import ChallengeButton from '../ChallengeButton'

// Shared chrome for every memory solo run: the score strip, the start gate, the
// slip note and TRY AGAIN, and the run-over card.

// Score + best + lives strip shared by every run.
export function RunHeader({ scoreLabel, score, best, lives = null }) {
  return (
    <div className="flex items-center justify-between rounded border border-retro-border bg-retro-surface px-3 py-2 font-pixel text-[9px]">
      <span className="text-retro-text">{scoreLabel} <span className="text-retro-cta text-glow-cta">{score}</span></span>
      {lives !== null && (
        <span className="flex items-center gap-1" aria-label={`${lives} of ${SOLO_LIVES} lives left`}>
          {Array.from({ length: SOLO_LIVES }, (_, i) => (
            <span key={i} aria-hidden="true" className={i < lives ? 'text-retro-danger' : 'text-retro-border'}>♥</span>
          ))}
        </span>
      )}
      <span className="text-retro-dim">BEST {best}</span>
    </div>
  )
}

// `type` turns on the CHALLENGE A FRIEND button for a new personal best (never on
// DAILY MEMORY's single try).
export function RunOver({ type, result, score, unit, isNewBest, onRestart, single = false }) {
  return (
    <div className="space-y-3 text-center" role="status">
      <p className="font-pixel text-[10px] text-retro-text">{result}</p>
      <p className="font-pixel text-base text-retro-cta text-glow-cta">{score} {unit}</p>
      {isNewBest && <p className="font-pixel text-[9px] text-retro-win text-glow-win">NEW PERSONAL BEST!</p>}
      {type && !single && canChallenge({ isNewBest, score }) && (
        <ChallengeButton type={type} score={score} unit={unit} />
      )}
      {!single && (
        <button
          type="button"
          onClick={onRestart}
          className="px-6 py-2.5 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta press"
        >
          PLAY AGAIN
        </button>
      )}
    </div>
  )
}

// Every run waits for a tap before its first reveal: the reveal used to start the
// instant the page or chip loaded, while the player was still looking for the board.
// Space or Enter also starts it.
export function StartGate({ title, how, onStart }) {
  useGameKeys((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return false
    onStart()
    return true
  })
  return (
    <div className="min-h-[18rem] flex flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-retro-border bg-retro-surface p-6 text-center">
      <p className="font-pixel text-[10px] text-retro-text">{title}</p>
      <p className="font-pixel text-[8px] text-retro-dim leading-relaxed max-w-[17rem]">{how}</p>
      <button
        type="button"
        onClick={onStart}
        className="px-8 py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta press"
      >
        TAP TO START
      </button>
    </div>
  )
}

// One line under the header that is always there (empty or not), so a message
// appearing never pushes the board down mid-reveal.
export function RunNote({ children }) {
  return (
    <p className="font-pixel text-[8px] text-center text-retro-danger min-h-[1.5em] leading-relaxed" aria-live="polite">
      {children}
    </p>
  )
}

// After a slip the board holds on the mistake; the next deal waits for this tap.
export function ContinueButton({ lives, onContinue }) {
  return (
    <button
      type="button"
      onClick={onContinue}
      className="w-full py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta press"
    >
      TRY AGAIN · {lives} {lives === 1 ? 'LIFE' : 'LIVES'} LEFT
    </button>
  )
}


