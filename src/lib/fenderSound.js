import { sounds } from './sounds'

// One sim event ({ k, i, p? }) as its sound. Shared by the online room (host
// events and the guest's relayed ones) and the solo / one-phone page.
// 'hit' is a hard shove (closing speed over HARD_BUMP), 'bump' a soft one.
export function playFenderEvent(e) {
  switch (e.k) {
    case 'bump': sounds.fenderBump(false); break
    case 'hit': sounds.fenderBump(true); break
    case 'crash': sounds.fenderCrash(); break
    case 'wreck': sounds.fenderWreck(); break
    case 'fell': sounds.fenderSplash(); break
    case 'horn': sounds.fenderHorn(); break
    default: break
  }
}
