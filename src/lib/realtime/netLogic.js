// Pure network-fairness helpers for the host-authoritative real-time games:
// an RTT estimator, host input-delay equalisation, and stale-input expiry.
// No DOM, no timers, no WebRTC — the hooks own the clock and feed it in.
//
// ── Host input-delay equalisation (README #16) ────────────────────────────
// X is always the host and runs the one true sim, so without correction the
// host's own input lands in the sim instantly while the guest's arrives one
// network hop (≈ RTT/2) later — the host always wins close races (Sumo
// shoves, Air Hockey saves, Pong returns). Fix: measure RTT with a ping/pong
// over the data channel (host sends {t:'p', s}, guest echoes {t:'q', s}, the
// host's own clock on both ends so no clock sync is needed), smooth it with
// an EWMA, and push the host's own input through a delay line of ≈ RTT/2
// before it reaches the sim. Capped (HOST_DELAY_CAP_MS) so a terrible link
// never makes the host's controls feel broken; tick-driven games (Snake,
// Tron) skip it because their ≥100 ms tick quantisation already dwarfs a
// one-way hop. The delay line changes length one step at a time and never
// drops input: growing repeats the last latched value (or nothing for
// tap-style inputs); shrinking merges the two oldest samples.

export const HOST_DELAY_CAP_MS = 60
// Guest input frames older than this are dropped (see isInputStale).
export const STALE_INPUT_MS = 250
const EWMA_ALPHA = 1 / 8          // rising samples: TCP's SRTT smoothing weight
const EWMA_ALPHA_DOWN = 1 / 4     // falling samples: recover faster from a one-off spike
const MAX_SAMPLE_MS = 5000        // ignore absurd samples (tab was frozen)

/**
 * EWMA round-trip-time estimator. `value()` is null until the first sample.
 * Asymmetric: it falls faster than it rises, so one slow echo (e.g. the guest
 * tab busy right after connecting) doesn't over-delay the host for seconds.
 */
export function createRttEstimator({ alpha = EWMA_ALPHA, alphaDown = EWMA_ALPHA_DOWN } = {}) {
  let srtt = null
  return {
    add(sampleMs) {
      if (!Number.isFinite(sampleMs) || sampleMs < 0 || sampleMs > MAX_SAMPLE_MS) return srtt
      if (srtt == null) srtt = sampleMs
      else srtt += (sampleMs < srtt ? alphaDown : alpha) * (sampleMs - srtt)
      return srtt
    },
    value: () => srtt,
    reset() { srtt = null },
  }
}

/** One-way delay to impose on the host's own input: ≈ RTT/2, capped. */
export function hostInputDelayMs(rttMs, capMs = HOST_DELAY_CAP_MS) {
  if (rttMs == null || !Number.isFinite(rttMs) || rttMs <= 0) return 0
  return Math.min(capMs, rttMs / 2)
}

/** Convert a delay in ms into whole fixed-timestep sim steps. */
export function delaySteps(delayMs, dtSec) {
  if (!(delayMs > 0) || !(dtSec > 0)) return 0
  return Math.round(delayMs / (dtSec * 1000))
}

/** Latched inputs (paddle dir, target position): the newer sample wins. */
export const latestInput = (a, b) => b ?? a

/**
 * Tap-count inputs (Sumo's { press: N }) add up so no tap is lost when two
 * samples merge; anything else falls back to latestInput.
 */
export function mergeTapInput(a, b) {
  if (a && b && typeof a.press === 'number' && typeof b.press === 'number') {
    return { ...b, press: a.press + b.press }
  }
  return latestInput(a, b)
}

/**
 * Fixed-step input delay line. Call `push(input, targetSteps)` exactly once
 * per sim step; it returns the input to apply this step, `targetSteps` steps
 * late once the line has filled.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.latched=true]  true: while growing, repeat the last
 *   released value (continuous inputs). false: release null (tap inputs must
 *   not be applied twice).
 * @param {(a:any,b:any)=>any} [opts.merge]  combines two samples when the
 *   line shrinks (default latestInput). Inputs with edge-triggered flags
 *   (Space Duel's `fire`) must OR them here or a shot can vanish.
 * @param {(last:any)=>any} [opts.hold]  value released while growing;
 *   overrides `latched` (e.g. repeat the last sample with `fire` cleared).
 */
export function createDelayLine({ latched = true, merge = latestInput, hold } = {}) {
  const q = []
  let last = null
  const holdValue = hold || (latched ? (v) => v : () => null)
  return {
    push(input, targetSteps) {
      const target = Math.max(0, targetSteps | 0)
      q.push(input)
      if (q.length <= target) return holdValue(last)          // growing: hold
      if (q.length > target + 1) {                            // shrinking: one step per push
        const a = q.shift()
        q[0] = merge(a, q[0])
      }
      last = q.shift()
      return last
    },
    reset() { q.length = 0; last = null },
    size: () => q.length,
  }
}

/** True when a continuous guest input hasn't been refreshed recently enough. */
export function isInputStale(lastAt, now, maxAgeMs = STALE_INPUT_MS) {
  return !(lastAt > 0) || now - lastAt > maxAgeMs
}
