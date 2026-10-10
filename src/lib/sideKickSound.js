import { sounds } from './sounds'
import { getAudioContext } from './audioContext'

// One sim event as its sound, from the point of view of rider `me` (the one on
// this phone). Shared by the solo page and the online Racer. Events that do not
// involve `me` stay quiet, except a far-off kick that is only a light thud.
export function playSideKickEvent(ev, me) {
  switch (ev.t) {
    case 'go': sounds.sideKickGo(); break
    case 'swing': if (ev.by === me) sounds.sideKickSwing(); break
    case 'hit':
      if (ev.by === me) sounds.sideKickHit()
      else if (ev.to === me) sounds.sideKickHurt()
      break
    case 'down':
      if (ev.to === me) sounds.sideKickFall()
      else if (ev.by === me) sounds.sideKickPop()
      break
    case 'ghostdown': if (ev.by === me) sounds.sideKickPop(); break
    case 'boost': if (ev.by === me) sounds.sideKickBoost(); break
    case 'up': if (ev.to === me) sounds.sideKickUp(!!ev.catchUp); break
    case 'oil': if (ev.to === me) sounds.sideKickOil(); break
    case 'finish': if (ev.to === me) sounds.sideKickFinish(); break
    case 'payback': if (ev.by === me) sounds.sideKickPop(); break
    default: break
  }
}

/**
 * The engine hum: a low saw whose pitch follows speed. It lives on the shared
 * audio context (so the SOUND switch and the browser's gesture gate apply) and
 * is built on the first update after the player has tapped something.
 */
export function createEngineHum() {
  let osc = null
  let gain = null
  let dead = false
  const build = () => {
    const c = getAudioContext()
    if (!c || dead) return false
    try {
      osc = c.createOscillator(); osc.type = 'sawtooth'
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420
      gain = c.createGain(); gain.gain.value = 0
      osc.connect(f); f.connect(gain); gain.connect(c.destination); osc.start()
      return true
    } catch { dead = true; return false }
  }
  return {
    /** @param {{ speed: number, boosting?: boolean, wobble?: boolean, live: boolean, time: number }} s speed is 0..1 of top */
    update({ speed, boosting = false, wobble = false, live, time }) {
      if (!osc && !build()) return
      const c = getAudioContext()
      if (!c || !osc || !gain) return
      const loud = live && !sounds.isMuted() ? sounds.getVolume() : 0
      gain.gain.setTargetAtTime((0.018 + speed * 0.02) * loud, c.currentTime, 0.05)
      osc.frequency.setTargetAtTime(48 + speed * 115 + (boosting ? 30 : 0) + (wobble ? Math.sin(time * 40) * 12 : 0), c.currentTime, 0.04)
    },
    stop() {
      dead = true
      try { gain?.gain.setValueAtTime(0, 0); osc?.stop() } catch { /* already stopped */ }
      osc = null; gain = null
    },
  }
}
