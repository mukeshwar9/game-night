// Pure mapping: game-night avatar id -> REEF RUN fish parts. Every field is a
// colour token NAME (resolved to a CSS variable by components/reefDraw.js),
// never a colour. No DOM, no Firebase, no React.
import { parseAvatar, TONES, SKIN_TONES, HAIR_STYLES, ACCESSORIES } from './avatars'

/** Fish sprite size in px (w, h) — matches the logic module's fish hitbox frame. */
export const FISH_SIZE = [18, 15]

/** Tone names a spec may use. 'white' is the REEF palette's neutral (bare bands / belly). */
export const FISH_TONES = [...TONES, 'white']

const toneOk = t => (t && t !== 'none' && TONES.includes(t)) ? t : null

/**
 * fishSpec(avatarId) -> { body, band, fin, belly, fin2, finTone, cap, acc }
 *   shirt -> body, pants -> band stripes, shoes -> tail + pectoral fin,
 *   skin (s1..s5) -> belly, hair style -> fin2 (dorsal fin), hairColor -> finTone,
 *   cap -> cap tone or null, accessory -> acc.
 * Total: any input yields a complete spec.
 */
export function fishSpec(avatarId) {
  let parsed
  try { parsed = parseAvatar(avatarId) } catch { parsed = null }
  const { tone, parts } = parsed || {}
  if (!parts) {
    const t = toneOk(tone) || 'p1'
    return { body: t, band: 'white', fin: t, belly: 'white', fin2: 'short', finTone: t, cap: null, acc: 'none' }
  }
  return {
    body: toneOk(parts.shirt) || 'p1',
    band: toneOk(parts.pants) || 'white',
    fin: toneOk(parts.shoes) || 'dim',
    belly: SKIN_TONES.includes(parts.skin) ? parts.skin : 's3',
    fin2: HAIR_STYLES.includes(parts.hair) ? parts.hair : 'none',
    finTone: toneOk(parts.hairColor) || 'text',
    cap: toneOk(parts.cap),
    acc: ACCESSORIES.includes(parts.acc) ? parts.acc : 'none',
  }
}
