import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { STEP_MS, getRuleMedia, lookFor, stepCaption, stepIndex, stillPath } from '../lib/ruleMediaLogic'

const reducedQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)')

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => { try { return reducedQuery().matches } catch { return false } })
  useEffect(() => {
    let mq
    try { mq = reducedQuery() } catch { return }
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

// The stills were captured in a light and a dark look; show the one nearer
// the active theme.
function currentLook() {
  try { return lookFor(getComputedStyle(document.documentElement).getPropertyValue('--c-bg')) } catch { return 'dark' }
}

// Step carousel for the HOW TO PLAY sheet: a real still of the game per step,
// a highlight box on the part the caption talks about, and the caption taken
// from the game's own rules text. Autoplays, with a control to stop it;
// prefers-reduced-motion never autoplays. Renders nothing for games without
// captured stills, so their sheet stays as it was.
export default function RuleMedia({ gameType, rules }) {
  const media = getRuleMedia(gameType)
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(true)
  const [look] = useState(currentLook)
  const count = media?.steps.length ?? 0
  const playing = autoplay && !reduced && count > 1

  // Re-armed after every step change, so a manual tap gets a full step's time.
  const timer = useRef(null)
  useEffect(() => {
    if (!playing) return
    timer.current = setTimeout(() => setIndex(i => stepIndex(i, count, 1)), STEP_MS)
    return () => clearTimeout(timer.current)
  }, [playing, index, count])

  if (!media) return null
  const step = media.steps[index]
  const caption = stepCaption(rules, step.cap)
  const go = dir => setIndex(i => stepIndex(i, count, dir))

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Step by step"
      className="space-y-2"
    >
      <div className="relative mx-auto w-fit max-w-full rounded border-2 border-retro-border overflow-hidden bg-retro-surface">
        <img
          key={`${look}-${index}`}
          src={`${import.meta.env.BASE_URL}${stillPath(gameType, look, index + 1)}`}
          width={media.w}
          height={media.h}
          alt={caption}
          decoding="async"
          className="block max-h-[30vh] w-auto max-w-full"
        />
        {step.box && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-sm border-2 border-retro-cta shadow-neon-cta"
            style={{ left: `${step.box.x}%`, top: `${step.box.y}%`, width: `${step.box.w}%`, height: `${step.box.h}%` }}
          />
        )}
      </div>

      <p
        aria-live={playing ? 'off' : 'polite'}
        className="min-h-[3.25em] font-mono text-[11px] leading-relaxed text-retro-text text-center"
      >
        {caption}
      </p>

      {count > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => go(-1)}
            aria-label="Previous step"
            className="font-pixel text-[10px] text-retro-dim hover:text-retro-text p-3 -m-1 transition-colors"
          >
            ‹
          </button>
          <div className="flex items-center gap-1" role="group" aria-label="Choose a step">
            {media.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Step ${i + 1} of ${count}`}
                aria-current={i === index ? 'step' : undefined}
                className="p-2 -m-0.5"
              >
                <span className={cn('block h-2 w-2 rounded-full transition-colors', i === index ? 'bg-retro-cta' : 'bg-retro-border')} />
              </button>
            ))}
          </div>
          <button
            onClick={() => go(1)}
            aria-label="Next step"
            className="font-pixel text-[10px] text-retro-dim hover:text-retro-text p-3 -m-1 transition-colors"
          >
            ›
          </button>
          {!reduced && (
            <button
              onClick={() => setAutoplay(a => !a)}
              aria-pressed={autoplay}
              className="ml-2 font-pixel text-[8px] tracking-widest text-retro-dim hover:text-retro-text border-2 border-retro-border rounded px-2 py-1.5 transition-colors"
            >
              {autoplay ? '❚❚ STOP AUTOPLAY' : '▶ AUTOPLAY'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
