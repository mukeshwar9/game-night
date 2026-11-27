// @ts-check
/**
 * "FIRST TO 7 · POWER-UPS" -> "First to 7 · power-ups". Game copy is stored in
 * capitals for the pixel face; sentences are set in the mono body face, where
 * all-caps is hard to read, so they are lowered at the point of display.
 * @param {string | null | undefined} text
 */
export function sentenceCase(text) {
  const s = String(text ?? '').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
