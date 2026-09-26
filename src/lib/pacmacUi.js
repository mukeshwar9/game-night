// PAC MAC view helpers shared by the live page and the solo demo (sound
// mapping, input-device sniffing, the one-line rules). Not game logic — that
// lives in pacmacLogic.js.
import { sounds } from './sounds'

export const PACMAC_RULES_LINE = 'EAT MORE PELLETS THAN YOUR RIVAL. POWER PELLETS LET YOU EAT GHOSTS — AND YOUR RIVAL.'

let lastPelletAt = 0

/** Play the sound for one sim event. Pellet ticks only for your own muncher. */
export function playPacmacSfx(event, mySide) {
  const mine = event.by === mySide
  switch (event.type) {
    case 'pellet': {
      if (!mine) return
      const now = performance.now()
      if (now - lastPelletAt < 70) return
      lastPelletAt = now
      sounds.step()
      return
    }
    case 'power': sounds.join(); return
    case 'eatGhost': sounds.hit(1); return
    case 'eatRival': sounds.hit(3); return
    case 'die': if (mine) sounds.miss(); else sounds.wall(); return
    case 'warn': sounds.bell(); return
    default:
  }
}

export function isCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}
