// Melodic clear streak for Arrows: each consecutive clear walks a C-major
// pentatonic scale up two octaves and back down (ping-pong, no repeated end
// notes), so a long streak keeps sounding like progress instead of saturating.

export const ARROWS_PENTATONIC = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760]

// Frequency (Hz) for the clear at `streak` (0 = first of the streak).
export function melodicNote(streak) {
  const n = ARROWS_PENTATONIC.length
  const s = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0
  const period = 2 * n - 2
  const k = s % period
  return ARROWS_PENTATONIC[k < n ? k : period - k]
}
